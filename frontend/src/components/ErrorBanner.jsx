import './ErrorBanner.css';

export default function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="error-banner">
      <span className="error-icon">⚠</span>
      <span className="error-msg">{error}</span>
      <button className="error-dismiss" onClick={onDismiss}>✕</button>
    </div>
  );
}
