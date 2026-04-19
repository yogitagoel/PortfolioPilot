from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta

import numpy  as np
import pandas as pd
import yfinance as yf

from backend.config   import get_settings
from backend.models.schemas import MarketSnapshot, PriceBar

# In-memory cache entry
class _CacheEntry:
    def __init__(self, snapshot: MarketSnapshot, ttl_seconds: int = 300):
        self.snapshot   = snapshot
        self.expires_at = time.monotonic() + ttl_seconds

    @property
    def is_valid(self) -> bool:
        return time.monotonic() < self.expires_at

# Main Pipeline 
class MarketDataPipeline:
    # Number of trading days
    HISTORY_DAYS = 252

    def __init__(self):
        self.settings = get_settings()
        self._cache: dict[str, _CacheEntry] = {}
        self._lock  = asyncio.Lock()

    # Public API 
    async def get_snapshot(self, symbol: str) -> MarketSnapshot:
        symbol = symbol.upper()
        async with self._lock:
            if symbol in self._cache and self._cache[symbol].is_valid:
                entry = self._cache[symbol]
                return entry.snapshot

            snapshot = await self._fetch(symbol)
            self._cache[symbol] = _CacheEntry(
                snapshot,
                ttl_seconds=self.settings.market_update_interval,
            )
            return snapshot

    async def get_snapshots(self, symbols: list[str]) -> dict[str, MarketSnapshot]:
        tasks   = [self.get_snapshot(s) for s in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        out: dict[str, MarketSnapshot] = {}
        failed: list[str] = []

        for sym, res in zip(symbols, results):
            if isinstance(res, Exception):
                failed.append(sym)
            else:
                out[sym] = res

        return out

    def invalidate(self, symbol: str) -> None:
        self._cache.pop(symbol.upper(), None)

    def invalidate_all(self) -> None:
        self._cache.clear()

    # Internal Fetch + Normalise 
    async def _fetch(self, symbol: str) -> MarketSnapshot:
        loop = asyncio.get_event_loop()
        df = await loop.run_in_executor(None, self._fetch_yfinance, symbol)
        return self._build_snapshot(symbol, df)

    # Provider Implementations 
    def _fetch_yfinance(self, symbol: str) -> pd.DataFrame:
        end   = datetime.today()
        start = end - timedelta(days=self.HISTORY_DAYS * 1.5)  # buffer for weekends
        ticker = yf.Ticker(symbol)
        df = ticker.history(start=start.strftime("%Y-%m-%d"),
                            end=end.strftime("%Y-%m-%d"),
                            interval="1d")
        if df.empty:
            raise ValueError(f"yfinance returned no data for {symbol}")
        df = df[["Open", "High", "Low", "Close", "Volume"]].tail(self.HISTORY_DAYS)
        df.index = df.index.strftime("%Y-%m-%d")
        return df

    # Snapshot Builder
    def _build_snapshot(self, symbol: str, df: pd.DataFrame) -> MarketSnapshot:
        closes = df["Close"].values.astype(float)
        log_returns = np.diff(np.log(closes))

        current_price   = float(closes[-1])
        daily_return    = float((closes[-1] / closes[-2] - 1) * 100) if len(closes) > 1 else 0.0
        rolling_vol_20d = float(np.std(log_returns[-20:]) * np.sqrt(252)) if len(log_returns) >= 20 else 0.0

        bars = [
            PriceBar(
                date=str(idx),
                open=float(row["Open"]),
                high=float(row["High"]),
                low=float(row["Low"]),
                close=float(row["Close"]),
                volume=float(row["Volume"]),
            )
            for idx, row in df.iterrows()
        ]

        return MarketSnapshot(
            symbol=symbol,
            current_price=current_price,
            daily_return=daily_return,
            rolling_vol_20d=rolling_vol_20d,
            history=bars,
        )
