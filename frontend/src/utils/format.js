export const fmt = {
  pct:    (v, d = 2)  => v == null ? '—' : `${(v * 100).toFixed(d)}%`,
  num:    (v, d = 4)  => v == null ? '—' : Number(v).toFixed(d),
  num2:   (v)         => v == null ? '—' : Number(v).toFixed(2),
  dollar: (v)         => v == null ? '—' : `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  score:  (v)         => v == null ? '—' : Number(v).toFixed(1),
  sign:   (v)         => v >= 0 ? '+' : '',
  color:  (v, invert = false) => {
    if (v == null) return 'text-secondary';
    const pos = v > 0;
    return invert ? (pos ? 'text-red' : 'text-green') : (pos ? 'text-green' : 'text-red');
  },
};

export const riskColor = (label) => ({
  LOW:      'text-green',
  MODERATE: 'text-amber',
  HIGH:     'text-red',
  EXTREME:  'text-red',
}[label] || 'text-secondary');

export const actionColor = (action) => ({
  BUY:  'text-green',
  SELL: 'text-red',
  HOLD: 'text-amber',
  HEDGE:'text-blue',
}[action] || 'text-secondary');

export const actionBg = (action) => ({
  BUY:  'badge-green',
  SELL: 'badge-red',
  HOLD: 'badge-amber',
  HEDGE:'badge-blue',
}[action] || '');

export const moneyColor = (m) => ({
  ITM: 'text-green',
  OTM: 'text-red',
  ATM: 'text-amber',
}[m] || 'text-secondary');
