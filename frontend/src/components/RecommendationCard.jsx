
import { useState, useEffect } from "react";

const AI_KEY = import.meta.env.VITE_OPENROUTER_KEY || "";

const ACTION = {
  BUY:  { bg:"var(--green-dim)", border:"var(--green)", text:"var(--green)", label:"BUY"  },
  SELL: { bg:"var(--red-dim)",   border:"var(--red)",   text:"var(--red)",   label:"SELL" },
  HOLD: { bg:"var(--bg-2)",      border:"var(--border)", text:"var(--text-2)", label:"HOLD" },
  HEDGE:{ bg:"var(--amber-dim)", border:"var(--amber)", text:"var(--amber)", label:"HEDGE" },
};

function ConfidenceBar({ value }) {
  const pct   = Math.round(value * 100);
  const color = pct >= 75 ? "var(--green)" : pct >= 50 ? "var(--cyan)" : "var(--amber)";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:5 }}>
      <div style={{ flex:1, height:4, background:"var(--bg-3)", borderRadius:2 }}>
        <div style={{
          width:`${pct}%`, height:"100%", background:color, borderRadius:2,
          transition:"width .5s cubic-bezier(.4,0,.2,1)",
          boxShadow:`0 0 6px ${color}`,
        }}/>
      </div>
      <span style={{ fontSize:14, color:"var(--text-3)", fontFamily:"var(--font-mono)", minWidth:32 }}>
        {pct}%
      </span>
    </div>
  );
}

async function fetchAiExplanation(rec, key) {
  const prompt = [
    `You are a professional portfolio risk manager. Explain in 3-4 sentences why the following recommendation makes sense.`,
    `Recommendation: ${rec.action} ${rec.symbol}`,
    `Confidence: ${(rec.confidence * 100).toFixed(0)}%`,
    `Target weight: ${(rec.targetWeight * 100).toFixed(1)}%`,
    `System reason: ${rec.reason}`,
    `Be specific, reference key risk factors, give actionable context. No bullet points.`,
  ].join("\n");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "PortfolioPilot",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role:"user", content: prompt }],
      max_tokens: 250,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "No explanation returned.";
}

export default function RecommendationCard({ rec, delay = 0, openRouterKey }) {
  const key = openRouterKey || AI_KEY;
  const s   = ACTION[rec.action] || ACTION.HOLD;

  const [reasonOpen, setReasonOpen] = useState(false);
  const [aiText,     setAiText]     = useState(null);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiError,    setAiError]    = useState(null);

  // Auto-load AI analysis on mount if key available
  useEffect(() => {
    if (!key || aiText) return;
    let cancelled = false;
    setAiLoading(true);
    setAiError(null);
    fetchAiExplanation(rec, key)
      .then(text => { if (!cancelled) setAiText(text); })
      .catch(e   => { if (!cancelled) setAiError(e.message || "AI analysis failed"); })
      .finally(  () => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
    
  }, [key]);

  return (
    <div style={{
      background:"var(--bg-1)",
      border:`1px solid var(--border)`,
      borderLeft:`3px solid ${s.border}`,
      borderRadius:11,
      padding:"18px 20px",
      display:"flex", flexDirection:"column", gap:14,
      animation:`fadeUp .35s ${delay}s ease both`,
    }}>

      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{
            background:s.bg, color:s.text, border:`1px solid ${s.border}`,
            borderRadius:6, padding:"4px 12px", fontSize:14, fontWeight:700,
            letterSpacing:".07em", fontFamily:"var(--font-mono)",
          }}>
            {s.label}
          </span>
          <span style={{ fontWeight:700, fontSize:20, letterSpacing:"-.02em" }}>
            {rec.symbol}
          </span>
        </div>
        <div style={{ fontSize:15, color:"var(--text-3)", fontFamily:"var(--font-mono)" }}>
          TGT {(rec.targetWeight * 100).toFixed(1)}%
        </div>
      </div>

      {/* Confidence */}
      <div>
        <div style={{ fontSize:13, color:"var(--text-3)", textTransform:"uppercase", letterSpacing:".08em" }}>
          Confidence
        </div>
        <ConfidenceBar value={rec.confidence}/>
      </div>

      {/* System reason — collapsible */}
      <div>
        <button onClick={() => setReasonOpen(v => !v)} style={{
          background:"none", color:"var(--cyan)", fontSize:15,
          display:"flex", alignItems:"center", gap:7, padding:0,
          fontFamily:"var(--font-ui)", cursor:"pointer",
        }}>
          <span style={{
            display:"inline-block",
            transform: reasonOpen ? "rotate(90deg)" : "none",
            transition:"transform .15s", fontSize:12,
          }}>+</span>
          Why this recommendation?
        </button>

        {reasonOpen && (
          <div style={{
            marginTop:10, padding:"13px 15px",
            background:"var(--bg-2)", borderRadius:8,
            borderLeft:`2px solid ${s.border}`,
            fontSize:16, color:"var(--text-2)", lineHeight:1.85,
            animation:"fadeUp .2s ease both",
          }}>
            {rec.reason}
          </div>
        )}
      </div>

      {/* AI analysis — auto-loads when key present */}
      {key && (
        <div>
          <div style={{
            display:"flex", alignItems:"center", gap:8, marginBottom:9,
          }}>
            <span style={{
              fontSize:13, fontWeight:700, textTransform:"uppercase",
              letterSpacing:".1em", color:s.text,
            }}>
              AI Analysis
            </span>
            {aiLoading && (
              <div style={{
                width:11, height:11, borderRadius:"50%",
                border:"2px solid var(--text-3)", borderTopColor:"transparent",
                animation:"spin .7s linear infinite",
              }}/>
            )}
          </div>

          {aiLoading && !aiError && (
            <div style={{
              fontSize:15, color:"var(--text-3)", fontStyle:"italic",
              padding:"10px 13px", background:"var(--bg-2)", borderRadius:8,
              lineHeight:1.7,
            }}>
              Generating analysis...
            </div>
          )}

          {aiError && (
            <div style={{
              fontSize:15, color:"var(--red)",
              padding:"10px 13px", background:"var(--red-dim)",
              borderRadius:8, lineHeight:1.7,
            }}>
              {aiError}
            </div>
          )}

          {aiText && (
            <div style={{
              padding:"14px 16px",
              background:"var(--bg-2)", borderRadius:8,
              borderLeft:`2px solid ${s.border}`,
              fontSize:16, color:"var(--text-2)", lineHeight:1.9,
              animation:"fadeUp .2s ease both",
            }}>
              {aiText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
