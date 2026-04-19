
# Market Updater

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing   import Any, Optional, Callable, Awaitable
from loguru   import logger

from apscheduler.schedulers.asyncio   import AsyncIOScheduler
from apscheduler.triggers.interval    import IntervalTrigger

from backend.config import get_settings

# In-memory Session Storage

class SessionStore:

    def __init__(self):
        self._store: dict[str, dict] = {}

    def register(self, session_id: str, portfolio: Any) -> None:
        self._store[session_id] = {
            "portfolio":     portfolio,
            "last_analysis": None,
            "updated_at":    datetime.now(timezone.utc).isoformat(),
        }
        logger.info(f"Session registered: {session_id}")

    def update(self, session_id: str, analysis: Any) -> None:
        if session_id in self._store:
            self._store[session_id]["last_analysis"] = analysis
            self._store[session_id]["updated_at"]    = datetime.now(timezone.utc).isoformat()

    def get(self, session_id: str) -> Optional[dict]:
        return self._store.get(session_id)

    def get_all_portfolios(self) -> list[tuple[str, Any]]:
        return [
            (sid, s["portfolio"])
            for sid, s in self._store.items()
            if s["portfolio"] is not None
        ]

    def remove(self, session_id: str) -> None:
        self._store.pop(session_id, None)
        logger.info(f"Session removed: {session_id}")

    @property
    def active_count(self) -> int:
        return len(self._store)

# Scheduler


# Watchlist
DEFAULT_WATCHLIST = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    "BRK-B", "JPM", "V", "SPY", "QQQ", "GLD", "TLT",    # ETFs for hedging
]


class MarketScheduler:
  
    def __init__(
        self,
        pipeline:    Any,      # MarketDataPipeline
        ml_layer:    Any,      # MLModelLayer
        analyse_fn:  Callable[..., Awaitable[Any]],  # portfolio analyse
        session_store: SessionStore,
    ):
        self.pipeline      = pipeline
        self.ml_layer      = ml_layer
        self.analyse_fn    = analyse_fn
        self.sessions      = session_store
        self.settings      = get_settings()
        self._scheduler    = AsyncIOScheduler()
        self._last_retrain = None
        # Flag to prevent scheduler ticks from racing against the startup warmup
        self._warming_up   = True

    async def start(self) -> None:

        # Market data refresh
        self._scheduler.add_job(
            self._market_update_job,
            trigger=IntervalTrigger(seconds=self.settings.market_update_interval),
            id="market_update",
            name="Global Market Data Update",
            max_instances=1,       # never run two at once
            misfire_grace_time=60,
        )

        # User recalculation
        self._scheduler.add_job(
            self._user_recalc_job,
            trigger=IntervalTrigger(seconds=self.settings.user_recalc_interval),
            id="user_recalc",
            name="User Portfolio Recalculation",
            max_instances=1,
            misfire_grace_time=120,
        )

        self._scheduler.start()
        logger.info(
            f"Scheduler started — "
            f"market_update every {self.settings.market_update_interval}s, "
            f"user_recalc every {self.settings.user_recalc_interval}s"
        )

        asyncio.create_task(self._initial_warmup())

    async def stop(self) -> None:
        self._scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")

    #  Jobs
    async def _market_update_job(self) -> None:
      
        if self._warming_up:
            logger.debug("Market update job skipped — warmup still in progress")
            return

        logger.info(" Market update job started")
        self.pipeline.invalidate_all()

        # Pre-fetch watchlist concurrently
        symbols = list(set(DEFAULT_WATCHLIST + self._get_user_symbols()))
        try:
            await self.pipeline.get_snapshots(symbols)
            logger.info(f"Pre-fetched {len(symbols)} symbols")
        except Exception as e:
            logger.error(f"Market update fetch error: {e}")

        # Retrain once per day
        now = datetime.now(timezone.utc)
        should_retrain = (
            self._last_retrain is None or
            (now - self._last_retrain).total_seconds() > 86400  # 24h
        )
        if should_retrain and self.ml_layer is not None:
            try:
                snapshots = await self.pipeline.get_snapshots(symbols)
                metrics = await self.ml_layer.train_all(snapshots)
                self._last_retrain = now
                logger.info(f"ML retrain complete: {metrics}")
            except Exception as e:
                logger.error(f"ML retrain error: {e}")

    async def _user_recalc_job(self) -> None:
        if self._warming_up:
            logger.debug("User recalc job skipped — warmup still in progress")
            return

        if self.sessions.active_count == 0:
            return

        logger.info(f"⟳ User recalc job — {self.sessions.active_count} active sessions")
        for session_id, portfolio in self.sessions.get_all_portfolios():
            try:
                result = await self.analyse_fn(portfolio)
                self.sessions.update(session_id, result)
                logger.debug(f"Recalculated session {session_id}")
            except Exception as e:
                logger.error(f"Recalc failed for session {session_id}: {e}")

    # Helpers
    async def _initial_warmup(self) -> None:
        logger.info("Initial warmup: fetching market data...")
        try:
            snapshots = await self.pipeline.get_snapshots(DEFAULT_WATCHLIST)
            logger.info(f"Warmup: fetched {len(snapshots)} symbols")
        except Exception as e:
            logger.error(f"Warmup fetch failed: {e}")
            # Clear the flag so the scheduler can attempt its own fetches
            self._warming_up = False
            return

        if self.ml_layer is not None:
            logger.info("Initial warmup: training ML models...")
            try:
                metrics = await self.ml_layer.train_all(snapshots)
                self._last_retrain = datetime.now(timezone.utc)
                logger.info(f"Initial training complete: {metrics}")
            except Exception as e:
                logger.error(f"Initial training failed: {e}")

        self._warming_up = False
        logger.info("Warmup complete — scheduler jobs will now run normally")

    def _get_user_symbols(self) -> list[str]:
        symbols = []
        for _, portfolio in self.sessions.get_all_portfolios():
            for asset in portfolio.assets:
                symbols.append(asset.symbol)
        return list(set(symbols))
