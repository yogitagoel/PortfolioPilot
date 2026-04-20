const COLORS = {
  green:  { text:"var(--green)",  bg:"var(--green-dim)",  border:"rgba(12,206,107,.25)" },
  amber:  { text:"var(--amber)",  bg:"var(--amber-dim)",  border:"rgba(245,166,35,.25)" },
  red:    { text:"var(--red)",    bg:"var(--red-dim)",    border:"rgba(255,61,87,.25)"  },
  cyan:   { text:"var(--cyan)",   bg:"var(--cyan-dim)",   border:"rgba(0,180,216,.25)"  },
  purple: { text:"var(--purple)", bg:"rgba(167,139,250,.08)", border:"rgba(167,139,250,.2)" },
  dim:    { text:"var(--text-2)", bg:"transparent",       border:"transparent"          },
};

export default function MetricCard({ label, value, unit="", sub, color="dim", icon, trend }) {
  const c = COLORS[color] || COLORS.dim;
  return (
    <div style={{
      background: "var(--bg-1)",
      border: `1px solid var(--border)`,
      borderRadius: 10,
      padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 7,
      position: "relative", overflow: "hidden",
      transition: "border-color .2s",
    }}>
      <div style={{
        position:"absolute", top:0, left:0, right:0, height:2,
        background: c.text, opacity: .5,
      }}/>

      <div style={{ fontSize:13, color:"var(--text-3)", textTransform:"uppercase",
        letterSpacing:".1em", display:"flex", alignItems:"center", gap:5 }}>
        {icon && <span style={{ fontSize:14, fontFamily:"var(--font-mono)" }}>{icon}</span>}
        {label}
      </div>

      <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
        <span style={{
          fontSize: 26, fontWeight: 700, color: c.text,
          fontFamily: "var(--font-mono)", lineHeight: 1.15, letterSpacing:"-.02em",
        }}>{value}</span>
        {unit && <span style={{ fontSize:14, color:"var(--text-3)" }}>{unit}</span>}
        {trend != null && (
          <span style={{
            fontSize:13, color: trend >= 0 ? "var(--green)" : "var(--red)",
            fontFamily:"var(--font-mono)", marginLeft:4,
          }}>
            {trend >= 0 ? "+" : ""}{Math.abs(trend).toFixed(2)}
          </span>
        )}
      </div>

      {sub && <div style={{ fontSize:13, color:"var(--text-3)", lineHeight:1.4 }}>{sub}</div>}
    </div>
  );
}

const REGIME_MAP = {
  HIGH_RISK:   { color:"var(--red)",   label:"HIGH RISK"   },
  DIRECTIONAL: { color:"var(--amber)", label:"DIRECTIONAL" },
  STABLE:      { color:"var(--green)", label:"STABLE"      },
};

export function RegimeBadge({ regime }) {
  const r = REGIME_MAP[regime] || REGIME_MAP.STABLE;
  return (
    <span style={{
      color: r.color,
      border: `1px solid ${r.color}`,
      background: `${r.color}15`,
      borderRadius: 20, padding:"3px 11px",
      fontSize:13, fontWeight:700, letterSpacing:".08em",
      display:"inline-flex", alignItems:"center", gap:6,
    }}>
      {r.label}
    </span>
  );
}

export function StatPill({ label, value, color="dim" }) {
  const c = COLORS[color] || COLORS.dim;
  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"8px 13px",
      background:"var(--bg-1)", border:"1px solid var(--border)", borderRadius:7,
    }}>
      <span style={{ fontSize:14, color:"var(--text-3)", textTransform:"uppercase", letterSpacing:".07em" }}>
        {label}
      </span>
      <span style={{ fontSize:16, fontFamily:"var(--font-mono)", fontWeight:600, color:c.text }}>
        {value}
      </span>
    </div>
  );
}
