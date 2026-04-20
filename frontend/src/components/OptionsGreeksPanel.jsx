import { fmt, moneyColor } from '../utils/format';
import './OptionsGreeksPanel.css';

function fmtGreek(v) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs === 0)     return '0.0000';
  if (abs < 0.0001)  return v.toExponential(2);
  if (abs < 0.001)   return v.toFixed(6);
  return v.toFixed(4);
}

export default function OptionsGreeksPanel({ greeks = [], pnl_scenarios = {} }) {
  if (greeks.length === 0 && Object.keys(pnl_scenarios).length === 0) return null;

  const scenariosByUnderlying = {};
  Object.entries(pnl_scenarios).forEach(([key, val]) => {
    const [sym, pct] = key.split('_');
    if (!scenariosByUnderlying[sym]) scenariosByUnderlying[sym] = {};
    scenariosByUnderlying[sym][pct] = val;
  });

  const PCT_COLS = ['-20%', '-10%', '-5%', '+0%', '+5%', '+10%', '+20%'];

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-label">OPTIONS GREEKS BREAKDOWN</span>
        <span className="panel-sub">{greeks.length} CONTRACT{greeks.length !== 1 ? 'S' : ''}</span>
      </div>

      <div style={{ display:'flex', gap:24, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
  {[
    { label:'NET Δ', val: greeks.reduce((s,g) => s + g.position_delta, 0), decimals:3 },
    { label:'NET Γ', val: greeks.reduce((s,g) => s + g.position_gamma, 0), isGreek:true },
    { label:'NET Θ/d', val: greeks.reduce((s,g) => s + g.position_theta, 0), decimals:2 },
    { label:'NET V', val: greeks.reduce((s,g) => s + g.position_vega, 0), decimals:2 },
  ].map(({ label, val, decimals, isGreek }) => (
    <div key={label} style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <span style={{ fontSize:11, color:'var(--text-3)' }}>{label}</span>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:14 }}>
        {isGreek ? fmtGreek(val) : val.toFixed(decimals)}
      </span>
    </div>
  ))}
</div>
      <div className="og-table-wrap">
        <table className="og-table">
          <thead>
            <tr>
              <th>UNDERLYING</th>
              <th>TYPE</th>
              <th>SIDE</th>
              <th>STRIKE</th>
              <th>EXPIRY</th>
              <th>DTE</th>
              <th>MONEY</th>
              <th>FAIR VAL</th>
              <th>IV</th>
              <th>Δ DELTA</th>
              <th>Γ GAMMA</th>
              <th>Θ THETA</th>
              <th>V VEGA</th>
              <th>ρ RHO</th>
              <th>POS Γ</th>
              <th>POS V</th>
              <th>POS Δ</th>
            </tr>
          </thead>
          <tbody>
            {greeks.map((g, i) => (
              <tr key={i} className={`og-row ${g.option_type.toLowerCase()}-row`}>
                <td className="sym-cell">{g.underlying}</td>
                <td className={g.option_type === 'CALL' ? 'text-green' : 'text-red'}>
                  {g.option_type}
                </td>
                <td className={g.side === 'LONG' ? 'text-cyan' : 'text-purple'}>{g.side}</td>
                <td>{fmt.num2(g.strike)}</td>
                <td className="text-dim">{g.expiry}</td>
                <td className={g.days_to_expiry <= 7 ? 'text-red' : g.days_to_expiry <= 21 ? 'text-amber' : 'text-secondary'}>
                  {g.days_to_expiry}d
                </td>
                <td className={moneyColor(g.moneyness)}>{g.moneyness}</td>
                <td className="text-amber">${fmt.num2(g.theoretical_price)}</td>
                <td>{fmt.pct(g.implied_vol, 1)}</td>
                <td className={g.delta >= 0 ? 'text-green' : 'text-red'}>{fmt.num(g.delta, 3)}</td>
                <td className="text-secondary">{fmtGreek(g.gamma)}</td>
                <td className="text-red">{fmt.num(g.theta, 4)}</td>
                <td className="text-blue">{fmtGreek(g.vega)}</td>
                <td className="text-secondary">{fmt.num(g.rho, 4)}</td>
                <td className={g.position_delta >= 0 ? 'text-green' : 'text-red'}>
                  {fmt.num(g.position_delta, 2)}
                </td>
                <td className="text-cyan">{fmtGreek(g.position_gamma)}</td>
                <td className="text-blue">{fmt.num(g.position_vega,2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(scenariosByUnderlying).length > 0 && (
        <>
          <div className="section-divider">P&L SCENARIOS AT EXPIRY</div>
          <div className="pnl-table-wrap">
            <table className="pnl-table">
              <thead>
                <tr>
                  <th>UNDERLYING</th>
                  {PCT_COLS.map(p => <th key={p}>{p}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(scenariosByUnderlying).map(([sym, vals]) => (
                  <tr key={sym}>
                    <td className="sym-cell">{sym}</td>
                    {PCT_COLS.map(p => {
                      const v = vals[p];
                      return (
                        <td key={p} className={v == null ? 'text-dim' : v >= 0 ? 'text-green' : 'text-red'}>
                          {v == null ? '—' : `${v >= 0 ? '+' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
