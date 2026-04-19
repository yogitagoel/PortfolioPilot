# Calculates risk factors including portfolio_volatility, var, sharpe_ratio, portfolio_greeks (net Delta/Gamma/Vega/Theta/Rho),
# per-option greeks breakdown, P&L scenarios for the options book, composite_risk_score (0-100), market_regime

from __future__ import annotations
import numpy  as np
from scipy   import stats
from typing  import Optional

from backend.config          import get_settings
from backend.models.schemas  import (PortfolioInput, MarketSnapshot, RiskEngineOutput)
from backend.engines.options_engine import OptionsEngine, _bs_price

class RiskEngine:
    def __init__(self):
        self.settings       = get_settings()
        self.options_engine = OptionsEngine()

    def compute(
        self,
        portfolio:  PortfolioInput,
        snapshots:  dict[str, MarketSnapshot],
    ) -> RiskEngineOutput:

        all_symbols = portfolio.all_symbols

        # Build price matrix
        price_matrix, valid_symbols = self._build_price_matrix(all_symbols, snapshots)

        if price_matrix is None or price_matrix.shape[1] == 0:
            raise ValueError("Could not build price matrix — check market data")

        returns_matrix = np.diff(np.log(price_matrix), axis=0)

        # Weights are normalised
        weights = self._compute_equity_weights(portfolio, snapshots, valid_symbols)

        # Daily covariance matrix, portfolio volatility, expected return 
        cov_matrix  = self._compute_covariance(returns_matrix)
        port_vol    = self._portfolio_volatility(weights, cov_matrix)   # daily σ
        port_return = self._portfolio_expected_return(returns_matrix, weights)  # daily μ
        var_95  = self._value_at_risk(port_return, port_vol)
        sharpe  = self._sharpe_ratio(port_return, port_vol)
        eq_delta, eq_gamma, eq_vega = self._equity_greeks(weights)

        # Options Greeks (Black-Scholes / Binomial)
        portfolio_greeks = self.options_engine.compute(
            options=portfolio.options,
            snapshots=snapshots,
            equity_delta=eq_delta,
            equity_gamma=eq_gamma,
            equity_vega=eq_vega,
        )

        # P&L scenarios for the options book
        pnl_scenarios = self.options_engine.pnl_scenarios(
            portfolio.options, snapshots
        ) if portfolio.options else {}

        r = self.settings.risk_free_rate
        options_premium = 0.0
        for opt in portfolio.options:
            snap = snapshots.get(opt.underlying)
            if snap:
                sigma   = opt.implied_vol or snap.rolling_vol_20d or 0.20
                premium = opt.premium_paid or _bs_price(
                    snap.current_price, opt.strike,
                    opt.time_to_expiry_years, r, sigma, opt.option_type,
                )
                options_premium += premium * opt.notional_shares

        equity_notional = sum(
            opt.notional_shares * (
                snapshots[opt.underlying].current_price
                if opt.underlying in snapshots else opt.strike
            )
            for opt in portfolio.options
        )
        total_notional = equity_notional + options_premium

        cov_dict = self._matrix_to_dict(cov_matrix, valid_symbols)

        return RiskEngineOutput(
            portfolio_volatility=round(port_vol, 6),
            var_95=round(var_95, 6),
            sharpe_ratio=round(sharpe, 4),
            portfolio_greeks=portfolio_greeks,
            asset_weights={s: round(w, 4) for s, w in zip(valid_symbols, weights)},
            covariance_matrix=cov_dict,
            total_options_notional=round(total_notional, 2),
            options_pnl_scenarios=pnl_scenarios,
        )

    @staticmethod
    def _equity_greeks(weights: np.ndarray) -> tuple[float, float, float]:
        eq_delta = float(np.sum(weights))
        eq_gamma = 0.0
        eq_vega  = 0.0
        return eq_delta, eq_gamma, eq_vega

    # Portfolio risk formulas
    def _portfolio_volatility(
        self, weights: np.ndarray, cov_matrix: np.ndarray
    ) -> float:
        # Daily portfolio volatility σ= √(wᵀ Σ w).
        variance = float(weights @ cov_matrix @ weights)
        return float(np.sqrt(max(variance, 0.0)))

    def _portfolio_expected_return(
        self, returns_matrix: np.ndarray, weights: np.ndarray
    ) -> float:
        # Daily mean portfolio return μ = wᵀ μ_vector
        return float(returns_matrix.mean(axis=0) @ weights)

    def _value_at_risk(
        self,
        mu_daily:    float,
        sigma_daily: float,
        confidence:  Optional[float] = None,
    ) -> float:
        # 1-day parametric VaR = z · σ − μ
        conf = confidence or self.settings.var_confidence
        z    = stats.norm.ppf(conf)
        return float(z * sigma_daily - mu_daily)

    def _sharpe_ratio(self, mu_daily: float, sigma_daily: float) -> float:
        # Annualised Sharpe ratio = (μ_daily × 252 − rf) / (σ_daily × √252)
        sigma_annual = sigma_daily * np.sqrt(252)
        if sigma_annual < 1e-8:      
            return 0.0
        mu_annual = mu_daily * 252
        rf        = self.settings.risk_free_rate
        return float((mu_annual - rf) / sigma_annual)

    # Composite Risk Score
    @staticmethod
    def _composite_risk_score(
        port_vol: float,
        var_95:   float,
        sharpe:   float,
    ) -> float:
        # score = w1 · norm_vol + w2 · norm_VaR + w3 · (1 − norm_Sharpe) × 100
        vol_norm    = float(np.clip(port_vol / 0.04, 0.0, 1.0))
        var_norm    = float(np.clip(var_95    / 0.05, 0.0, 1.0))
        sharpe_norm = 1.0 - float(np.clip((sharpe + 1.0) / 4.0, 0.0, 1.0))
        raw = 0.40 * vol_norm + 0.40 * var_norm + 0.20 * sharpe_norm
        return round(raw * 100, 2)

    # Market Regime Classification
    @staticmethod
    def _classify_market_regime(
        port_vol:  float,
        net_delta: float,
        var_95:    float,
    ) -> str:
        """
        Classify current market environment (daily units):

            HIGH_RISK : port_vol > 2.5%  OR  VaR > 3%
            DIRECTIONAL : |net_delta| > 0.70 (strong bullish/bearish tilt)
            STABLE : low vol, balanced Greeks, no urgent action needed
        """
        if port_vol > 0.025 or var_95 > 0.03:
            return "HIGH_RISK"
        if abs(net_delta) > 0.70:
            return "DIRECTIONAL"
        return "STABLE"

    # Helpers
    def _build_price_matrix(
        self,
        symbols:   list[str],
        snapshots: dict[str, MarketSnapshot],
    ) -> tuple[Optional[np.ndarray], list[str]]:
        price_series: dict[str, np.ndarray] = {}
        for sym in symbols:
            if sym not in snapshots:
                continue
            closes = np.array([bar.close for bar in snapshots[sym].history])
            if len(closes) <= 10:
                continue
            price_series[sym] = closes

        if not price_series:
            return None, []

        min_len       = min(len(v) for v in price_series.values())
        valid_symbols = list(price_series.keys())
        matrix        = np.column_stack(
            [price_series[s][-min_len:] for s in valid_symbols]
        )
        return matrix, valid_symbols

    def _compute_equity_weights(
        self,
        portfolio:     PortfolioInput,
        snapshots:     dict[str, MarketSnapshot],
        valid_symbols: list[str],
    ) -> np.ndarray:
        
        # Normalised weights :weight_i = (qty_i × price_i) / Σ (qty_j × price_j)
        qty_map = {e.symbol: e.qty for e in portfolio.equities}
        values  = []
        for sym in valid_symbols:
            price = snapshots[sym].current_price if sym in snapshots else 1.0
            values.append(qty_map.get(sym, 0.0) * price)

        total = sum(values)
        if total < 1e-8:
            # Fallback: equal weights when portfolio has no equity value
            return np.ones(len(valid_symbols)) / max(len(valid_symbols), 1)

        return np.array(values) / total 

    def _compute_covariance(self, returns_matrix: np.ndarray) -> np.ndarray:
        # Daily covariance matrix
        if returns_matrix.shape[1] == 1:
            return np.array([[np.var(returns_matrix, ddof=1)]])
        return np.cov(returns_matrix.T)

    def _matrix_to_dict(self, matrix: np.ndarray, symbols: list[str]) -> dict:
        return {
            symbols[i]: {
                symbols[j]: round(float(matrix[i, j]), 6)
                for j in range(len(symbols))
            }
            for i in range(len(symbols))
        }
