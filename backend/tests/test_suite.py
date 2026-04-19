# Testings
from __future__ import annotations

import math
import datetime
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np

# Schemas
from backend.models.schemas import (
    EquityPosition, OptionContract, PortfolioInput,
    OptionType, OptionStyle, PositionSide, RiskPreference,
    MarketSnapshot, PriceBar, RiskEngineOutput, PortfolioGreeks,
    MLPrediction, RiskScore, AssetFeatures,
    ActionType, Recommendation, PortfolioAnalysisResponse,
)

# Fixtures
def make_price_bars(n=252, start=150.0, drift=0.0003, vol=0.015) -> list[PriceBar]:
    np.random.seed(42)
    prices = [start]
    for _ in range(n - 1):
        prices.append(prices[-1] * math.exp(drift + vol * np.random.randn()))
    bars = []
    for i, p in enumerate(prices):
        dt = (datetime.date.today() - datetime.timedelta(days=n - i)).isoformat()
        bars.append(PriceBar(date=dt, open=p*0.99, high=p*1.01, low=p*0.98, close=p, volume=1e6))
    return bars


def make_snapshot(symbol="AAPL", price=180.0, vol=0.25) -> MarketSnapshot:
    return MarketSnapshot(
        symbol=symbol,
        current_price=price,
        daily_return=0.5,
        rolling_vol_20d=vol,
        history=make_price_bars(252, start=price),
    )


def make_equity_portfolio(*symbols) -> PortfolioInput:
    return PortfolioInput(
        equities=[EquityPosition(symbol=s, qty=10) for s in symbols]
    )


def future_date(days=90) -> str:
    return (datetime.date.today() + datetime.timedelta(days=days)).isoformat()

# Schema Validation Tests
class TestSchemas:

    def test_equity_symbol_uppercased(self):
        e = EquityPosition(symbol="aapl", qty=10)
        assert e.symbol == "AAPL"

    def test_equity_qty_must_be_positive(self):
        with pytest.raises(Exception):
            EquityPosition(symbol="AAPL", qty=0)

    def test_option_symbol_uppercased(self):
        opt = OptionContract(
            underlying="aapl", option_type=OptionType.CALL,
            strike=200, expiry=future_date(60),
        )
        assert opt.underlying == "AAPL"

    def test_option_expiry_format_validated(self):
        with pytest.raises(Exception):
            OptionContract(
                underlying="AAPL", option_type=OptionType.CALL,
                strike=200, expiry="19-12-2025",
            )

    def test_option_past_expiry_rejected(self):
        with pytest.raises(Exception):
            OptionContract(
                underlying="AAPL", option_type=OptionType.CALL,
                strike=200, expiry="2020-01-01",
            )

    def test_portfolio_requires_at_least_one_position(self):
        with pytest.raises(Exception):
            PortfolioInput(equities=[], options=[])

    def test_portfolio_equity_only(self):
        p = make_equity_portfolio("AAPL", "MSFT")
        assert len(p.equities) == 2
        assert p.all_symbols == ["AAPL", "MSFT"]

    def test_portfolio_options_only(self):
        p = PortfolioInput(options=[
            OptionContract(underlying="AAPL", option_type=OptionType.PUT,
                           strike=170, expiry=future_date(45))
        ])
        assert "AAPL" in p.all_symbols

    def test_portfolio_mixed(self):
        p = PortfolioInput(
            equities=[EquityPosition(symbol="AAPL", qty=100)],
            options=[OptionContract(underlying="AAPL", option_type=OptionType.PUT,
                                    strike=170, expiry=future_date(45))],
        )
        assert len(p.all_symbols) == 1   # same underlying

    def test_option_properties(self):
        expiry = future_date(90)
        opt = OptionContract(underlying="AAPL", option_type=OptionType.CALL,
                             strike=200, expiry=expiry, contracts=2)
        assert opt.notional_shares == 200
        assert opt.days_to_expiry > 0
        assert opt.time_to_expiry_years > 0
        assert opt.side_sign == 1.0

    def test_short_option_side_sign(self):
        opt = OptionContract(underlying="AAPL", option_type=OptionType.CALL,
                             strike=200, expiry=future_date(30), side=PositionSide.SHORT)
        assert opt.side_sign == -1.0


