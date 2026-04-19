
import { useState, useCallback } from "react";
import { computeScenarioLocally } from "../api/client.js";

function Slider({ label, min, max, step, value, onChange, unit="%" }) {
  const pct = ((value - min) / (max - min)) * 100;
  const c   = value > 0 ? "var(--green)" : value < 0 ? "var(--red)" : "var(--cyan)";

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
        <span style={{ fontSize:16, color:"var(--text-3)", textTransform:"uppercase", letterSpacing:".07em" }}>
          {label}
        </span>
        <span style={{ fontSize:16, fontFamily:"var(--font-mono)", color:c, fontWeight:600 }}>
          {value > 0 ? "+" : ""}{value}{unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(Number(e.target.value))}
        style={{ width:"100%", accentColor:c, cursor:"pointer" }}
      />
      <div style={{ display:"flex", justifyContent:"space-between",
        fontSize:15, color:"var(--text-3)", fontFamily:"var(--font-mono)", marginTop:3 }}>
        <span>{min}{unit}</span><span>0</span><span>+{max}{unit}</span>
      </div>
    </div>
  );
}

function DeltaRow({ label, base, stressed, fmt = v => v }) {
  const bVal = typeof base     === "number" ? base     : 0;
  const sVal = typeof stressed === "number" ? stressed : 0;
  const delta = sVal - bVal;
  const worse = delta > 0.0001;
  const better = delta < -0.0001;
  const color = worse ? "var(--red)" : better ? "var(--green)" : "var(--text-2)";

  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"7px 0", borderBottom:"1px solid var(--border-2)", fontSize:15,
    }}>
      <span style={{ color:"var(--text-3)" }}>{label}</span>
      <div style={{ display:"flex", gap:14, alignItems:"center", fontFamily:"var(--font-mono)" }}>
        <span style={{ color:"var(--text-2)" }}>{fmt(bVal)}</span>
        <span style={{ color:"var(--text-3)", fontSize:11 }}>→</span>
        <span style={{ color, fontWeight:600 }}>{fmt(sVal)}</span>
        <span style={{ fontSize:15, color, minWidth:44, textAlign:"right" }}>
          {delta >= 0 ? "+" : ""}{typeof delta==="number" ? delta.toFixed(4) : ""}
        </span>
      </div>
    </div>
  );
}

export default function ScenarioSimulator({ baseResult }) {
  const [priceShock, setPriceShock] = useState(0);
  const [volAdj,     setVolAdj]     = useState(0);
  const [stressed,   setStressed]   = useState(null);

  const run = useCallback(() => {
    if (!baseResult) return;
    const res = computeScenarioLocally(baseResult, priceShock, volAdj);
    setStressed(res);
  }, [baseResult, priceShock, volAdj]);

  const reset = () => {
    setPriceShock(0); setVolAdj(0); setStressed(null);
  };

  const pct  = v => `${(v * 100).toFixed(2)}%`;
  const fix3 = v => v.toFixed(3);

  return (
    <div style={{
      background:"var(--bg-1)", border:"1px solid var(--border)",
      borderRadius:10, padding:18, display:"flex", flexDirection:"column", gap:16,
    }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:15, fontWeight:600, letterSpacing:"-.01em" }}>
          Scenario Simulator
        </span>
        <span style={{ fontSize:15, color:"var(--text-3)", textTransform:"uppercase", letterSpacing:".07em" }}>
          Local computation
        </span>
      </div>

      <Slider label="Price Shock"       min={-20} max={20} step={1} value={priceShock} onChange={setPriceShock}/>
      <Slider label="Volatility Adjust" min={-30} max={50} step={5} value={volAdj}     onChange={setVolAdj}/>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        <button onClick={run} disabled={!baseResult} style={{
          background: baseResult ? "var(--cyan)" : "var(--bg-3)",
          color: baseResult ? "var(--bg)" : "var(--text-3)",
          borderRadius:7, padding:"9px 0", fontWeight:700, fontSize:16,
          letterSpacing:".04em", transition:"background .15s",
        }}>
          RUN
        </button>
        <button onClick={reset} style={{
          background:"var(--bg-2)", color:"var(--text-2)",
          border:"1px solid var(--border)", borderRadius:7,
          padding:"9px 0", fontSize:16, fontWeight:500,
        }}>
          RESET
        </button>
      </div>

      {}
      {stressed && baseResult && (
        <div style={{ animation:"fadeUp .3s ease both" }}>
          <div style={{ fontSize:15, color:"var(--text-3)", textTransform:"uppercase",
            letterSpacing:".08em", marginBottom:8 }}>
            Normal → Stressed
          </div>
          <DeltaRow label="Daily VaR (95%)"
            base={baseResult.metrics.var95}  stressed={stressed.metrics.var95}  fmt={pct}/>
          <DeltaRow label="Volatility"
            base={baseResult.metrics.volatility} stressed={stressed.metrics.volatility} fmt={pct}/>
          <DeltaRow label="Sharpe Ratio"
            base={baseResult.metrics.sharpe} stressed={stressed.metrics.sharpe} fmt={fix3}/>
          <DeltaRow label="Risk Score"
            base={baseResult.compositeRiskScore} stressed={stressed.compositeRiskScore}
            fmt={v=>`${v.toFixed(0)}/100`}/>

          {/* Risk label badge comparison */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"10px 0", fontSize:13 }}>
            <span style={{ color:"var(--text-3)" }}>Risk Label</span>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontFamily:"var(--font-mono)", color:"var(--text-2)", fontSize:12 }}>
                {baseResult.riskScore.label}
              </span>
              <span style={{ color:"var(--text-3)", fontSize:11 }}>→</span>
              <span style={{
                fontFamily:"var(--font-mono)", fontSize:16, fontWeight:700,
                color: stressed.riskScore.label === "EXTREME" ? "var(--red)" :
                       stressed.riskScore.label === "HIGH"    ? "var(--amber)" :
                       stressed.riskScore.label === "MODERATE"? "var(--cyan)" : "var(--green)",
              }}>
                {stressed.riskScore.label}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
