import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import './ChartsPanel.css';

const chartTooltipStyle = {
  background: '#111620',
  border: '1px solid #1a2332',
  borderRadius: '8px',
  fontSize: 14,
  fontFamily: 'JetBrains Mono, monospace',
};
const labelStyle = { color: '#e8edf5', fontSize: 14 };

export default function ChartsPanel({ risk_metrics, predictions }) {
  if (!risk_metrics && !predictions) return null;

  const predData = (predictions || []).map(p => ({
    symbol: p.symbol,
    ret:    parseFloat((p.predicted_return * 100).toFixed(4)),
    vol:    parseFloat((p.predicted_volatility * 100).toFixed(2)),
  }));

  const rm = risk_metrics;
  const radarData = rm ? [
    { axis: 'Volatility', value: Math.min(100, (rm.portfolio_volatility / 0.08) * 100) },
    { axis: 'VaR Risk',   value: Math.min(100, (Math.abs(rm.var_95) / 0.12) * 100) },
    { axis: 'Sharpe Inv', value: Math.max(0, Math.min(100, ((2 - rm.sharpe_ratio) / 4) * 100)) },
    { axis: 'Net Delta',  value: Math.min(100, Math.abs(rm.portfolio_greeks?.net_delta || 0) * 50) },
    { axis: 'Net Vega',   value: Math.min(100, Math.abs(rm.portfolio_greeks?.net_vega || 0) * 10) },
  ] : [];

  return (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, width: '100%' }}>

    {radarData.length > 0 && (
      <div className="chart-card">
        <div className="chart-card-title">Risk Radar</div>
        <ResponsiveContainer width="100%" height={230}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={85}>
            <PolarGrid stroke="#1a2332" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: '#7a8fa8', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}
            />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="Risk" dataKey="value"
              stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.18} strokeWidth={2} />
            <Tooltip contentStyle={chartTooltipStyle} labelStyle={labelStyle} cursor={false} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    )}

    {predData.length > 0 && (
      <div className="chart-card">
        <div className="chart-card-title">Predicted Returns (left) & Volatility % (right)</div>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={predData} margin={{ top: 10, right: 50, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#1a2332" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="symbol"
              tick={{ fill: '#7a8fa8', fontSize: 14, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false} tickLine={false} />
            <YAxis yAxisId="left"
              tick={{ fill: '#3d5068', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false} tickLine={false}
              tickFormatter={v => `${v.toFixed(3)}%`} />
            <YAxis yAxisId="right" orientation="right"
              tick={{ fill: '#f59e0b', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false} tickLine={false}
              tickFormatter={v => `${v.toFixed(1)}%`} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={labelStyle}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              formatter={(v, name) => [
                `${v.toFixed(4)}%`,
                name === 'ret' ? 'Pred Return' : 'Pred Volatility',
              ]}
            />
            <Bar yAxisId="left" dataKey="ret" name="ret"
              radius={[4, 4, 0, 0]} activeBar={{ stroke: 'none', opacity: 0.95 }}>
              {predData.map((d, i) => (
                <Cell key={i} fill={d.ret >= 0 ? '#10b981' : '#ef4444'} opacity={0.85} />
              ))}
            </Bar>
            <Bar yAxisId="right" dataKey="vol" name="vol"
              fill="#f59e0b" opacity={0.6} radius={[4, 4, 0, 0]}
              activeBar={{ fill: '#f59e0b', opacity: 0.8, stroke: 'none' }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )}

  </div>
);
}
