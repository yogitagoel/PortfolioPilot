import { useState } from 'react';
import { actionColor } from '../utils/format';
import './RecommendationsPanel.css';

const FILTERS = ['ALL', 'BUY', 'SELL', 'HOLD', 'HEDGE'];

const actionColorMap = {
  BUY: '#10b981', SELL: '#ef4444', HOLD: '#f59e0b', HEDGE: '#3b82f6',
};

export default function RecommendationsPanel({ recommendations = [], alerts = [], summary }) {
  const [filter, setFilter] = useState('ALL');

  const filtered = filter === 'ALL'
    ? recommendations
    : recommendations.filter(r => r.action === filter);

  const countByAction = FILTERS.slice(1).reduce((acc, a) => {
    acc[a] = recommendations.filter(r => r.action === a).length;
    return acc;
  }, {});

  return (
    <div className="panel rec-panel">
      <div className="panel-header">
        <span className="panel-label">Recommendations</span>
        <span className="rec-count">{recommendations.length} Signal{recommendations.length !== 1 ? 's' : ''}</span>
      </div>

      {summary && (
        <div className="summary-bar">{summary}</div>
      )}

      {/* Filter pills */}
      <div className="rec-filters">
        {FILTERS.map(f => {
          const count = f === 'ALL' ? recommendations.length : countByAction[f];
          const active = filter === f;
          return (
            <button
              key={f}
              className={`filter-pill ${active ? 'active' : ''} pill-${f.toLowerCase()}`}
              onClick={() => setFilter(f)}
            >
              {f}
              {count > 0 && <span className="pill-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {}
      {filter === 'ALL' && alerts.length > 0 && (
        <div className="alerts-list">
          {alerts.map((a, i) => (
            <div key={i} className="alert-item">{a}</div>
          ))}
        </div>
      )}

      {}
      <div className="rec-table">
        <div className="rec-thead">
          <span>Action</span>
          <span>Symbol</span>
          <span>Confidence</span>
          <span>Target Wt.</span>
          <span>Reason</span>
        </div>

        {filtered.length === 0 && (
          <div className="rec-empty">
            {recommendations.length === 0
              ? 'No recommendations — submit a portfolio first'
              : `No ${filter} signals`}
          </div>
        )}

        {filtered.map((r, i) => (
          <div className="rec-row fade-in" key={i} style={{ animationDelay: `${i * 0.04}s` }}>
            <span className={`action-badge action-${r.action.toLowerCase()}`}>{r.action}</span>
            <span className="rec-symbol">{r.symbol}</span>
            <div className="conf-bar-wrap">
              <div className="conf-bar-track">
                <div
                  className="conf-bar-fill"
                  style={{
                    width: `${(r.confidence * 100).toFixed(0)}%`,
                    background: actionColorMap[r.action] || '#8899aa',
                  }}
                />
              </div>
              <span className="conf-val">{(r.confidence * 100).toFixed(0)}%</span>
            </div>
            <span className="rec-weight">
              {r.target_weight != null ? `${(r.target_weight * 100).toFixed(1)}%` : '—'}
            </span>
            <span className="rec-reason">{r.reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
