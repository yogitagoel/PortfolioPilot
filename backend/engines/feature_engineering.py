# Feature Engineering: Converts raw OHLCV price history to ML-ready numerical features.

from __future__ import annotations
import numpy  as np
import pandas as pd
from backend.models.schemas import (PortfolioInput, MarketSnapshot, AssetFeatures, RiskEngineOutput)


class FeatureEngineer:

    # Stateless transformer.
    SPY_CORRELATION_FALLBACK = 0.6  # used when SPY data is unavailable

    def compute_features(
        self,
        portfolio:   PortfolioInput,
        snapshots:   dict[str, MarketSnapshot],
        risk_output: RiskEngineOutput,
    ) -> list[AssetFeatures]:
        
        # Compute ML features for each asset in the portfolio.
        # Uses SPY as the market benchmark for correlation calculation.
        features = []
        weights  = risk_output.asset_weights

        for asset in portfolio.equities:
            sym = asset.symbol
            if sym not in snapshots:
                continue

            snap = snapshots[sym]
            df   = self._snapshot_to_df(snap)

            
            feat = self._compute_asset_features(
                symbol=sym,
                df=df,
                weight=weights.get(sym, 1.0 / max(len(portfolio.equities), 1)),
                market_snapshot=snapshots.get("SPY"),
            )
            features.append(feat)
        return features
    
    # Core Feature Calculation
    def _compute_asset_features(
        self,
        symbol:          str,
        df:              pd.DataFrame,
        weight:          float,
        market_snapshot: MarketSnapshot | None,
    ) -> AssetFeatures:

        closes  = df["close"].values.astype(float)
        log_ret = np.diff(np.log(closes))  # shape (T-1,)
        series  = pd.Series(closes, name="close")
        ret_ser = pd.Series(log_ret, name="log_return")

        # Log Returns
        log_return_1d = float(log_ret[-1]) if len(log_ret) >= 1 else 0.0
        log_return_5d = float(np.sum(log_ret[-5:])) if len(log_ret) >= 5 else 0.0

        # Moving Averages
        ma_20 = float(series.rolling(20).mean().iloc[-1]) if len(closes) >= 20 else float(closes.mean())
        ma_50 = float(series.rolling(50).mean().iloc[-1]) if len(closes) >= 50 else float(closes.mean())

        # RSI (14-day)
        rsi_14 = self._rsi(series, period=14)

        # MACD
        macd_line, macd_signal = self._macd(series)

        # Rolling Volatility (20d annualised)
        rolling_vol = float(ret_ser.rolling(20).std().iloc[-1] * np.sqrt(252)) \
            if len(ret_ser) >= 20 else float(ret_ser.std() * np.sqrt(252))

        # Market Correlation (60d)
        market_corr = self._market_correlation(log_ret, market_snapshot)

        return AssetFeatures(
            symbol=symbol,
            log_return_1d=round(log_return_1d, 8),
            log_return_5d=round(log_return_5d, 8),
            ma_20=round(ma_20, 4),
            ma_50=round(ma_50, 4),
            rsi_14=round(rsi_14, 4),
            macd=round(macd_line, 6),
            macd_signal=round(macd_signal, 6),
            rolling_vol_20d=round(rolling_vol, 6),
            market_corr_60d=round(market_corr, 4),
            weight_in_portfolio=round(weight, 4),
        )

    # Technical Indicator Implementations

    def _rsi(self, series: pd.Series, period: int = 14) -> float:

        # Relative Strength Index 
        if len(series) < period + 1:
            return 50.0   # neutral

        delta  = series.diff()
        gain   = delta.clip(lower=0)
        loss   = (-delta).clip(lower=0)

        # Exponential moving average
        avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
        avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()

        rs  = avg_gain / avg_loss.replace(0, 1e-10)
        rsi = 100 - (100 / (1 + rs))
        return float(rsi.iloc[-1])

    def _macd(
        self,
        series:       pd.Series,
        fast:         int = 12,
        slow:         int = 26,
        signal_span:  int = 9,
    ) -> tuple[float, float]:
        
        # Moving Average Convergence/Divergence.
        if len(series) < slow + signal_span:
            return 0.0, 0.0

        ema_fast   = series.ewm(span=fast,   adjust=False).mean()
        ema_slow   = series.ewm(span=slow,   adjust=False).mean()
        macd_line  = ema_fast - ema_slow
        signal     = macd_line.ewm(span=signal_span, adjust=False).mean()

        return float(macd_line.iloc[-1]), float(signal.iloc[-1])

    def _market_correlation(
        self,
        asset_log_returns: np.ndarray,
        spy_snapshot:      MarketSnapshot | None,
        window:            int = 60,
    ) -> float:
        
        # 60-day rolling Pearson correlation with SPY (market proxy)
        # High correlation (> 0.8): this asset moves with the market
        # Low correlation (< 0.3): good diversification potential
        # Falls back to a default value if SPY data isn't available
        if spy_snapshot is None:
            return self.SPY_CORRELATION_FALLBACK

        spy_closes     = np.array([bar.close for bar in spy_snapshot.history])
        spy_log_returns = np.diff(np.log(spy_closes))

        # Use the minimum available length, capped at `window`
        n = min(len(asset_log_returns), len(spy_log_returns), window)
        if n < 10:
            return self.SPY_CORRELATION_FALLBACK

        a = asset_log_returns[-n:]
        s = spy_log_returns[-n:]

        if np.std(a) < 1e-10 or np.std(s) < 1e-10:
            return 0.0

        return float(np.corrcoef(a, s)[0, 1])

    # Helpers
    def _snapshot_to_df(self, snapshot: MarketSnapshot) -> pd.DataFrame:
        # Convert a MarketSnapshot's price bars to a DataFrame
        records = [
            {"date": b.date, "open": b.open, "high": b.high,
             "low": b.low,   "close": b.close, "volume": b.volume}
            for b in snapshot.history
        ]
        return pd.DataFrame(records).set_index("date")

    def features_to_vector(self, feat: AssetFeatures) -> list[float]:

        # Flatten AssetFeatures to a plain numeric list for ML input
        # Order must match the training feature order
        return [
            feat.log_return_1d,
            feat.log_return_5d,
            feat.ma_20,
            feat.ma_50,
            feat.rsi_14,
            feat.macd,
            feat.macd_signal,
            feat.rolling_vol_20d,
            feat.market_corr_60d,
            feat.weight_in_portfolio,
        ]
