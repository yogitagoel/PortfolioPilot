const riskLevelColor = {
  LOW: "var(--green)",
  MEDIUM: "var(--amber)",
  HIGH: "var(--red)",
};

function riskLevel(val, low, med) {
  if (val < low) return "LOW";
  if (val < med) return "MEDIUM";
  return "HIGH";
}

function GreekRiskRow({ label, value, level, description, unit = "" }) {
  const c = riskLevelColor[level] || "var(--text-3)";
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      padding: "11px 0",
      borderBottom: "1px solid var(--border-2)",
      gap: 12,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 15, fontFamily: "var(--font-mono)", color: "var(--text)" }}>
          {label}
        </span>
        <span style={{ fontSize: 15, color: "var(--text-3)", lineHeight: 1.4 }}>
          {description}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 700, color: c,
        }}>
          {typeof value === "number" ? value.toFixed(4) : value}{unit}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700, letterSpacing: ".08em",
          background: `${c}18`, border: `1px solid ${c}60`,
          color: c, borderRadius: 4, padding: "2px 7px",
        }}>
          {level} RISK
        </span>
      </div>
    </div>
  );
}

function MLFusionRow({ symbol, predReturn, predVol, confidence, impliedVol }) {
  const volDiff = impliedVol != null ? predVol - impliedVol : null;
  const returnColor = predReturn >= 0 ? "var(--green)" : "var(--red)";
  const volColor = predVol > 0.4 ? "var(--red)" : predVol > 0.2 ? "var(--amber)" : "var(--cyan)";

  return (
    <div style={{
      background: "var(--bg-2)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "11px 14px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "var(--cyan)" }}>
        {symbol}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <div>
          <div style={{ fontSize: 14, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em" }}>
            ML Pred. Return
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, color: returnColor }}>
            {predReturn >= 0 ? "+" : ""}{(predReturn * 100).toFixed(3)}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: 14, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em" }}>
            ML Pred. Vol
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, color: volColor }}>
            {(predVol * 100).toFixed(2)}%
          </div>
        </div>
        {volDiff !== null && (
          <div style={{ gridColumn: "1/-1" }}>
            <div style={{ fontSize: 14, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em" }}>
              ML Vol vs. Implied Vol
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600,
              color: Math.abs(volDiff) > 0.1 ? "var(--red)" : "var(--amber)",
            }}>
              {volDiff >= 0 ? "+" : ""}{(volDiff * 100).toFixed(2)}% divergence
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 14, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em" }}>
            Confidence
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600,
            color: confidence >= 0.7 ? "var(--green)" : "var(--amber)",
          }}>
            {(confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OptionsRiskPanel({ greeks, predictions, pnlScenarios, optionGreeks }) {
  const delta = greeks?.delta || 0;
  const gamma = (greeks?.gamma) || 0;
  const vega = (greeks?.vega) || 0;
  const theta = greeks?.theta || 0;
  const rho = greeks?.rho || 0;

  const absDelta = Math.abs(delta);
  const absGamma = Math.abs(gamma);
  const absVega = Math.abs(vega);

  const deltaLevel = riskLevel(absDelta, 0.3, 0.7);
  const gammaLevel = riskLevel(absGamma, 0.01, 0.05);
  const vegaLevel = riskLevel(absVega, 20, 80);

  const impliedVolMap = {};
  (optionGreeks || []).forEach(g => {
    if (!impliedVolMap[g.underlying]) impliedVolMap[g.underlying] = [];
    impliedVolMap[g.underlying].push(g.implied_vol);
  });
  const avgImpliedVol = {};
  Object.entries(impliedVolMap).forEach(([sym, vals]) => {
    avgImpliedVol[sym] = vals.reduce((s, v) => s + v, 0) / vals.length;
  });

  const greekScore = Math.min(100,
    absDelta * 40 +
    absGamma * 400 +
    absVega * 0.4
  );
  const mlVolAvg = predictions.length
    ? predictions.reduce((s, p) => s + p.predicted_volatility, 0) / predictions.length
    : 0;
  const mlScore = Math.min(100, mlVolAvg * 250);
  const combinedScore = Math.round(greekScore * 0.6 + mlScore * 0.4);
  const combinedLevel = combinedScore >= 67 ? "HIGH" : combinedScore >= 34 ? "MEDIUM" : "LOW";
  const combinedColor = riskLevelColor[combinedLevel];

  const card = {
    background: "var(--bg-1)", border: "1px solid var(--border)",
    borderRadius: 10, padding: "18px 20px",
  };
  const sectionTitle = {
    fontSize: 15, fontWeight: 700, color: "var(--text-3)",
    textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 14,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      <div style={{
        ...card,
        borderLeft: `3px solid ${combinedColor}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ flex: 1, paddingRight: 30 }}>
          <div style={{ fontSize: 15, color: "#fff", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>
            Combined Options Risk Score (Greeks + ML)
          </div>
          <div style={{ fontSize: 15, color: "var(--text-3)", lineHeight: 1.7 }}>
            Fuses net portfolio Greek sensitivity (delta, gamma, vega) with ML-predicted volatility.
            Delta/gamma reflect directional and convexity exposure; vega reflects IV sensitivity;
            ML prediction gives a forward-looking overlay.
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "center" }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 38, fontWeight: 800, color: combinedColor, lineHeight: 1,
          }}>
            {combinedScore}
          </div>
          <div style={{ fontSize: 15, color: "var(--text-3)", marginTop: 4 }}>/ 100</div>
          <div style={{
            marginTop: 8, fontSize: 13, fontWeight: 700, letterSpacing: ".08em",
            background: `${combinedColor}18`, border: `1px solid ${combinedColor}60`,
            color: combinedColor, borderRadius: 5, padding: "3px 10px",
          }}>
            {combinedLevel} RISK
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>Greek Risk Factors</div>
        <GreekRiskRow
          label="Delta (Direction)"
          value={delta}
          level={deltaLevel}
          description="Net directional exposure — how much portfolio value changes per $1 move in the underlying. High delta means large directional bet."
        />
        <GreekRiskRow
          label="Gamma (Convexity)"
          value={gamma}
          level={gammaLevel}
          description="Rate of change of delta — high gamma means delta itself changes rapidly as price moves, increasing re-hedging costs and tail risk."
        />
        <GreekRiskRow
          label="Vega (Vol Sensitivity)"
          value={vega}
          level={vegaLevel}
          description="P&L sensitivity to a 1% change in implied volatility. High vega portfolios profit or lose significantly when IV spikes or collapses."
        />
        <GreekRiskRow
          label="Theta (Time Decay)"
          value={theta}
          level={theta < 0 ? "HIGH" : "LOW"}
          description="Daily P&L erosion from time passing. Negative theta means you lose value every day options approach expiry (buyers pay this cost)."
        />
        <div style={{ paddingTop: 11 }}>
          <GreekRiskRow
            label="Rho (Rate Sensitivity)"
            value={rho}
            level={Math.abs(rho) > 50 ? "MEDIUM" : "LOW"}
            description="P&L sensitivity to a 1% change in the risk-free interest rate. Most relevant for long-dated options."
          />
        </div>
      </div>
    </div>
  );
}