#  Black-Scholes & Greeks Tests
class TestBlackScholes:
    def _price(self, S, K, T, r, sigma, opt_type):
        from backend.engines.options_engine import _bs_price
        return _bs_price(S, K, T, r, sigma, opt_type)

    def _greeks(self, S, K, T, r, sigma, opt_type):
        from backend.engines.options_engine import _bs_greeks
        return _bs_greeks(S, K, T, r, sigma, opt_type)

    def test_atm_call_positive(self):
        price = self._price(100, 100, 1.0, 0.05, 0.20, OptionType.CALL)
        assert price > 0

    def test_deep_itm_call_intrinsic(self):
        price = self._price(200, 100, 0.01, 0.05, 0.01, OptionType.CALL)
        assert abs(price - 100) < 2.0

    def test_deep_otm_call_near_zero(self):
        price = self._price(50, 200, 0.1, 0.05, 0.20, OptionType.CALL)
        assert price < 0.01

    def test_put_call_parity(self):
        S, K, T, r, sigma = 100, 100, 1.0, 0.05, 0.20
        C = self._price(S, K, T, r, sigma, OptionType.CALL)
        P = self._price(S, K, T, r, sigma, OptionType.PUT)
        lhs = C - P
        rhs = S - K * math.exp(-r * T)
        assert abs(lhs - rhs) < 0.001, 

    def test_call_delta_range(self):
        g = self._greeks(100, 100, 0.5, 0.05, 0.20, OptionType.CALL)
        assert 0 < g["delta"] < 1

    def test_put_delta_range(self):
        g = self._greeks(100, 100, 0.5, 0.05, 0.20, OptionType.PUT)
        assert -1 < g["delta"] < 0

    def test_put_call_delta_relationship(self):
        S, K, T, r, sigma = 100, 105, 0.5, 0.05, 0.25
        gc = self._greeks(S, K, T, r, sigma, OptionType.CALL)
        gp = self._greeks(S, K, T, r, sigma, OptionType.PUT)
        assert abs(gc["delta"] - gp["delta"] - 1.0) < 0.001

    def test_gamma_positive(self):
        for ot in [OptionType.CALL, OptionType.PUT]:
            g = self._greeks(100, 100, 0.5, 0.05, 0.20, ot)
            assert g["gamma"] > 0, f"Gamma should be positive for {ot}"

    def test_theta_negative_long(self):
        for ot in [OptionType.CALL, OptionType.PUT]:
            g = self._greeks(100, 100, 0.5, 0.05, 0.20, ot)
            assert g["theta"] < 0, f"Theta should be negative for long {ot}"

    def test_vega_positive(self):
        for ot in [OptionType.CALL, OptionType.PUT]:
            g = self._greeks(100, 100, 0.5, 0.05, 0.20, ot)
            assert g["vega"] > 0

    def test_expiry_boundary(self):
        g = self._greeks(110, 100, 1e-7, 0.05, 0.20, OptionType.CALL)
        assert g["price"] >= 0

    def test_zero_vol_call_intrinsic(self):
        price = self._price(110, 100, 0.5, 0.0, 1e-6, OptionType.CALL)
        assert abs(price - 10.0) < 1.0


class TestBinomialTree:

    def test_american_put_ge_european(self):
        from backend.engines.options_engine import _bs_price, _binomial_price
        S, K, T, r, sigma = 95, 100, 1.0, 0.05, 0.20
        eu = _bs_price(S, K, T, r, sigma, OptionType.PUT)
        am = _binomial_price(S, K, T, r, sigma, OptionType.PUT)
        assert am >= eu - 0.001, f"American put {am:.4f} should be >= European put {eu:.4f}"

    def test_american_call_no_exercise_premium(self):
        from backend.engines.options_engine import _bs_price, _binomial_price
        S, K, T, r, sigma = 105, 100, 1.0, 0.05, 0.20
        eu = _bs_price(S, K, T, r, sigma, OptionType.CALL)
        am = _binomial_price(S, K, T, r, sigma, OptionType.CALL)
        assert abs(am - eu) < 0.5   # within 50 cents

