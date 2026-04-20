# Endpoints:
# POST /api/v1/analyse
#     Main endpoint: runs the full 7-step pipeline for a portfolio and returns PortfolioAnalysisResponse.

# POST /api/v1/sessions
#     Register a portfolio for background recalculation and returns a session_id.

# GET  /api/v1/sessions/{session_id}
#     Poll for the latest analysis for a registered session.

# DELETE /api/v1/sessions/{session_id}
#     Unregister a session.

# GET  /api/v1/health
#     Health check: returns app status + model readiness.

# POST /api/v1/train
#     Manually trigger ML model retraining.

# GET  /api/v1/market/{symbol}
#     Fetch the current market snapshot for a symbol.


from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager
from typing     import Annotated

from fastapi            import FastAPI, HTTPException, Depends, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses  import JSONResponse
from loguru             import logger

from backend.config         import get_settings
from backend.pipeline       import PortfolioPipeline
from backend.scheduler      import MarketScheduler, SessionStore
from backend.models.schemas import (
    PortfolioInput, PortfolioAnalysisResponse, MarketSnapshot,
)
from backend.utils.helpers  import configure_logging
import backend.auth as auth_store
from pydantic import BaseModel as _BM

pipeline:   PortfolioPipeline | None = None
scheduler:  MarketScheduler   | None = None
sessions:   SessionStore      | None = None


# Lifespan (startup + shutdown)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs setup before the app starts accepting requests and teardown when it shuts down.
    global pipeline, scheduler, sessions
    configure_logging()
    settings = get_settings()
    logger.info(f"Starting {settings.app_name} (env={settings.app_env})")

    pipeline  = PortfolioPipeline()
    sessions  = SessionStore()

    # Scheduler wires the pipeline + ML layer together
    scheduler = MarketScheduler(
        pipeline=pipeline.market_pipeline,
        ml_layer=pipeline.ml_layer,
        analyse_fn=pipeline.analyse,
        session_store=sessions,
    )
    await scheduler.start()

    logger.info("Application ready ✓")
    yield 

    # Shutdown
    logger.info("Shutting down...")
    await scheduler.stop()


