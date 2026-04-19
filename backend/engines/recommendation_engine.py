
# Recommendation Engine

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from loguru   import logger

from backend.models.schemas import (
    PortfolioInput, RiskEngineOutput, RiskScore,
    MLPrediction, AssetFeatures, MarketSnapshot,
    Recommendation, RecommendationOutput,
    ActionType, RiskPreference,
)
from backend.engines.risk_scoring import RiskScorer

# Threshold Constants

_RISK_HIGH_THRESHOLD    = 60.0
_RISK_EXTREME_THRESHOLD = 75.0
_RISK_LOW_THRESHOLD     = 35.0

_RETURN_BULLISH_THRESHOLD = 0.002    # +0.2% predicted daily return
_RETURN_BEARISH_THRESHOLD = -0.002   # -0.2% predicted daily return

_VOL_SPIKE_FACTOR = 1.30   # 30% increase in predicted vs current vol


class RecommendationEngine:
    """
    Stateless recommendation generator.
    Call `generate(...)` once per user analysis request.
    """

    def __init__(self):
        self.scorer = RiskScorer()

    def generate(
        self,
        portfolio:      PortfolioInput,
        risk_output:    RiskEngineOutput,
        predictions:    list[MLPrediction],
        features:       list[AssetFeatures],
        risk_score:     RiskScore,
        snapshots:      dict[str, MarketSnapshot],
    ) -> RecommendationOutput:
        """
        Generate per-asset recommendations and a portfolio-level summary.
        """
        preference = portfolio.risk_preference
        pref_adj   = self.scorer.effective_threshold(0, preference)
        alerts: list[str] = []

        pred_map = {p.symbol: p for p in predictions}
        feat_map = {f.symbol: f for f in features}

        recommendations: list[Recommendation] = []

        effective_high    = _RISK_HIGH_THRESHOLD    + pref_adj
        effective_extreme = _RISK_EXTREME_THRESHOLD + pref_adj

        # Portfolio-level alerts
        if risk_score.score >= effective_extreme:
            alerts.append(
                f" EXTREME RISK detected (score {risk_score.score:.0f}). "
                "Immediate position review recommended."
            )
        elif risk_score.score >= effective_high:
            alerts.append(
                f" HIGH RISK detected (score {risk_score.score:.0f}). "
                "Consider reducing exposure."
            )

        # Per-asset recommendations
        for asset in portfolio.assets:
            sym  = asset.symbol
            pred = pred_map.get(sym)
            feat = feat_map.get(sym)
            snap = snapshots.get(sym)
            try:
                rec = self._recommend_asset(
                    symbol=sym,
                    pred=pred,
                    feat=feat,
                    snap=snap,
                    risk_score=risk_score,
                    preference=preference,
                    pref_adj=pref_adj,
                    current_weight=risk_output.asset_weights.get(sym, 0.0),
                )
            except Exception as exc:
                logger.error(
                    f"[RecommendationEngine] Failed to generate recommendation "
                    f"for '{sym}': {exc}. Falling back to HOLD."
                )
                rec = Recommendation(
                    action=ActionType.HOLD,
                    symbol=sym,
                    confidence=0.10,
                    reason=(
                        f"Recommendation could not be computed for {sym} due to "
                        "a data error. Defaulting to HOLD as a precaution."
                    ),
                    target_weight=risk_output.asset_weights.get(sym, 0.0),
                )
            recommendations.append(rec)

            # Asset-level volatility spike alert
            if pred and snap:
                if pred.predicted_volatility > snap.rolling_vol_20d * _VOL_SPIKE_FACTOR:
                    alerts.append(
                        f"📈 {sym}: Volatility spike expected "
                        f"(predicted {pred.predicted_volatility:.1%} vs "
                        f"current {snap.rolling_vol_20d:.1%})"
                    )

        summary = self._build_summary(risk_score, recommendations, preference)

        logger.info(
            f"Recommendations: "
            f"{[r.action.value + ':' + r.symbol for r in recommendations]}"
        )

        return RecommendationOutput(
            portfolio_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc).isoformat(),
            risk_score=risk_score,
            recommendations=recommendations,
            summary=summary,
            alerts=alerts,
        )

    # Per-asset Decision Logic

    def _recommend_asset(
        self,
        symbol:         str,
        pred:           MLPrediction | None,
        feat:           AssetFeatures | None,
        snap:           MarketSnapshot | None,
        risk_score:     RiskScore,
        preference:     RiskPreference,
        pref_adj:       float,
        current_weight: float,
    ) -> Recommendation:
        
        effective_high    = _RISK_HIGH_THRESHOLD    + pref_adj
        effective_extreme = _RISK_EXTREME_THRESHOLD + pref_adj
        effective_low     = _RISK_LOW_THRESHOLD     + pref_adj

        pred_ret = pred.predicted_return     if pred else 0.0
        pred_vol = pred.predicted_volatility if pred else 0.0
        curr_vol = feat.rolling_vol_20d      if feat else 0.0
        conf     = pred.confidence           if pred else 0.3
        rsi      = feat.rsi_14               if feat else 50.0

        # Case 1: Extreme portfolio risk
        if risk_score.score >= effective_extreme:
            return Recommendation(
                action=ActionType.SELL,
                symbol=symbol,
                confidence=round(min(0.95, conf + 0.2), 4),
                reason=(
                    f"Portfolio risk is EXTREME (score {risk_score.score:.0f}/100). "
                    f"Reducing {symbol} exposure by 50% protects capital against "
                    "further drawdown. Rule: extreme risk → SELL."
                ),
                target_weight=max(0.0, current_weight * 0.5),
            )

        # Case 2: High risk + bearish prediction
        if risk_score.score >= effective_high and pred_ret < _RETURN_BEARISH_THRESHOLD:
            return Recommendation(
                action=ActionType.SELL,
                symbol=symbol,
                confidence=round(min(0.90, conf + 0.1), 4),
                reason=(
                    f"High portfolio risk (score {risk_score.score:.0f}/100) combined "
                    f"with a negative ML-predicted return of {pred_ret:.3%} for "
                    f"{symbol}. Both signals point to reducing exposure. "
                    "Rule: high risk + bearish outlook → SELL."
                ),
                target_weight=max(0.0, current_weight * 0.7),
            )

        # Case 3: Volatility spike
        if (
            curr_vol > 0
            and pred_vol > curr_vol * _VOL_SPIKE_FACTOR
            and risk_score.score >= effective_high
        ):
            return Recommendation(
                action=ActionType.HEDGE,
                symbol=symbol,
                confidence=round(conf * 0.85, 4),
                reason=(
                    f"ML model predicts {symbol} volatility will rise from "
                    f"{curr_vol:.1%} to {pred_vol:.1%} (+{(pred_vol/curr_vol - 1):.0%}). "
                    f"With portfolio risk already elevated (score {risk_score.score:.0f}), "
                    "hedging (e.g. protective put) is advised. "
                    "Rule: vol spike + high risk → HEDGE."
                ),
                target_weight=current_weight,
            )

        # Case 4: Opportunity — bullish + moderate risk
        if (
            risk_score.score < effective_high
            and pred_ret > _RETURN_BULLISH_THRESHOLD
            and rsi < 65
        ):
            return Recommendation(
                action=ActionType.BUY,
                symbol=symbol,
                confidence=round(min(0.92, conf + 0.05), 4),
                reason=(
                    f"Favourable conditions for {symbol}: ML-predicted return "
                    f"{pred_ret:.3%}, RSI {rsi:.0f} (not overbought), and portfolio "
                    f"risk is manageable (score {risk_score.score:.0f}/100). "
                    "Rule: bullish signal + moderate risk → BUY."
                ),
                target_weight=min(0.4, current_weight * 1.2),
            )

        # Case 5: Overbought + bearish
        if rsi > 75 and pred_ret < 0:
            return Recommendation(
                action=ActionType.SELL,
                symbol=symbol,
                confidence=round(conf * 0.8, 4),
                reason=(
                    f"{symbol} appears overbought (RSI {rsi:.0f} > 75) with a "
                    f"negative ML-predicted return of {pred_ret:.3%}. "
                    "Consider taking profits to lock in gains. "
                    "Rule: overbought + bearish → SELL."
                ),
                target_weight=max(0.0, current_weight * 0.8),
            )

        # Default: Hold
        return Recommendation(
            action=ActionType.HOLD,
            symbol=symbol,
            confidence=round(conf * 0.7, 4),
            reason=(
                f"No strong signal for {symbol}. Portfolio risk score is "
                f"{risk_score.score:.0f}/100, ML-predicted return is {pred_ret:.3%}, "
                f"and RSI is {rsi:.0f}. No action is required at this time. "
                "Rule: neutral conditions → HOLD."
            ),
            target_weight=current_weight,
        )

    # User-friendly Explainablity Layer

    @staticmethod
    def _build_summary(
        risk_score:      RiskScore,
        recommendations: list[Recommendation],
        preference:      RiskPreference,
    ) -> str:
        action_counts = {a: 0 for a in ActionType}
        for r in recommendations:
            action_counts[r.action] += 1

        buys   = action_counts[ActionType.BUY]
        sells  = action_counts[ActionType.SELL]
        holds  = action_counts[ActionType.HOLD]
        hedges = action_counts[ActionType.HEDGE]

        parts = [f"Risk {risk_score.label} ({risk_score.score:.0f}/100)."]

        if buys:
            parts.append(f"{buys} BUY signal{'s' if buys > 1 else ''}.")
        if sells:
            parts.append(f"{sells} SELL signal{'s' if sells > 1 else ''}.")
        if hedges:
            parts.append(f"{hedges} HEDGE signal{'s' if hedges > 1 else ''}.")
        if holds and not (buys or sells or hedges):
            parts.append("Portfolio looks stable — hold current positions.")

        # Surface the leading risk driver from the rationale string
        if risk_score.rationale:
            body = risk_score.rationale.split(":", 1)[-1].strip()
            driver = body.split(";")[0].strip().capitalize()
            if driver:
                parts.append(f"Key driver: {driver}.")

        # Preference context note
        pref_note = {
            RiskPreference.LOW:  "Thresholds tightened for your conservative profile.",
            RiskPreference.HIGH: "Thresholds relaxed for your aggressive profile.",
        }
        if preference in pref_note:
            parts.append(pref_note[preference])

        return " ".join(parts)
