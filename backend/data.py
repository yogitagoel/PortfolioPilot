# Market Data Pipeline

import asyncio
from datetime import datetime, timedelta

import pandas as pd
import yfinance as yf

class MarketDataPipeline:
    # Number of historical trading days (only working days)
    HISTORY_DAYS = 252  

    def __init__(self):
        self._lock=asyncio.Lock()

    def fetch(self,symbol:str)->pd.DataFrame:
        # yfinance: Returns data with columns: Open, High, Low, Close, Volume
        end=datetime.today()
        start=end-timedelta(days=self.HISTORY_DAYS*1.5)
        ticker=yf.Ticker(symbol)
        df=ticker.history(start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"),interval="1d")
        if df.empty:
            raise ValueError(f"yfinance returned no data for {symbol}")
        df=df[["Open", "High", "Low", "Close", "Volume"]].tail(self.HISTORY_DAYS)
        df.index=df.index.strftime("%Y-%m-%d")
        return df