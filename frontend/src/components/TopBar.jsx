import { useState, useEffect, useRef } from 'react';
import './TopBar.css';

const POLL_INTERVAL_S = 60;

export default function TopBar({
  health, liveMode, lastUpdate, dataUpdatedAt,
  onStopLive, onRefreshNow, refreshing,
}) {
  const online = health?.status === 'ok';
  const [countdown, setCountdown] = useState(POLL_INTERVAL_S);
  const countRef = useRef(null);

  // Countdown resets every time lastUpdate changes (a poll just happened)
  useEffect(() => {
    if (!liveMode) {
      clearInterval(countRef.current);
      setCountdown(POLL_INTERVAL_S);
      return;
    }
    setCountdown(POLL_INTERVAL_S);
    countRef.current = setInterval(() => {
      setCountdown(c => (c <= 1 ? POLL_INTERVAL_S : c - 1));
    }, 1000);
    return () => clearInterval(countRef.current);
  }, [liveMode, lastUpdate]);

  const fmtTime = (d) =>
    d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-logo">
          Portfolio<span className="logo-accent">Pilot</span>
        </span>
        <span className="topbar-sep" />
        <span className="topbar-sub">Risk Intelligence Terminal</span>
      </div>

      <div className="topbar-center">
        {liveMode && (
          <div className="live-center">
            <span className="live-dot-anim" />
            <span className="live-label">LIVE</span>
            <span className="live-countdown">
              Next refresh in <strong>{countdown}s</strong>
            </span>
          </div>
        )}
      </div>

      <div className="topbar-right">
        {liveMode && (
          <button
            className={`refresh-btn ${refreshing ? 'refreshing' : ''}`}
            onClick={onRefreshNow}
            disabled={refreshing}
            title="Force refresh now"
          >
            <span className={`refresh-icon ${refreshing ? 'spin' : ''}`}>↻</span>
            {refreshing ? 'Refreshing…' : 'Refresh Now'}
          </button>
        )}

        {lastUpdate && (
          <span className="topbar-time">
            {dataUpdatedAt
              ? `Data: ${new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : `Updated ${fmtTime(lastUpdate)}`}
          </span>
        )}

        {liveMode && (
          <button className="stop-live-btn" onClick={onStopLive} title="Stop live mode">
            ✕ Stop Live
          </button>
        )}

        <div className={`status-pill ${online ? 'online' : 'offline'}`}>
          <span className="status-dot" />
          {online ? 'API Online' : 'API Offline'}
          {online && health?.models_ready && <span className="ml-ready">ML ✓</span>}
        </div>
      </div>
    </header>
  );
}
