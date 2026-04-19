
# Risk Scoring Model

from __future__ import annotations

import numpy as np
from loguru import logger

from backend.models.schemas import (
    RiskEngineOutput, MLPrediction, RiskScore, RiskPreference,
)


# Reference Ranges
 VOL_RANGE       = (0.10, 0.80)
_VAR_RANGE       = (-0.12, 0.00)
_SHARPE_RANGE    = (-1.0,  3.0)
_PRED_VOL_RANGE  = (0.10, 0.80)
_PRED_RET_RANGE  = (-0.20, 0.20)

# Component weights
_WEIGHTS = {
    "volatility":     0.25,
    "var":            0.20,
    "sharpe":         0.15,
    "predicted_vol":  0.10,
    "predicted_ret":  0.10,
    "position_size":  0.10,   
    "preference":     0.10,   # user risk tolerance adjustment
}

# Position size reference
_POSITION_SIZE_RANGE = (1_000.0, 500_000.0)

# Risk preference multipliers on the raw score
_PREFERENCE_BIAS = {
    RiskPreference.LOW:    +12,   # conservative 
    RiskPreference.MEDIUM:   0,   # balanced    
    RiskPreference.HIGH:   -10,   # aggressive   
}


class RiskScorer:

    def compute(
        self,
        risk_output:  RiskEngineOutput,
        predictions:  list[MLPrediction],
        preference:   RiskPreference = RiskPreference.MEDIUM,
        portfolio_notional: float = 0.0,
    ) -> RiskScore:
       
        try:
            return self._compute_internal(
                risk_output, predictions, preference, portfolio_notional
            )
        except Exception as exc:
            logger.error(
                f"[RiskScorer] Scoring failed: {exc}. "
                "Returning conservative fallback score of 75 (HIGH)."
            )
            return RiskScore(
                score=75.0,
                label="HIGH",
                vol_contribution=0.0,
                var_contribution=0.0,
                sharpe_contribution=0.0,
                rationale=(
                    "Risk Score 75/100 (HIGH): scoring pipeline encountered an error — "
                    "defaulting to HIGH risk as a precautionary measure. "
                    "Please check logs and verify market data."
                ),
            )

    def _compute_internal(
        self,
        risk_output:  RiskEngineOutput,
        predictions:  list[MLPrediction],
        preference:   RiskPreference,
        portfolio_notional: float,
    ) -> RiskScore:
        # Extract portfolio-level inputs
        port_vol    = risk_output.portfolio_volatility
        var_95      = risk_output.var_95
        sharpe      = risk_output.sharpe_ratio

        # Aggregate ML predictions 
        pred_vol = float(np.mean([p.predicted_volatility for p in predictions])) \
            if predictions else port_vol
        pred_ret = float(np.mean([p.predicted_return for p in predictions])) \
            if predictions else 0.0

        # Normalise each component to [0, 1] 
        vol_norm      = self._normalise(port_vol,  *_VOL_RANGE,       clip=True)
        var_norm      = self._normalise(var_95, 0.0, 0.12,            clip=True)
        sharpe_norm   = 1 - self._normalise(sharpe, *_SHARPE_RANGE,   clip=True)
        pred_vol_norm = self._normalise(pred_vol,  *_PRED_VOL_RANGE,  clip=True)
        pred_ret_norm = 1 - self._normalise(pred_ret, *_PRED_RET_RANGE, clip=True)

        # Position size factor 
        size_norm = self._normalise(
            portfolio_notional, *_POSITION_SIZE_RANGE, clip=True
        )

        # Risk preference factor
        pref_norm = {RiskPreference.LOW: 0.75, RiskPreference.MEDIUM: 0.5, RiskPreference.HIGH: 0.25}
        pref_factor = pref_norm.get(preference, 0.5)

        # Weighted sum
        raw_score = (
            _WEIGHTS["volatility"]    * vol_norm      +
            _WEIGHTS["var"]           * var_norm      +
            _WEIGHTS["sharpe"]        * sharpe_norm   +
            _WEIGHTS["predicted_vol"] * pred_vol_norm +
            _WEIGHTS["predicted_ret"] * pred_ret_norm +
            _WEIGHTS["position_size"] * size_norm     +
            _WEIGHTS["preference"]    * pref_factor
        )

        # Scale to [0, 100]
        score = float(np.clip(raw_score * 100 + _PREFERENCE_BIAS.get(preference, 0), 0, 100))

        # Per-component contributions
        vol_contrib    = _WEIGHTS["volatility"]    * vol_norm    * 100
        var_contrib    = _WEIGHTS["var"]           * var_norm    * 100
        sharpe_contrib = _WEIGHTS["sharpe"]        * sharpe_norm * 100

        # Label
        label = self._score_to_label(score)
        rationale = self._build_rationale(
            score, port_vol, var_95, sharpe, pred_vol, pred_ret, label,
            preference, portfolio_notional,
        )

        logger.info(
            f"Risk Score: {score:.1f} ({label}) "
            f"[pref={preference.value}, notional=${portfolio_notional:,.0f}]"
        )

        return RiskScore(
            score=round(score, 2),
            label=label,
            vol_contribution=round(vol_contrib, 2),
            var_contribution=round(var_contrib, 2),
            sharpe_contribution=round(sharpe_contrib, 2),
            rationale=rationale,
        )

    # Threshold Adjustment per Risk Preference

    @staticmethod
    def effective_threshold(
        base_threshold: float,
        preference:     RiskPreference,
    ) -> float:
        
        offsets = {
            RiskPreference.LOW:    -15,
            RiskPreference.MEDIUM:   0,
            RiskPreference.HIGH:   +15,
        }
        return base_threshold + offsets.get(preference, 0)

    # Helpers
    
    @staticmethod
    def _normalise(
        value: float,
        lo:    float,
        hi:    float,
        clip:  bool = True,
    ) -> float:
        """Linear normalisation: maps [lo, hi] → [0, 1]."""
        if hi == lo:
            return 0.5
        normalised = (value - lo) / (hi - lo)
        return float(np.clip(normalised, 0.0, 1.0)) if clip else float(normalised)

    @staticmethod
    def _score_to_label(score: float) -> str:
        if score < 25:
            return "LOW"
        elif score < 50:
            return "MODERATE"
        elif score < 75:
            return "HIGH"
        else:
            return "EXTREME"

    @staticmethod
    def _build_rationale(
        score:    float,
        vol:      float,
        var:      float,
        sharpe:   float,
        pred_vol: float,
        pred_ret: float,
        label:    str,
        preference: RiskPreference = RiskPreference.MEDIUM,
        portfolio_notional: float = 0.0,
    ) -> str:
        parts = []

        # Volatility comment
        if vol > 0.4:
            parts.append(f"portfolio volatility is very high at {vol:.0%}")
        elif vol > 0.2:
            parts.append(f"portfolio volatility is elevated at {vol:.0%}")
        else:
            parts.append(f"portfolio volatility is low at {vol:.0%}")

        # VaR comment
        if var < -0.03:
            parts.append(f"1-day VaR of {var:.1%} signals meaningful tail risk")
        else:
            parts.append(f"1-day VaR of {var:.1%} is within normal bounds")

        # Sharpe comment
        if sharpe > 1.5:
            parts.append(f"strong risk-adjusted returns (Sharpe {sharpe:.2f})")
        elif sharpe > 0.5:
            parts.append(f"acceptable risk-adjusted returns (Sharpe {sharpe:.2f})")
        else:
            parts.append(f"poor risk-adjusted returns (Sharpe {sharpe:.2f})")

        # ML forward-looking
        if pred_vol > vol * 1.2:
            parts.append("ML model expects volatility to increase — forward-looking risk is higher")
        elif pred_vol < vol * 0.8:
            parts.append("ML model expects volatility to decrease — conditions may improve")

        # Position size comment
        if portfolio_notional > 100_000:
            parts.append(f"total portfolio value is ${portfolio_notional:,.0f} — significant capital at risk")
        elif portfolio_notional > 10_000:
            parts.append(f"portfolio value is ${portfolio_notional:,.0f}")

        # Preference comment
        pref_labels = {
            RiskPreference.LOW: "conservative (LOW risk tolerance) — score adjusted upward",
            RiskPreference.HIGH: "aggressive (HIGH risk tolerance) — score adjusted downward",
        }
        if preference in pref_labels:
            parts.append(f"user preference is {pref_labels[preference]}")

        return (
            f"Risk Score {score:.0f}/100 ({label}): "
            + "; ".join(parts) + "."
        )