# Risk Engine Tests
class TestRiskEngine:

    def _run(self, portfolio, snapshots):
        from backend.engines.risk_engine import RiskEngine
        return RiskEngine().compute(portfolio, snapshots)

    def test_single_equity(self):
        p = make_equity_portfolio("AAPL")
        snaps = {"AAPL": make_snapshot("AAPL"), "SPY": make_snapshot("SPY")}
        out = self._run(p, snaps)
        assert out.portfolio_volatility > 0
        assert isinstance(out.var_95, float)
        assert out.sharpe_ratio != 0

    def test_two_correlated_assets(self):
        p = PortfolioInput(equities=[
            EquityPosition(symbol="A", qty=10),
            EquityPosition(symbol="B", qty=10),
        ])
        # Use same bars → perfect correlation
        bars = make_price_bars(252, 100.0)
        s = {"A": MarketSnapshot(symbol="A", current_price=100, daily_return=0,
                                  rolling_vol_20d=0.2, history=bars),
             "B": MarketSnapshot(symbol="B", current_price=100, daily_return=0,
                                  rolling_vol_20d=0.2, history=bars)}
        out = self._run(p, s)
        assert out.portfolio_volatility > 0

    def test_weights_sum_to_one(self):
        p = make_equity_portfolio("AAPL", "MSFT", "GOOGL")
        snaps = {s: make_snapshot(s, price=100 + i*10)
                 for i, s in enumerate(["AAPL", "MSFT", "GOOGL", "SPY"])}
        out = self._run(p, snaps)
        total = sum(out.asset_weights.values())
        assert abs(total - 1.0) < 0.001

    def test_options_greeks_computed(self):
        p = PortfolioInput(
            equities=[EquityPosition(symbol="AAPL", qty=100)],
            options=[OptionContract(
                underlying="AAPL", option_type=OptionType.PUT,
                strike=170, expiry=future_date(60), contracts=1,
                implied_vol=0.30,
            )],
        )
        snaps = {"AAPL": make_snapshot("AAPL", price=180), "SPY": make_snapshot("SPY")}
        out = self._run(p, snaps)
        assert len(out.portfolio_greeks.option_greeks) == 1
        og = out.portfolio_greeks.option_greeks[0]
        assert og.delta < 0       # Long put has negative delta
        assert og.gamma > 0       # Gamma always positive
        assert og.theta < 0       # Long option loses time value
        assert og.vega  > 0       # Long option gains value from higher IV

    def test_portfolio_greeks_net_delta_sign(self):
        from backend.engines.options_engine import OptionsEngine
        snap = make_snapshot("AAPL", price=180)
        opt  = OptionContract(
            underlying="AAPL", option_type=OptionType.PUT,
            strike=175, expiry=future_date(60), contracts=1,
            implied_vol=0.25
        )
        engine = OptionsEngine()
        g = engine.compute([opt], {"AAPL": snap}, equity_delta=1.0)
        # Long put adds negative delta, so net < 1.0
        assert g.net_delta < 1.0

    def test_pnl_scenarios_keys(self):
        from backend.engines.options_engine import OptionsEngine
        snap = make_snapshot("AAPL", price=180)
        opt  = OptionContract(underlying="AAPL", option_type=OptionType.CALL,
                              strike=190, expiry=future_date(45), contracts=1)
        engine = OptionsEngine()
        scenarios = engine.pnl_scenarios([opt], {"AAPL": snap})
        assert any("AAPL" in k for k in scenarios)
        assert "AAPL_+20%" in scenarios
        assert "AAPL_-20%" in scenarios


