import RiskGauge from './RiskGauge';
import { fmt, riskColor } from '../utils/format';
import './RiskPanel.css';

export default function RiskPanel({ risk_score, risk_metrics }) {
  const g = risk_metrics?.portfolio_greeks;

  return (
    <div className="risk-panel-card">
      {/* Score gauge */}
      <div className="risk-gauge-section">
        <RiskGauge score={risk_score?.score} label={risk_score?.label} />
        {risk_score && (
          <div className="risk-rationale">
            {risk_score.rationale}
          </div>
        )}
      </div>

      {/* Key metrics */}
      {risk_metrics && (
        <div className="risk-metrics-section">
          <div className="risk-metrics-header">Key Metrics</div>
          <div className="risk-metrics-grid">
            <MetricCard label="Portfolio Vol" value={fmt.pct(risk_metrics.portfolio_volatility)} color="amber" />
            <MetricCard label="VaR 95%"       value={fmt.pct(risk_metrics.var_95)}               color={risk_metrics.var_95 < -0.04 ? 'red' : 'amber'} />
            <MetricCard label="Sharpe Ratio"  value={fmt.num2(risk_metrics.sharpe_ratio)}        color={risk_metrics.sharpe_ratio > 1 ? 'green' : risk_metrics.sharpe_ratio < 0 ? 'red' : 'amber'} />
            <MetricCard label="Risk Score"    value={`${fmt.score(risk_score?.score)}/100`}      color={riskColor(risk_score?.label).replace('text-', '')} />
          </div>
        </div>
      )}

      {/* Greeks */}
      {g && (
        <div className="risk-greeks-section">
          <div className="risk-metrics-header">Net Portfolio Greeks</div>
          <div className="risk-greeks-grid">
            <GreekCell label="Δ Delta" value={fmt.num(g.net_delta, 3)} tip="Directional exposure per $1 underlying move" />
            <GreekCell label="Γ Gamma" value={fmt.num(g.net_gamma, 4)} tip="Rate of change of delta" />
            <GreekCell label="Θ Theta" value={fmt.num(g.net_theta, 2)} tip="Daily time decay ($)" />
            <GreekCell label="V Vega"  value={fmt.num(g.net_vega,  2)} tip="P&L per 1% IV change" />
            <GreekCell label="ρ Rho"   value={fmt.num(g.net_rho,   2)} tip="P&L per 1% rate change" />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div className="metric-card">
      <span className="metric-card-label">{label}</span>
      <span className={`metric-card-value text-${color}`}>{value}</span>
    </div>
  );
}

function GreekCell({ label, value, tip }) {
  return (
    <div className="greek-cell-new" title={tip}>
      <span className="greek-label-new">{label}</span>
      <span className="greek-value-new">{value}</span>
    </div>
  );
}
