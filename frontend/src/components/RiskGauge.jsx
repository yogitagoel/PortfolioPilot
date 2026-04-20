
import { useEffect, useRef, useState } from "react";

export default function RiskGauge({ score = 0, label = "UNKNOWN", size = 180 }) {
  const [displayed, setDisplayed] = useState(0);

  // Animate score on mount / change
  useEffect(() => {
    const target = Math.max(0, Math.min(100, score));
    const step   = target / 40;
    let cur = 0;
    const id = setInterval(() => {
      cur = Math.min(cur + step, target);
      setDisplayed(cur);
      if (cur >= target) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [score]);

  const CX = size / 2, CY = size / 2 + 8;
  const R  = size * 0.36;

  // Arc goes from 210° to 330° (300° sweep)
  function polar(deg, r = R) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }
  function arcD(from, to, r = R) {
    const f = polar(from, r), t = polar(to, r);
    const large = (to - from) > 180 ? 1 : 0;
    return `M${f.x},${f.y} A${r},${r} 0 ${large} 1 ${t.x},${t.y}`;
  }

  const clamp = Math.max(0, Math.min(100, displayed));
  const fillEnd = 210 + (clamp / 100) * 300;
  const color =
    clamp >= 75 ? "var(--red)"   :
    clamp >= 50 ? "var(--amber)" :
    clamp >= 25 ? "var(--cyan)"  :
    "var(--green)";

  // Gradient zones in track
  const zones = [
    { from:210, to:285, c:"var(--green)" },
    { from:285, to:360, c:"var(--cyan)"  },
    { from:360, to:435, c:"var(--amber)" },
    { from:435, to:510, c:"var(--red)"   },
  ];

  // Needle
  const needleRad = ((fillEnd - 90) * Math.PI) / 180;
  const needleTip = {
    x: CX + (R - 10) * Math.cos(needleRad),
    y: CY + (R - 10) * Math.sin(needleRad),
  };

  const labelColor =
    label === "EXTREME"  ? "var(--red)"   :
    label === "HIGH"     ? "var(--amber)" :
    label === "MODERATE" ? "var(--cyan)"  :
    "var(--green)";

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
      <svg viewBox={`0 0 ${size} ${size - 10}`} style={{ width:size, overflow:"visible" }}>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Background track */}
        <path d={arcD(210,510)} fill="none" stroke="var(--bg-3)" strokeWidth={8} strokeLinecap="round"/>

        {/* Zone colouring (subtle) */}
        {zones.map((z,i) => (
          <path key={i} d={arcD(z.from,z.to)} fill="none"
            stroke={z.c} strokeWidth={8} strokeLinecap="round" opacity={.15}/>
        ))}

        {/* Fill arc */}
        {clamp > 0 && (
          <path d={arcD(210, fillEnd)} fill="none"
            stroke={color} strokeWidth={8} strokeLinecap="round"
            filter="url(#glow)"
            style={{ transition:"d .05s linear" }}
          />
        )}

        {/* Tick marks */}
        {[0,25,50,75,100].map(pct => {
          const deg = 210 + (pct/100)*300;
          const a = polar(deg, R - 6), b = polar(deg, R + 4);
          return <line key={pct} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="var(--bg-3)" strokeWidth={pct%50===0 ? 2 : 1}/>;
        })}

        {/* Needle */}
        <line x1={CX} y1={CY} x2={needleTip.x} y2={needleTip.y}
          stroke={color} strokeWidth={1.5} strokeLinecap="round"/>
        <circle cx={CX} cy={CY} r={4} fill={color} opacity={.9}/>

        {/* Score */}
        <text x={CX} y={CY + 24} textAnchor="middle"
          fill={color} fontSize={26} fontWeight={700}
          fontFamily="var(--font-mono)" letterSpacing="-.02em">
          {Math.round(clamp)}
        </text>
        <text x={CX} y={CY + 36} textAnchor="middle"
          fill="var(--text-3)" fontSize={8} fontFamily="var(--font-mono)">
          / 100
        </text>
      </svg>

      <div style={{
        fontSize:12, fontWeight:700, letterSpacing:".12em",
        color:labelColor, textTransform:"uppercase",
        fontFamily:"var(--font-mono)",
      }}>
        {label}
      </div>
    </div>
  );
}