# Feature Engineering Tests
class TestFeatureEngineering:

    def _fe(self):
        from backend.engines.feature_engineering import FeatureEngineer
        return FeatureEngineer()

    def test_rsi_range(self):
        import pandas as pd
        fe = self._fe()
        # Monotonically rising prices
        prices = pd.Series([float(i) for i in range(1, 60)])
        rsi = fe._rsi(prices, 14)
        assert 50 < rsi <= 100

        # Monotonically falling prices
        prices2 = pd.Series([float(60 - i) for i in range(60)])
        rsi2 = fe._rsi(prices2, 14)
        assert 0 <= rsi2 < 50

    def test_macd_returns_tuple(self):
        import pandas as pd
        fe = self._fe()
        prices = pd.Series([float(100 + i * 0.1 + np.sin(i) * 2) for i in range(60)])
        macd, signal = fe._macd(prices)
        assert isinstance(macd, float)
        assert isinstance(signal, float)

    def test_features_vector_length(self):
        fe = self._fe()
        snap = make_snapshot("AAPL")
        risk_mock = MagicMock()
        risk_mock.asset_weights = {"AAPL": 1.0}
        p = make_equity_portfolio("AAPL")
        feats = fe.compute_features(p, {"AAPL": snap}, risk_mock)
        assert len(feats) == 1
        assert len(fe.features_to_vector(feats[0])) == 10

    def test_market_correlation_no_spy(self):
        fe = self._fe()
        returns = np.random.randn(60) * 0.01
        corr = fe._market_correlation(returns, None)
        assert corr == fe.SPY_CORRELATION_FALLBACK

# Risk Scoring Tests

class TestRiskScoring:

    def _scorer(self):
        from backend.engines.risk_scoring import RiskScorer
        return RiskScorer()

    def _make_risk_output(self, vol=0.2, var=-0.02, sharpe=1.0):
        return RiskEngineOutput(
            portfolio_volatility=vol,
            var_95=var,
            sharpe_ratio=sharpe,
            portfolio_greeks=PortfolioGreeks(
                net_delta=0.8, net_gamma=0.01, net_vega=0.5,
                net_theta=-5.0, net_rho=0.1,
            ),
            asset_weights={"AAPL": 1.0},
            covariance_matrix={"AAPL": {"AAPL": 0.04}},
        )

    def _make_predictions(self, ret=0.001, vol=0.2):
        return [MLPrediction(symbol="AAPL", predicted_return=ret,
                             predicted_volatility=vol, confidence=0.7)]

    def test_score_in_range(self):
        scorer = self._scorer()
        score  = scorer.compute(self._make_risk_output(), self._make_predictions())
        assert 0 <= score.score <= 100

    def test_high_vol_high_score(self):
        scorer   = self._scorer()
        low_vol  = scorer.compute(self._make_risk_output(vol=0.10), self._make_predictions())
        high_vol = scorer.compute(self._make_risk_output(vol=0.70), self._make_predictions())
        assert high_vol.score > low_vol.score

    def test_good_sharpe_low_score(self):
        scorer    = self._scorer()
        bad_sh    = scorer.compute(self._make_risk_output(sharpe=-0.5), self._make_predictions())
        good_sh   = scorer.compute(self._make_risk_output(sharpe=2.5),  self._make_predictions())
        assert good_sh.score < bad_sh.score

    def test_label_mapping(self):
        scorer = self._scorer()
        for score, expected in [(10, "LOW"), (35, "MODERATE"), (60, "HIGH"), (80, "EXTREME")]:
            label = scorer._score_to_label(score)
            assert label == expected

    def test_threshold_adjustment(self):
        from backend.engines.risk_scoring import RiskScorer
        scorer = RiskScorer()
        base = 50.0
        low_t  = scorer.effective_threshold(base, RiskPreference.LOW)
        med_t  = scorer.effective_threshold(base, RiskPreference.MEDIUM)
        high_t = scorer.effective_threshold(base, RiskPreference.HIGH)
        assert low_t < med_t < high_t


