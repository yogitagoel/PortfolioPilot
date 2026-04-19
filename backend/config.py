# Central configuration

from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache

class Settings(BaseSettings):
    app_name: str = "PortfolioPilot"
    app_env: str = Field(default="development", alias="APP_ENV")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    port: int = Field(default=8000, alias="PORT")

    # Market data
    market_data_provider: str = Field(default="yfinance", alias="MARKET_DATA_PROVIDER")
    market_data_interval: str = Field(default="1h", alias="MARKET_DATA_INTERVAL")
    intraday_history_days: int = Field(default=60, alias="INTRADAY_HISTORY_DAYS")

    # Finance Constants
    risk_free_rate: float = Field(default=0.05, alias="RISK_FREE_RATE")
    var_confidence: float = Field(default=0.95, alias="VAR_CONFIDENCE")

    # ML
    model_dir: str = Field(default="./backend/data/models", alias="MODEL_DIR")
    
    class Config:
        env_file = ".env"
        populate_by_name = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()