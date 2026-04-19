import { useEffect, useState } from 'react';
import { riskColor } from '../utils/format';
import './RiskGauge.css';

const LABEL_COLORS = {
  LOW:      '#10b981',
  MODERATE: '#f59e0b',
  HIGH:     '#ef4444',
  EXTREME:  '#ef4444',
};

export default function RiskGauge({ score, label }) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    if (score == null) { setAnimated(0); return; }
    const target = Math.min(100, Math.max(0, score));
    let current = animated;
    const step = (target - current) / 40;
    const t = setInterval(() => {
      current += step;
      if ((step > 0 && current >= target) || (step < 0 && current <= target)) {
        current = target;
        clearInterval(t);
      }
      setAnimated(current);
    }, 16);
    return () => clearInterval(t);
  }, [score]);

  const r   = 68;
  const cx  = 90;
  const cy  = 88;
  const circ = Math.PI * r;          // half-circle arc length
  const pct  = animated / 100;
  const dashOffset = circ * (1 - pct);
  const color = LABEL_COLORS[label] || '#4a5a6a';

  // Needle: -180deg at 0, 0deg at 100
  const needleAngle = -180 + (animated / 100) * 180;
  const rad = (needleAngle * Math.PI) / 180;
  const nx  = cx + (r - 10) * Math.cos(rad);
  const ny  = cy + (r - 10) * Math.sin(rad);

  return (
    <div className="gauge-wrap">
      <svg width="180" height="108" viewBox="0 0 180 108">
        {/* Background track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#1e2a3a"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* Coloured fill arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          style={{
            filter: `drop-shadow(0 0 5px ${color}88)`,
            transition: 'stroke 0.4s ease',
          }}
        />

        {/* Zone tick marks at 25 / 50 / 75 */}
        {[25, 50, 75].map((t) => {
          const a   = (-180 + (t / 100) * 180) * (Math.PI / 180);
          const x1  = cx + (r - 18) * Math.cos(a);
          const y1  = cy + (r - 18) * Math.sin(a);
          const x2  = cx + (r + 5)  * Math.cos(a);
          const y2  = cy + (r + 5)  * Math.sin(a);
          return (
            <line key={t} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#2a3a50" strokeWidth="1.5" />
          );
        })}

        {/* Needle */}
        {score != null && (
          <>
            <line
              x1={cx} y1={cy} x2={nx} y2={ny}
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 3px ${color})`,
                transition: 'all 0.05s linear',
              }}
            />
            <circle cx={cx} cy={cy} r="5" fill={color}
              style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
            <circle cx={cx} cy={cy} r="3" fill="#0a0c0f" />
          </>
        )}

        {/* Zone labels */}
        <text x="21"  y={cy + 18} fontSize="8" fill="#4a5a6a" fontFamily="IBM Plex Mono">LOW</text>
        <text x="156" y={cy + 18} fontSize="8" fill="#4a5a6a" fontFamily="IBM Plex Mono" textAnchor="end">EXT</text>
      </svg>

      <div className="gauge-score" style={{ color: score != null ? color : '#4a5a6a' }}>
        {score != null ? animated.toFixed(1) : '—'}
      </div>
      <div className={`gauge-label ${riskColor(label)}`}>
        {label || 'AWAITING ANALYSIS'}
      </div>
    </div>
  );
}