# Recommendation Engine Tests
class TestRecommendationEngine:

    def _engine(self):
        from backend.engines.recommendation_engine import RecommendationEngine
        return RecommendationEngine()

    def _make_risk_score(self, score, label):
        return RiskScore(
            score=score, label=label,
            vol_contribution=5.0, var_contribution=5.0,
            sharpe_contribution=5.0, rationale="test",
        )

    def _make_features(self, symbol, rsi=50.0, vol=0.2):
        return AssetFeatures(
            symbol=symbol, log_return_1d=0.001, log_return_5d=0.005,
            ma_20=100.0, ma_50=98.0, rsi_14=rsi, macd=0.1, macd_signal=0.05,
            rolling_vol_20d=vol, market_corr_60d=0.6, weight_in_portfolio=1.0,
        )

    def _make_prediction(self, symbol, ret=0.003, vol=0.2):
        return MLPrediction(symbol=symbol, predicted_return=ret,
                            predicted_volatility=vol, confidence=0.7)

    def test_extreme_risk_triggers_sell(self):
        engine = self._engine()
        p      = make_equity_portfolio("AAPL")
        ro     = MagicMock()
        ro.asset_weights = {"AAPL": 0.5}
        score  = self._make_risk_score(85, "EXTREME")
        rec    = engine._recommend_asset(
            "AAPL",
            pred=self._make_prediction("AAPL", ret=-0.005),
            feat=self._make_features("AAPL"),
            snap=None, risk_score=score,
            preference=RiskPreference.MEDIUM, pref_adj=0.0,
            current_weight=0.5,
        )
        from backend.models.schemas import ActionType
        assert rec.action == ActionType.SELL

    def test_bullish_signal_triggers_buy(self):
        engine = self._engine()
        score  = self._make_risk_score(30, "LOW")
        rec    = engine._recommend_asset(
            "AAPL",
            pred=self._make_prediction("AAPL", ret=0.005),
            feat=self._make_features("AAPL", rsi=45),
            snap=None, risk_score=score,
            preference=RiskPreference.MEDIUM, pref_adj=0.0,
            current_weight=0.3,
        )
        from backend.models.schemas import ActionType
        assert rec.action == ActionType.BUY

    def test_overbought_triggers_sell(self):
        engine = self._engine()
        score  = self._make_risk_score(40, "MODERATE")
        rec    = engine._recommend_asset(
            "TSLA",
            pred=self._make_prediction("TSLA", ret=-0.001),
            feat=self._make_features("TSLA", rsi=80),
            snap=None, risk_score=score,
            preference=RiskPreference.MEDIUM, pref_adj=0.0,
            current_weight=0.2,
        )
        from backend.models.schemas import ActionType
        assert rec.action == ActionType.SELL

    def test_confidence_in_range(self):
        engine = self._engine()
        score  = self._make_risk_score(50, "HIGH")
        for ret in [-0.01, 0.0, 0.01]:
            rec = engine._recommend_asset(
                "X",
                pred=self._make_prediction("X", ret=ret),
                feat=self._make_features("X"),
                snap=None, risk_score=score,
                preference=RiskPreference.MEDIUM, pref_adj=0.0,
                current_weight=0.25,
            )
            assert 0 <= rec.confidence <= 1


# End-to-End Pipeline Test

class TestPipeline:

    @pytest.mark.asyncio
    async def test_equity_only_pipeline(self):
        from backend.pipeline import PortfolioPipeline

        pipeline = PortfolioPipeline()
        snaps = {s: make_snapshot(s) for s in ["AAPL", "TSLA", "SPY"]}
        pipeline.market_pipeline.get_snapshots = AsyncMock(return_value=snaps)

        p = make_equity_portfolio("AAPL", "TSLA")
        result = await pipeline.analyse(p)

        assert result.risk_metrics.portfolio_volatility > 0
        assert 0 <= result.risk_score.score <= 100
        assert len(result.recommendations) == 2
        assert result.processing_time_ms > 0

    @pytest.mark.asyncio
    async def test_mixed_portfolio_pipeline(self):
        from backend.pipeline import PortfolioPipeline

        pipeline = PortfolioPipeline()
        snaps = {s: make_snapshot(s, price=180) for s in ["AAPL", "SPY"]}
        pipeline.market_pipeline.get_snapshots = AsyncMock(return_value=snaps)

        p = PortfolioInput(
            equities=[EquityPosition(symbol="AAPL", qty=100)],
            options=[OptionContract(
                underlying="AAPL", option_type=OptionType.PUT,
                strike=170, expiry=future_date(60), contracts=1,
                implied_vol=0.30,
            )],
        )
        result = await pipeline.analyse(p)

        assert len(result.option_greeks_breakdown) == 1
        og = result.option_greeks_breakdown[0]
        assert og.delta < 0        # Long put
        assert og.theoretical_price > 0

    @pytest.mark.asyncio
    async def test_options_only_portfolio(self):
        from backend.pipeline import PortfolioPipeline

        pipeline = PortfolioPipeline()
        snaps = {s: make_snapshot(s, price=150) for s in ["TSLA", "SPY"]}
        pipeline.market_pipeline.get_snapshots = AsyncMock(return_value=snaps)

        p = PortfolioInput(options=[
            OptionContract(underlying="TSLA", option_type=OptionType.CALL,
                           strike=160, expiry=future_date(30), contracts=5,
                           implied_vol=0.50),
        ])
        result = await pipeline.analyse(p)
        assert result.risk_score.score >= 0

