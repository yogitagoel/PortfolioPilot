
# PIPLINE LAYER

from __future__ import annotations
import time
from loguru import logger

from backend.models.schemas import PortfolioInput, PortfolioAnalysisResponse
from backend.engines.market_data           import MarketDataPipeline
from backend.engines.risk_engine           import RiskEngine
from backend.engines.feature_engineering   import FeatureEngineer
from backend.engines.ml_models             import MLModelLayer
from backend.engines.risk_scoring          import RiskScorer
from backend.engines.recommendation_engine import RecommendationEngine
from backend.utils.helpers                 import elapsed_ms


class PortfolioPipeline:

    def __init__(self):
        self.market_pipeline = MarketDataPipeline()
        self.risk_engine     = RiskEngine()
        self.feature_eng     = FeatureEngineer()
        self.ml_layer        = MLModelLayer()
        self.scorer          = RiskScorer()
        self.rec_engine      = RecommendationEngine()
        logger.info("PortfolioPipeline initialised")

    async def analyse(self, portfolio: PortfolioInput) -> PortfolioAnalysisResponse:
        t0 = time.perf_counter()

        # Fetch all underlying symbols
        symbols = list(set(portfolio.all_symbols + ["SPY"]))
        logger.info(f"[Pipeline] Fetching {symbols}")
        snapshots = await self.market_pipeline.get_snapshots(symbols)

        # Risk Engine
        risk_output = self.risk_engine.compute(portfolio, snapshots)

        # Features
        features = self.feature_eng.compute_features(portfolio, snapshots, risk_output)

        # ML Predictions
        predictions = self.ml_layer.predict_all(features)

        # Compute total portfolio notional value (qty × price) for position sizing
        portfolio_notional = sum(
            e.qty * (snapshots[e.symbol].current_price if e.symbol in snapshots else 0.0)
            for e in portfolio.equities
        ) + sum(
            o.notional_shares * (snapshots[o.underlying].current_price
                                 if o.underlying in snapshots else o.strike)
            for o in portfolio.options
        )

        #  Risk Score 
        risk_score = self.scorer.compute(
            risk_output, predictions,
            preference=portfolio.risk_preference,
            portfolio_notional=portfolio_notional,
        )

        # Recommendations
        rec_output = self.rec_engine.generate(
            portfolio=portfolio,
            risk_output=risk_output,
            predictions=predictions,
            features=features,
            risk_score=risk_score,
            snapshots=snapshots,
        )

        # Augment alerts for high-risk options positions
        alerts = list(rec_output.alerts)
        for og in risk_output.portfolio_greeks.option_greeks:
            if og.days_to_expiry <= 7:
                alerts.append(
                    f" {og.underlying} {og.option_type.value} K={og.strike} "
                    f"expires in {og.days_to_expiry} day(s) — review position"
                )
            if og.moneyness == "ITM" and og.side.value == "SHORT":
                alerts.append(
                    f" Short {og.underlying} {og.option_type.value} K={og.strike} "
                    f"is ITM — assignment risk is elevated"
                )

        ms = elapsed_ms(t0)
        logger.info(f"[Pipeline] Complete in {ms:.0f} ms")

        return PortfolioAnalysisResponse(
            input=portfolio,
            risk_metrics=risk_output,
            predictions=predictions,
            risk_score=risk_score,
            recommendations=rec_output.recommendations,
            option_greeks_breakdown=risk_output.portfolio_greeks.option_greeks,
            summary=rec_output.summary,
            alerts=alerts,
            processing_time_ms=ms,
        )