# App Factory
def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="PortfolioPilot API",
        description=(
            "AI-powered portfolio risk analysis and recommendation engine.\n\n"
            "Full pipeline: Market Data → Risk Engine → Feature Engineering → "
            "ML Models → Risk Scoring → Recommendations."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    origins = ["http://localhost:5173"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return app


app = create_app()

# Dependency Injectors
def get_pipeline() -> PortfolioPipeline:
    if pipeline is None:
        raise HTTPException(503, "Pipeline not ready")
    return pipeline


def get_sessions() -> SessionStore:
    if sessions is None:
        raise HTTPException(503, "Session store not ready")
    return sessions


PipelineDep = Annotated[PortfolioPipeline, Depends(get_pipeline)]
SessionsDep = Annotated[SessionStore,      Depends(get_sessions)]


# Routes

# Health
@app.get("/api/v1/health", tags=["System"])
async def health_check(p: PipelineDep):
    # Returns the health status of the application.
    return {
        "status":       "ok",
        "models_ready": p.ml_layer.models_ready,
        "active_sessions": sessions.active_count if sessions else 0,
        "timestamp":    time.time(),
    }


# Core Analysis
@app.post(
    "/api/v1/analyse",
    response_model=PortfolioAnalysisResponse,
    tags=["Analysis"],
    summary="Analyse a portfolio",
    description=(
        "Run the full PortfolioPilot pipeline:\n"
        "1. Fetch / use cached market data\n"
        "2. Compute portfolio risk metrics (VaR, Sharpe, Greeks)\n"
        "3. Engineer ML features\n"
        "4. Predict returns + volatility\n"
        "5. Score overall risk (0–100)\n"
        "6. Generate actionable recommendations\n"
    ),
)
async def analyse_portfolio(
    body: PortfolioInput,
    p:    PipelineDep,
) -> PortfolioAnalysisResponse:
    # Main endpoint.  Accepts a portfolio and returns a full analysis.
    try:
        result = await p.analyse(body)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception(f"Analysis failed: {e}")
        raise HTTPException(status_code=500, detail="Internal analysis error")


# Sessions

@app.post(
    "/api/v1/sessions",
    tags=["Sessions"],
    summary="Register portfolio for live updates",
)
async def create_session(
    body:  PortfolioInput,
    p:     PipelineDep,
    store: SessionsDep,
):
    # Register a portfolio for background recalculation. The scheduler will periodically re-analyse this portfolio and store the latest result
    session_id = str(uuid.uuid4())
    store.register(session_id, body)

    # Run first analysis immediately
    try:
        result = await p.analyse(body)
        store.update(session_id, result)
    except Exception as e:
        logger.warning(f"Initial analysis failed for session {session_id}: {e}")

    return {"session_id": session_id, "status": "registered"}


@app.get(
    "/api/v1/sessions/{session_id}",
    tags=["Sessions"],
    summary="Get latest analysis for a session",
)
async def get_session(
    session_id: Annotated[str, Path(description="Session ID from POST /sessions")],
    store:      SessionsDep,
):
    # Returns the most recent analysis result for a registered session.
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["last_analysis"] is None:
        raise HTTPException(status_code=202, detail="Analysis in progress")
    # Return the analysis dict augmented with updated_at
    analysis = session["last_analysis"]
    result = analysis.model_dump() if hasattr(analysis, "model_dump") else dict(analysis)
    result["updated_at"] = session["updated_at"]
    return JSONResponse(content=result)


@app.post(
    "/api/v1/sessions/{session_id}/refresh",
    tags=["Sessions"],
    summary="Force an immediate recalculation for a live session",
)
async def refresh_session(
    session_id: Annotated[str, Path(description="Session ID from POST /sessions")],
    p:     PipelineDep,
    store: SessionsDep,
):
    # Triggers an immediate pipeline run for the given session and stores the result so the next GET /sessions/{id} returns fresh data.
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        result = await p.analyse(session["portfolio"])
        store.update(session_id, result)
        return {"status": "refreshed", "updated_at": store.get(session_id)["updated_at"]}
    except Exception as e:
        logger.exception(f"On-demand refresh failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Refresh failed")


@app.delete(
    "/api/v1/sessions/{session_id}",
    tags=["Sessions"],
    summary="Unregister a session",
)
async def delete_session(
    session_id: Annotated[str, Path()],
    store:      SessionsDep,
):
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    store.remove(session_id)
    return {"status": "removed"}


# Market Data 

@app.get(
    "/api/v1/market/{symbol}",
    response_model=MarketSnapshot,
    tags=["Market Data"],
    summary="Get market snapshot for a symbol",
)
async def get_market_snapshot(
    symbol: Annotated[str, Path(description="Ticker symbol e.g. AAPL")],
    p:      PipelineDep,
):
    # Returns the latest cached market snapshot for a symbol.
    try:
        snap = await p.market_pipeline.get_snapshot(symbol.upper())
        return snap
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Market snapshot error for {symbol}: {e}")
        raise HTTPException(status_code=500, detail="Market data fetch failed")


# ML Training 
@app.post(
    "/api/v1/train",
    tags=["ML"],
    summary="Trigger ML model retraining",
)
async def trigger_training(p: PipelineDep):
    # Manually trigger retraining of the return + volatility prediction models.
    # Fetches training data for all watchlist symbols first.
    from backend.scheduler.market_updater import DEFAULT_WATCHLIST
    try:
        snapshots = await p.market_pipeline.get_snapshots(DEFAULT_WATCHLIST)
        metrics   = await p.ml_layer.train_all(snapshots)
        return {"status": "trained", "metrics": metrics}
    except Exception as e:
        logger.exception(f"Training failed: {e}")
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


# Entry point
if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=(settings.app_env == "development"),
        log_level=settings.log_level.lower(),
    )

# Auth & History
class _AuthBody(_BM):
    username: str
    password: str

class _HistorySaveBody(_BM):
    user_id: str
    portfolio: dict
    summary: dict

@app.post("/api/v1/auth/register", tags=["Auth"], summary="Register a new user")
async def register(body: _AuthBody):
    user, err = auth_store.register_user(body.username, body.password)
    if err:
        raise HTTPException(status_code=400, detail=err)
    return user

@app.post("/api/v1/auth/login", tags=["Auth"], summary="Login")
async def login(body: _AuthBody):
    user, err = auth_store.login_user(body.username, body.password)
    if err:
        raise HTTPException(status_code=401, detail=err)
    return user

@app.post("/api/v1/history", tags=["History"], summary="Save an analysis to history")
async def save_history(body: _HistorySaveBody):
    entry = auth_store.save_analysis(body.user_id, body.portfolio, body.summary)
    return entry

@app.get("/api/v1/history/{user_id}", tags=["History"], summary="Get user analysis history")
async def get_history(user_id: str):
    return auth_store.get_history(user_id)
