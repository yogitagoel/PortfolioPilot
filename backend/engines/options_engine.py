# Black-Scholes and Binomial Tree option pricing engine : Computes the five Greeks for every option in the portfolio, then
# aggregates them to net portfolio-level Greeks.

from __future__ import annotations
import math
import numpy as np
from scipy.stats import norm

from backend.config         import get_settings
from backend.models.schemas import (OptionContract, OptionType, OptionStyle, PositionSide, MarketSnapshot, OptionGreeks, PortfolioGreeks)

def _bs_d1_d2(
    S: float,   # current underlying price
    K: float,   # strike
    T: float,   # time to expiry in years
    r: float,   # risk-free rate (annual)
    sigma: float,   # annualised volatility
) -> tuple[float, float]:
    
    # Compute d1 and d2 for Black-Scholes
    if sigma < 1e-8 or T < 1e-8:
        return 0.0, 0.0
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return d1, d2


def _bs_price(S: float, K: float, T: float, r: float, sigma: float, option_type: OptionType) -> float:

    # Black-Scholes theoretical price
    d1, d2 = _bs_d1_d2(S, K, T, r, sigma)
    if option_type == OptionType.CALL:
        return S * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2)
    else:
        return K * math.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)


def _bs_greeks(S: float, K: float, T: float, r: float, sigma: float, option_type: OptionType) -> dict[str, float]:

    # Compute all five Greeks via Black-Scholes closed-form.
    if T < 1e-6:
        intrinsic = max(S - K, 0) if option_type == OptionType.CALL else max(K - S, 0)
        return {
            "price": intrinsic,
            "delta": 1.0 if (option_type == OptionType.CALL and S > K) else 0.0,
            "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0,
        }

    d1, d2 = _bs_d1_d2(S, K, T, r, sigma)
    N       = norm.cdf
    N_prime = norm.pdf 

    price = _bs_price(S, K, T, r, sigma, option_type)

    # Delta
    if option_type == OptionType.CALL:
        delta = N(d1)
    else:
        delta = N(d1) - 1

    # Gamma 
    gamma = N_prime(d1) / (S * sigma * math.sqrt(T))

    # Theta (per year)
    if option_type == OptionType.CALL:
        theta_annual = (-(S * N_prime(d1) * sigma) / (2 * math.sqrt(T)) - r * K * math.exp(-r * T) * N(d2))
    else:
        theta_annual = (-(S * N_prime(d1) * sigma) / (2 * math.sqrt(T)) + r * K * math.exp(-r * T) * N(-d2))
    theta = theta_annual / 365   # per calendar day

    # Vega (per 1% move in sigma = per 0.01 change in sigma)
    vega = S * N_prime(d1) * math.sqrt(T) / 100

    # Rho (per 1% move in r)
    if option_type == OptionType.CALL:
        rho = K * T * math.exp(-r * T) * N(d2) / 100
    else:
        rho = -K * T * math.exp(-r * T) * N(-d2) / 100

    return {
        "price": price,
        "delta": delta,
        "gamma": gamma,
        "theta": theta,
        "vega":  vega,
        "rho":   rho,
    }

# Binomial Tree (CRR — American options)
def _binomial_price(S: float, K: float, T: float, r: float, sigma: float, option_type: OptionType, steps: int = 200) -> float:

    # Cox-Ross-Rubinstein binomial tree for American options.
    # Allows early exercise at every node.
    # u = e^{σ√Δt}       (up factor)
    # d = 1/u             (down factor — CRR recombining tree)
    # p = (e^{rΔt} - d) / (u - d)  (risk-neutral probability)
    
    dt = T / steps
    u  = math.exp(sigma * math.sqrt(dt))
    d  = 1 / u
    p  = (math.exp(r * dt) - d) / (u - d)
    p  = max(0.0, min(1.0, p))   # clamp to [0,1] for numerical stability
    discount = math.exp(-r * dt)

    # Build terminal stock prices
    stock = np.array([S * (u ** (steps - 2 * j)) for j in range(steps + 1)])

    # Terminal payoffs
    if option_type == OptionType.CALL:
        values = np.maximum(stock - K, 0)
    else:
        values = np.maximum(K - stock, 0)

    # Backward induction with early exercise check
    for i in range(steps - 1, -1, -1):
        stock  = stock[:-1] / u   # one step back
        held   = discount * (p * values[:-1] + (1 - p) * values[1:])
        if option_type == OptionType.CALL:
            exercise = np.maximum(stock - K, 0)
        else:
            exercise = np.maximum(K - stock, 0)
        values = np.maximum(held, exercise)

    return float(values[0])


def _binomial_greeks(S: float, K: float, T: float, r: float, sigma: float, option_type: OptionType) -> dict[str, float]:

    # Approximate Greeks for American options via finite differences on the binomial tree
    price = _binomial_price(S, K, T, r, sigma, option_type)

    dS = S * 0.01   # 1% bump
    dt = 1 / 365    # 1 day bump

    p_up   = _binomial_price(S + dS, K, T, r, sigma, option_type)
    p_down = _binomial_price(S - dS, K, T, r, sigma, option_type)
    p_time = _binomial_price(S, K, max(T - dt, 1e-6), r, sigma, option_type)

    dsigma = 0.01
    p_vol_up = _binomial_price(S, K, T, r, sigma + dsigma, option_type)

    dr = 0.01
    p_rho_up = _binomial_price(S, K, T, r + dr, sigma, option_type)

    delta = (p_up - p_down) / (2 * dS)
    gamma = (p_up - 2 * price + p_down) / (dS ** 2)
    theta = (p_time - price)   # per day 
    vega  = (p_vol_up - price)   # per 1% IV
    rho   = (p_rho_up - price) / 100   # per 1% rate

    return {
        "price": price,
        "delta": delta,
        "gamma": gamma,
        "theta": theta,
        "vega":  vega,
        "rho":   rho,
    }

