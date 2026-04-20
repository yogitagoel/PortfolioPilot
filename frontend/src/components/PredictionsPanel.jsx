import { fmt } from '../utils/format';
import './PredictionsPanel.css';

export default function PredictionsPanel({ predictions = [], asset_weights = {} }) {
  // Compute aggregate stats
  const avgReturn = predictions.length > 0
    ? predictions.reduce((s, p) => s + p.predicted_return, 0) / predictions.length
    : 0;
  const avgVol = predictions.length > 0
    ? predictions.reduce((s, p) => s + p.predicted_volatility, 0) / predictions.length
    : 0;
  const avgConf = predictions.length > 0
    ? predictions.reduce((s, p) => s + p.confidence, 0) / predictions.length
    : 0;

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-label">ML Predictions</span>
        <span className="panel-sub">XGBoost · Next-Day</span>
      </div>

      {/* Aggregate stats bar */}
      {predictions.length > 0 && (
        <div className="pred-agg-strip">
          <div className="pred-agg-item">
            <span className="pred-agg-label">Avg Return</span>
            <span className={avgReturn >= 0 ? 'text-green' : 'text-red'}>
              {fmt.sign(avgReturn)}{fmt.pct(avgReturn, 3)}
            </span>
          </div>
          <div className="pred-agg-item">
            <span className="pred-agg-label">Avg Volatility</span>
            <span className="text-amber">{fmt.pct(avgVol, 2)}</span>
          </div>
          <div className="pred-agg-item">
            <span className="pred-agg-label">Avg Confidence</span>
            <span className="text-blue">{(avgConf * 100).toFixed(0)}%</span>
          </div>
          <div className="pred-agg-item">
            <span className="pred-agg-label">Consensus</span>
            <span className={avgReturn > 0.001 ? 'text-green' : avgReturn < -0.001 ? 'text-red' : 'text-amber'}>
              {avgReturn > 0.001 ? '↑ BULLISH' : avgReturn < -0.001 ? '↓ BEARISH' : '→ NEUTRAL'}
            </span>
          </div>
        </div>
      )}

      <div className="pred-table">
        <div className="pred-thead">
          <span>Symbol</span>
          <span>Pred Return</span>
          <span>Pred Vol</span>
          <span>Confidence</span>
          <span>Weight</span>
          <span>Signal</span>
        </div>

        {predictions.length === 0 && (
          <div className="pred-empty">Waiting for analysis…</div>
        )}

        {predictions.map((p, i) => {
          const signal = p.predicted_return > 0.002 ? 'BULLISH'
                       : p.predicted_return < -0.002 ? 'BEARISH'
                       : 'NEUTRAL';
          const sigColor = signal === 'BULLISH' ? 'text-green' : signal === 'BEARISH' ? 'text-red' : 'text-amber';
          return (
            <div className="pred-row fade-in" key={i} style={{ animationDelay: `${i * 0.06}s` }}>
              <span className="pred-sym">{p.symbol}</span>
              <span className={p.predicted_return >= 0 ? 'text-green pred-num' : 'text-red pred-num'}>
                {fmt.sign(p.predicted_return)}{fmt.pct(p.predicted_return, 3)}
              </span>
              <span className="text-amber pred-num">{fmt.pct(p.predicted_volatility, 1)}</span>
              <div className="conf-bar-wrap">
                <div className="conf-bar-track">
                  <div className="conf-bar-fill"
                    style={{ width: `${(p.confidence * 100).toFixed(0)}%`, background: '#3b82f6' }} />
                </div>
                <span className="conf-val">{(p.confidence * 100).toFixed(0)}%</span>
              </div>
              <span className="pred-weight">
                {asset_weights[p.symbol] != null
                  ? `${(asset_weights[p.symbol] * 100).toFixed(1)}%`
                  : '—'}
              </span>
              <span className={`signal-badge ${sigColor}`}>{signal}</span>
            </div>
          );
        })}
      </div>

      <div className="pred-footer">
        <span className="footer-note">
          Return = expected next-day log return · Vol = expected 20d annualised volatility
        </span>
      </div>
    </div>
  );
}
