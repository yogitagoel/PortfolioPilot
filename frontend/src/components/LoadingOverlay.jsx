import './LoadingOverlay.css';

export default function LoadingOverlay({ message = 'ANALYSING PORTFOLIO...' }) {
  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="loading-bars">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="loading-bar" style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
        <div className="loading-msg">{message}</div>
        <div className="loading-steps">
          {['MARKET DATA', 'RISK ENGINE', 'FEATURE ENG', 'ML MODELS', 'SCORING', 'RECOMMENDATIONS'].map((s, i) => (
            <span key={i} className="loading-step" style={{ animationDelay: `${0.3 + i * 0.25}s` }}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