# Options Engine
class OptionsEngine:

    # Computes Greeks for all option contracts in a portfolio and aggregates them to net portfolio-level Greeks
    def __init__(self):
        self.settings = get_settings()

    def compute(
        self,
        options:         list[OptionContract],
        snapshots:       dict[str, MarketSnapshot],
        equity_delta:    float = 0.0,
        equity_gamma:    float = 0.0,
        equity_vega:     float = 0.0,
    ) -> PortfolioGreeks:
        
        # Price all options + compute their Greeks.
        # Sums with equity-approximated Greeks to get net portfolio Greeks.

        r = self.settings.risk_free_rate
        option_greeks_list: list[OptionGreeks] = []

        net_delta = equity_delta
        net_gamma = equity_gamma
        net_vega  = equity_vega
        net_theta = 0.0
        net_rho   = 0.0

        for opt in options:
            snap = snapshots.get(opt.underlying)
            if snap is None:
                continue

            S     = snap.current_price
            K     = opt.strike
            T     = opt.time_to_expiry_years
            sigma = opt.implied_vol if opt.implied_vol else snap.rolling_vol_20d

            # Fallback: if historical vol is 0
            if sigma < 0.01:
                sigma = 0.20

            # Price + Greeks
            if opt.style == OptionStyle.EUROPEAN:
                greeks_raw = _bs_greeks(S, K, T, r, sigma, opt.option_type)
            else:
                greeks_raw = _binomial_greeks(S, K, T, r, sigma, opt.option_type)

            per_share_price  = greeks_raw["price"]
            per_share_delta  = greeks_raw["delta"]
            per_share_gamma  = greeks_raw["gamma"]
            per_share_theta  = greeks_raw["theta"]
            per_share_vega   = greeks_raw["vega"]
            per_share_rho    = greeks_raw["rho"]

            # Position scaling: per-share × 100 × contracts × side_sign
            scale = opt.notional_shares * opt.side_sign

            pos_delta = per_share_delta * scale
            pos_gamma = per_share_gamma * scale
            pos_theta = per_share_theta * scale
            pos_vega  = per_share_vega  * scale
            pos_rho   = per_share_rho   * scale

            # Intrinsic + time value
            if opt.option_type == OptionType.CALL:
                intrinsic = max(S - K, 0)
            else:
                intrinsic = max(K - S, 0)
            time_value = max(per_share_price - intrinsic, 0)

            # Moneyness
            if abs(S - K) / K < 0.02:
                moneyness = "ATM"
            elif (opt.option_type == OptionType.CALL and S > K) or \
                 (opt.option_type == OptionType.PUT  and S < K):
                moneyness = "ITM"
            else:
                moneyness = "OTM"

            og = OptionGreeks(
                underlying=opt.underlying,
                option_type=opt.option_type,
                strike=K,
                expiry=opt.expiry,
                side=opt.side,
                contracts=opt.contracts,
                delta=round(per_share_delta, 6),
                gamma=round(per_share_gamma, 6),
                theta=round(per_share_theta, 6),
                vega=round(per_share_vega,   6),
                rho=round(per_share_rho,     6),
                position_delta=round(pos_delta, 4),
                position_gamma=round(pos_gamma, 4),
                position_vega=round(pos_vega,   4),
                position_theta=round(pos_theta, 4),
                position_rho=round(pos_rho,     4),
                theoretical_price=round(per_share_price, 4),
                implied_vol=round(sigma, 4),
                intrinsic_value=round(intrinsic, 4),
                time_value=round(time_value, 4),
                moneyness=moneyness,
                days_to_expiry=opt.days_to_expiry,
            )
            option_greeks_list.append(og)

            net_delta += pos_delta
            net_gamma += pos_gamma
            net_theta += pos_theta
            net_vega  += pos_vega
            net_rho   += pos_rho

        return PortfolioGreeks(
            net_delta=round(net_delta, 4),
            net_gamma=round(net_gamma, 6),
            net_vega=round(net_vega,   4),
            net_theta=round(net_theta, 4),
            net_rho=round(net_rho,     4),
            option_greeks=option_greeks_list,
        )

    def pnl_scenarios(
        self,
        options:   list[OptionContract],
        snapshots: dict[str, MarketSnapshot],
    ) -> dict[str, float]:
        
        # Compute approximate P&L for different underlying price scenarios.
        scenarios: dict[str, float] = {}
        r = self.settings.risk_free_rate

        for opt in options:
            snap = snapshots.get(opt.underlying)
            if not snap:
                continue

            S     = snap.current_price
            sigma = opt.implied_vol or snap.rolling_vol_20d or 0.20

            for pct in [-0.20, -0.10, -0.05, 0.0, +0.05, +0.10, +0.20]:
                S_scenario = S * (1 + pct)
                payoff = (
                    max(S_scenario - opt.strike, 0)
                    if opt.option_type == OptionType.CALL
                    else max(opt.strike - S_scenario, 0)
                )
                # Subtract premium paid (cost basis per share)
                cost  = opt.premium_paid or _bs_price(S, opt.strike, opt.time_to_expiry_years, r, sigma, opt.option_type)
                net   = (payoff - cost) * opt.notional_shares * opt.side_sign
                key   = f"{opt.underlying}_{pct:+.0%}"
                scenarios[key] = round(scenarios.get(key, 0) + net, 2)

        return scenarios
