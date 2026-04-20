import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function RiskBadge({ label }) {
  const color =
    label === "EXTREME" ? "var(--red)" :
    label === "HIGH"    ? "var(--amber)" :
    label === "MODERATE"? "var(--cyan)" : "var(--green)";
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: ".07em",
      background: `${color}18`, border: `1px solid ${color}60`,
      color, borderRadius: 4, padding: "2px 7px",
    }}>{label}</span>
  );
}

export default function HistoryTab({ user, onLoadResult }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(`${API}/api/v1/history/${user.id}`)
      .then(r => r.json())
      .then(d => { setHistory(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => { setError("Failed to load history."); setLoading(false); });
  }, [user]);

  const card = {
    background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 10,
  };

  if (loading) return (
    <div style={{ textAlign: "center", color: "var(--text-3)", padding: 48, fontSize: 14 }}>
      <div style={{
        width: 14, height: 14, borderRadius: "50%",
        border: "2px solid var(--cyan)", borderTopColor: "transparent",
        animation: "spin .7s linear infinite", margin: "0 auto 12px",
      }}/>
      Loading history...
    </div>
  );

  if (error) return (
    <div style={{ ...card, padding: "24px", color: "var(--red)", fontSize: 14 }}>{error}</div>
  );

  if (!history.length) return (
    <div style={{
      ...card, padding: "48px 24px",
      textAlign: "center", color: "var(--text-3)", fontSize: 15, lineHeight: 1.8,
    }}>
      No analyses saved yet.<br/>
      <span style={{ fontSize: 13 }}>Run an analysis and it will be saved automatically.</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeUp .3s ease both" }}>
      <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 4 }}>
        {history.length} saved {history.length === 1 ? "analysis" : "analyses"} — click any to view
      </div>

      {history.map((entry, i) => {
        const s = entry.summary || {};
        const symbols = entry.portfolio?.equities?.map(e => e.symbol).join(", ") || "—";
        const optCount = entry.portfolio?.options?.length || 0;

        return (
          <div key={entry.id || i} style={{
            ...card, padding: "16px 20px",
            cursor: "pointer", transition: "border-color .15s",
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-bright)"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
            onClick={() => onLoadResult && onLoadResult(entry)}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 15, fontWeight: 700, fontFamily: "var(--font-mono)",
                  color: "var(--cyan)", marginBottom: 4,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {symbols}
                  {optCount > 0 && (
                    <span style={{ fontSize: 12, color: "var(--amber)", marginLeft: 8 }}>
                      +{optCount} option{optCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 13, color: "var(--text-3)" }}>
                  {s.compositeRiskScore != null && (
                    <span>Risk <span style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>{s.compositeRiskScore}/100</span></span>
                  )}
                  {s.var95 != null && (
                    <span>VaR <span style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>{(s.var95 * 100).toFixed(2)}%</span></span>
                  )}
                  {s.sharpe != null && (
                    <span>Sharpe <span style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>{s.sharpe.toFixed(2)}</span></span>
                  )}
                  {s.volatility != null && (
                    <span>Vol <span style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>{(s.volatility * 100).toFixed(2)}%</span></span>
                  )}
                </div>

                {s.summary && (
                  <div style={{
                    fontSize: 13, color: "var(--text-3)", marginTop: 6,
                    overflow: "hidden", textOverflow: "ellipsis",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>
                    {s.summary}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                  {fmtDate(entry.timestamp)}
                </div>
                {s.riskLabel && <RiskBadge label={s.riskLabel}/>}
                <div style={{
                  fontSize: 12, color: "var(--cyan)", marginTop: 4,
                }}>
                  View →
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