# FastAPI Route Tests

class TestAPI:

    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from backend.main import app, get_pipeline, get_sessions
        from backend.scheduler import SessionStore

        # Build a fully typed fake analysis result
        fake_analysis = PortfolioAnalysisResponse(
            input=PortfolioInput(equities=[EquityPosition(symbol="AAPL", qty=10)]),
            risk_metrics=RiskEngineOutput(
                portfolio_volatility=0.22, var_95=-0.018, sharpe_ratio=0.85,
                portfolio_greeks=PortfolioGreeks(
                    net_delta=0.9, net_gamma=0.01, net_vega=0.5,
                    net_theta=-2.0, net_rho=0.3,
                ),
                asset_weights={"AAPL": 1.0},
                covariance_matrix={"AAPL": {"AAPL": 0.048}},
            ),
            predictions=[MLPrediction(symbol="AAPL", predicted_return=0.001,
                                      predicted_volatility=0.22, confidence=0.7)],
            risk_score=RiskScore(score=42.0, label="MODERATE",
                                 vol_contribution=10, var_contribution=8,
                                 sharpe_contribution=6, rationale="test"),
            recommendations=[Recommendation(action=ActionType.HOLD, symbol="AAPL",
                                            confidence=0.6, reason="stable",
                                            target_weight=1.0)],
            summary="MODERATE risk portfolio.",
            processing_time_ms=120.0,
        )

        mock_pipe = MagicMock()
        mock_pipe.analyse = AsyncMock(return_value=fake_analysis)
        mock_pipe.ml_layer.models_ready = True
        mock_pipe.market_pipeline.get_snapshot = AsyncMock(return_value=make_snapshot("AAPL"))

        mock_store = SessionStore()

        app.dependency_overrides[get_pipeline] = lambda: mock_pipe
        app.dependency_overrides[get_sessions] = lambda: mock_store

        with TestClient(app, raise_server_exceptions=False) as c:
            yield c

        app.dependency_overrides.clear()

    def test_health_endpoint(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

    def test_analyse_equity_only(self, client):
        resp = client.post("/api/v1/analyse", json={
            "equities": [{"symbol": "AAPL", "qty": 10}],
            "risk_preference": "medium",
        })
        assert resp.status_code == 200

    def test_analyse_empty_portfolio_rejected(self, client):
        resp = client.post("/api/v1/analyse", json={
            "equities": [], "options": [],
        })
        assert resp.status_code == 422

    def test_analyse_with_option(self, client):
        resp = client.post("/api/v1/analyse", json={
            "equities": [{"symbol": "AAPL", "qty": 100}],
            "options": [{
                "underlying": "AAPL",
                "option_type": "PUT",
                "strike": 170,
                "expiry": future_date(60),
                "contracts": 1,
                "side": "LONG",
            }],
            "risk_preference": "low",
        })
        assert resp.status_code == 200

    def test_invalid_option_past_expiry(self, client):
        resp = client.post("/api/v1/analyse", json={
            "options": [{
                "underlying": "AAPL",
                "option_type": "CALL",
                "strike": 200,
                "expiry": "2020-01-01",
                "contracts": 1,
            }],
        })
        assert resp.status_code == 422

    def test_docs_available(self, client):
        resp = client.get("/docs")
        assert resp.status_code == 200
