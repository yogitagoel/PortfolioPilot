from typing import Optional
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum
import datetime

class RiskPreference(str, Enum):
    LOW    = "low"
    MEDIUM = "medium"
    HIGH   = "high"

class OptionType(str, Enum):
    CALL = "CALL"
    PUT  = "PUT"

class OptionStyle(str, Enum):
    EUROPEAN = "EUROPEAN"
    AMERICAN = "AMERICAN"

class PositionSide(str, Enum):
    LONG  = "LONG"
    SHORT = "SHORT"

class EquityPosition(BaseModel):
    # A stock/ETF holding
    symbol: str   = Field(..., description="Ticker symbol e.g. AAPL")
    qty:    float = Field(..., gt=0, description="Number of shares")

    @field_validator("symbol")
    @classmethod
    def upper_symbol(cls, v: str) -> str:
        return v.strip().upper()
    
class OptionContract(BaseModel):

    # A single option leg.
    # underlying   : ticker of the underlying (e.g. "AAPL")
    # option_type  : CALL | PUT
    # style        : EUROPEAN (Black-Scholes) | AMERICAN (Binomial tree)
    # strike       : strike price K
    # expiry       : expiration date YYYY-MM-DD (must be in the future)
    # contracts    : number of contracts (1 contract controls 100 shares)
    # side         : LONG (you bought) | SHORT (you sold/wrote)
    # premium_paid : cost basis per share when entered (optional)
    # implied_vol  : IV override; if None, estimated from historical vol

    underlying:   str          = Field(..., description="Underlying ticker")
    option_type:  OptionType
    style:        OptionStyle  = OptionStyle.EUROPEAN
    strike:       float        = Field(..., gt=0)
    expiry:       str          = Field(..., description="YYYY-MM-DD")
    contracts:    float        = Field(default=1.0, gt=0)
    side:         PositionSide = PositionSide.LONG
    premium_paid: Optional[float] = Field(default=None, ge=0)
    implied_vol:  Optional[float] = Field(default=None, gt=0, le=5.0)

    @field_validator("underlying")
    @classmethod
    def upper_underlying(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("expiry")
    @classmethod
    def validate_expiry_format(cls, v: str) -> str:
        try:
            datetime.datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("expiry must be YYYY-MM-DD")
        return v

    @model_validator(mode="after")
    def expiry_must_be_future(self) -> "OptionContract":
        exp = datetime.datetime.strptime(self.expiry, "%Y-%m-%d").date()
        if exp <= datetime.date.today():
            raise ValueError("Option expiry must be in the future")
        return self

    @property
    def expiry_date(self) -> datetime.date:
        return datetime.datetime.strptime(self.expiry, "%Y-%m-%d").date()

    @property
    def days_to_expiry(self) -> int:
        return max((self.expiry_date - datetime.date.today()).days, 0)

    @property
    def time_to_expiry_years(self) -> float:
        return max(self.days_to_expiry / 365.0, 1e-6)

    @property
    def notional_shares(self) -> float:
        return self.contracts * 100

    @property
    def side_sign(self) -> float:
        # +1 for LONG, -1 for SHORT — used when aggregating Greeks
        return 1.0 if self.side == PositionSide.LONG else -1.0
    
class PortfolioInput(BaseModel):
    # Accepts equities + options.
    equities:        list[EquityPosition] = Field(default_factory=list)
    options:         list[OptionContract] = Field(default_factory=list)
    risk_preference: RiskPreference       = RiskPreference.MEDIUM

    @model_validator(mode="after")
    def at_least_one_position(self) -> "PortfolioInput":
        if not self.equities and not self.options:
            raise ValueError("Portfolio must contain at least one equity or option")
        return self

    @property
    def all_symbols(self) -> list[str]:
        syms = {e.symbol for e in self.equities}
        syms |= {o.underlying for o in self.options}
        return sorted(syms)

    @property
    def assets(self) -> list[EquityPosition]:
        return self.equities
    
class PriceBar(BaseModel):
    date:   str
    open:   float
    high:   float
    low:    float
    close:  float
    volume: float

class MarketSnapshot(BaseModel):
    symbol:          str
    current_price:   float
    daily_return:    float
    rolling_vol_20d: float
    history:         list[PriceBar]


class OptionGreeks(BaseModel):

    # Full Black-Scholes Greeks for one option leg.
    underlying:   str
    option_type:  OptionType
    strike:       float
    expiry:       str
    side:         PositionSide
    contracts:    float

    # Per-share Greeks
    delta:  float
    gamma:  float
    theta:  float
    vega:   float
    rho:    float

    # Position-level Greeks
    position_delta: float
    position_gamma: float
    position_vega:  float
    position_theta: float
    position_rho:   float

    # Pricing info
    theoretical_price: float
    implied_vol:       float
    intrinsic_value:   float
    time_value:        float
    moneyness:         str   # "ITM" | "ATM" | "OTM"
    days_to_expiry:    int

class PortfolioGreeks(BaseModel):
    # Net Greeks across the entire portfolio (equities + options)
    net_delta:     float
    net_gamma:     float
    net_vega:      float
    net_theta:     float
    net_rho:       float
    option_greeks: list[OptionGreeks] = Field(default_factory=list)

class RiskEngineOutput(BaseModel):
    portfolio_volatility:    float
    var_95:                  float
    sharpe_ratio:            float
    portfolio_greeks:        PortfolioGreeks
    asset_weights:           dict[str, float]
    covariance_matrix:       dict[str, dict[str, float]]
    total_options_notional:  float = 0.0
    options_pnl_scenarios:   dict[str, float] = Field(default_factory=dict)

class AssetFeatures(BaseModel):
    symbol:              str
    log_return_1d:       float
    log_return_5d:       float
    ma_20:               float
    ma_50:               float
    rsi_14:              float
    macd:                float
    macd_signal:         float
    rolling_vol_20d:     float
    market_corr_60d:     float
    weight_in_portfolio: float

class MLPrediction(BaseModel):
    symbol:               str
    predicted_return:     float
    predicted_volatility: float
    confidence:           float
