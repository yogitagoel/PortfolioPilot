import { useState } from 'react';
import './PortfolioForm.css';

const RISK_OPTIONS = ['low', 'medium', 'high'];
const OPTION_TYPES = ['CALL', 'PUT'];
const OPTION_STYLES = ['EUROPEAN', 'AMERICAN'];
const SIDES = ['LONG', 'SHORT'];

const defaultEquity  = { symbol: '', qty: '' };
const defaultOption  = {
  underlying: '', option_type: 'CALL', style: 'EUROPEAN',
  strike: '', expiry: '', contracts: '1', side: 'LONG',
  implied_vol: '', premium_paid: '',
};

export default function PortfolioForm({ onAnalyse, onLive, loading, initialPortfolio }) {
  const initEquities = () => {
    if (initialPortfolio?.equities?.length > 0) {
      return initialPortfolio.equities.map(e => ({ symbol: e.symbol, qty: String(e.qty) }));
    }
    return [{ ...defaultEquity }];
  };
  const initOptions = () => {
    if (initialPortfolio?.options?.length > 0) {
      return initialPortfolio.options.map(o => ({
        underlying: o.underlying,
        option_type: o.option_type || 'CALL',
        style: o.style || 'EUROPEAN',
        strike: String(o.strike),
        expiry: o.expiry,
        contracts: String(o.contracts || 1),
        side: o.side || 'LONG',
        implied_vol: o.implied_vol ? String(o.implied_vol * 100) : '',
        premium_paid: o.premium_paid ? String(o.premium_paid) : '',
      }));
    }
    return [];
  };

  const [equities, setEquities]   = useState(initEquities);
  const [options,  setOptions]    = useState(initOptions);
  const [risk,     setRisk]       = useState(initialPortfolio?.risk_preference || 'medium');
  const [showOpts, setShowOpts]   = useState(false);
  const [errors,   setErrors]     = useState({});

  // ── Equities ───────────────────────────────────────────────────────────────
  const updateEquity = (i, key, val) =>
    setEquities(eq => eq.map((e, idx) => idx === i ? { ...e, [key]: val } : e));
  const addEquity = () => setEquities(eq => [...eq, { ...defaultEquity }]);
  const removeEquity = (i) => setEquities(eq => eq.filter((_, idx) => idx !== i));

  // ── Options ────────────────────────────────────────────────────────────────
  const updateOption = (i, key, val) =>
    setOptions(op => op.map((o, idx) => idx === i ? { ...o, [key]: val } : o));
  const addOption = () => { setOptions(op => [...op, { ...defaultOption }]); setShowOpts(true); };
  const removeOption = (i) => setOptions(op => op.filter((_, idx) => idx !== i));

  // ── Validation + build payload ─────────────────────────────────────────────
  const buildPayload = () => {
    const errs = {};
    const validEquities = equities.filter(e => e.symbol.trim() && e.qty);
    validEquities.forEach((e, i) => {
      if (!e.symbol.trim()) errs[`eq_sym_${i}`] = 'Required';
      if (!e.qty || isNaN(e.qty) || +e.qty <= 0) errs[`eq_qty_${i}`] = 'Must be > 0';
    });

    const validOptions = options.filter(o => o.underlying.trim() && o.strike && o.expiry);
    validOptions.forEach((o, i) => {
      if (!o.underlying.trim()) errs[`op_und_${i}`] = 'Required';
      if (!o.strike || isNaN(o.strike) || +o.strike <= 0) errs[`op_str_${i}`] = 'Must be > 0';
      if (!o.expiry) errs[`op_exp_${i}`] = 'Required';
    });

    if (validEquities.length === 0 && validOptions.length === 0) {
      errs.general = 'Add at least one position';
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) return null;

    return {
      equities: validEquities.map(e => ({
        symbol: e.symbol.toUpperCase().trim(),
        qty: parseFloat(e.qty),
      })),
      options: validOptions.map(o => ({
        underlying: o.underlying.toUpperCase().trim(),
        option_type: o.option_type,
        style: o.style,
        strike: parseFloat(o.strike),
        expiry: o.expiry,
        contracts: parseFloat(o.contracts) || 1,
        side: o.side,
        ...(o.implied_vol ? { implied_vol: parseFloat(o.implied_vol) / 100 } : {}),
        ...(o.premium_paid ? { premium_paid: parseFloat(o.premium_paid) } : {}),
      })),
      risk_preference: risk,
    };
  };

  const handleAnalyse = () => { const p = buildPayload(); if (p) onAnalyse(p); };
  const handleLive    = () => { const p = buildPayload(); if (p) onLive(p); };

  return (
    <div className="form-panel">
      <div className="form-panel-header">
        <span className="form-panel-title">Portfolio Input</span>
        <div className="risk-toggle">
          {RISK_OPTIONS.map(r => (
            <button key={r} className={`risk-btn ${risk === r ? 'active' : ''} risk-${r}`}
              onClick={() => setRisk(r)}>
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Equities */}
      <div className="section-title">EQUITIES</div>
      <div className="position-list">
        {equities.map((eq, i) => (
          <div className="position-row" key={i}>
            <input
              className={`field field-symbol ${errors[`eq_sym_${i}`] ? 'err' : ''}`}
              placeholder="AAPL"
              value={eq.symbol}
              onChange={e => updateEquity(i, 'symbol', e.target.value.toUpperCase())}
              maxLength={10}
            />
            <input
              className={`field field-qty ${errors[`eq_qty_${i}`] ? 'err' : ''}`}
              placeholder="Qty"
              type="number"
              min="0"
              value={eq.qty}
              onChange={e => updateEquity(i, 'qty', e.target.value)}
            />
            <button className="remove-btn" onClick={() => removeEquity(i)}
              disabled={equities.length === 1}>x</button>
          </div>
        ))}
        <button className="add-btn" onClick={addEquity}>+ ADD EQUITY</button>
      </div>

      {/* Options toggle */}
      <div className="section-title options-title">
        <span>OPTIONS</span>
        <span className="opts-count">{options.length > 0 ? `(${options.length})` : ''}</span>
        <button className="add-btn-inline" onClick={addOption}>+ ADD CONTRACT</button>
      </div>

      {options.length > 0 && (
        <div className="options-list">
          {options.map((opt, i) => (
            <div className="option-card" key={i}>
              <div className="option-card-header">
                <span className="option-card-title">CONTRACT #{i + 1}</span>
                <button className="remove-btn" onClick={() => removeOption(i)}>x</button>
              </div>
              <div className="option-grid">
                <div className="field-group">
                  <label>UNDERLYING</label>
                  <input className={`field ${errors[`op_und_${i}`] ? 'err' : ''}`}
                    placeholder="AAPL"
                    value={opt.underlying}
                    onChange={e => updateOption(i, 'underlying', e.target.value.toUpperCase())}
                    maxLength={10} />
                </div>
                <div className="field-group">
                  <label>TYPE</label>
                  <div className="seg-ctrl">
                    {OPTION_TYPES.map(t => (
                      <button key={t}
                        className={`seg-btn ${opt.option_type === t ? 'active call-put-' + t : ''}`}
                        onClick={() => updateOption(i, 'option_type', t)}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="field-group">
                  <label>SIDE</label>
                  <div className="seg-ctrl">
                    {SIDES.map(s => (
                      <button key={s}
                        className={`seg-btn ${opt.side === s ? 'active' : ''}`}
                        onClick={() => updateOption(i, 'side', s)}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="field-group">
                  <label>STYLE</label>
                  <div className="seg-ctrl">
                    {OPTION_STYLES.map(s => (
                      <button key={s}
                        className={`seg-btn ${opt.style === s ? 'active' : ''}`}
                        onClick={() => updateOption(i, 'style', s)}>{s.slice(0,4)}</button>
                    ))}
                  </div>
                </div>
                <div className="field-group">
                  <label>STRIKE</label>
                  <input className={`field ${errors[`op_str_${i}`] ? 'err' : ''}`}
                    type="number" placeholder="200.00"
                    value={opt.strike}
                    onChange={e => updateOption(i, 'strike', e.target.value)} />
                </div>
                <div className="field-group">
                  <label>EXPIRY</label>
                  <input className={`field ${errors[`op_exp_${i}`] ? 'err' : ''}`}
                    type="date"
                    value={opt.expiry}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => updateOption(i, 'expiry', e.target.value)} />
                </div>
                <div className="field-group">
                  <label>CONTRACTS</label>
                  <input className="field" type="number" min="1"
                    value={opt.contracts}
                    onChange={e => updateOption(i, 'contracts', e.target.value)} />
                </div>
                <div className="field-group">
                  <label>IV % <span className="label-opt">(optional)</span></label>
                  <input className="field" type="number" placeholder="30"
                    value={opt.implied_vol}
                    onChange={e => updateOption(i, 'implied_vol', e.target.value)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {errors.general && <div className="form-error">{errors.general}</div>}

      <div className="form-actions">
        <button className="btn-analyse" onClick={handleAnalyse} disabled={loading}>
          {loading ? <span className="btn-spinner" /> : null}
          {loading ? 'ANALYSING...' : 'ANALYSE'}
        </button>
        <button className="btn-live" onClick={handleLive} disabled={loading}>
          GO LIVE
        </button>
      </div>
    </div>
  );
}
