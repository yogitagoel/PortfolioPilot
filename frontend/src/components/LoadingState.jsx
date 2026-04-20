function SkeletonBlock({ h = 80, w = "100%", radius = 10 }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: radius,
      background: "linear-gradient(90deg, var(--bg-2) 25%, var(--bg-3) 50%, var(--bg-2) 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.6s infinite",
    }}/>
  );
}

export function SkeletonDashboard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SkeletonBlock h={46}/>

      <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 12 }}>
        <SkeletonBlock h={160} radius={10}/>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <SkeletonBlock h={75}/> <SkeletonBlock h={75}/>
          <SkeletonBlock h={75}/> <SkeletonBlock h={75}/>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SkeletonBlock h={160}/> <SkeletonBlock h={160}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SkeletonBlock h={180}/> <SkeletonBlock h={180}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px,1fr))", gap: 10 }}>
        {[0,1,2].map(i => <SkeletonBlock key={i} h={110}/>)}
      </div>
    </div>
  );
}

export function ErrorBanner({ error, onRetry, onDismiss }) {
  if (!error) return null;

  const msg =
    typeof error === "string"             ? error :
    error instanceof Error                ? error.message :
    error?.message                        ? error.message :
    JSON.stringify(error);

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      background: "rgba(255,61,87,.08)",
      border: "1px solid rgba(255,61,87,.35)",
      borderRadius: 10, padding: "12px 16px",
      animation: "fadeUp .25s ease both",
    }}>
      <span style={{ fontSize: 18, color: "var(--red)", flexShrink: 0 }}>⚠</span>
      <div style={{ flex: 1, fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>
        <span style={{ fontWeight: 600, color: "var(--red)" }}>Error — </span>
        {msg}
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {onRetry && (
          <button onClick={onRetry} style={{
            background: "rgba(255,61,87,.15)", color: "var(--red)",
            border: "1px solid rgba(255,61,87,.4)", borderRadius: 6,
            padding: "4px 12px", fontSize: 13, fontWeight: 600,
            cursor: "pointer", transition: "all .15s",
          }}>
            Retry
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss} style={{
            background: "none", color: "var(--text-3)",
            border: "none", fontSize: 18, cursor: "pointer",
            lineHeight: 1, padding: "0 4px",
          }}>
            x
          </button>
        )}
      </div>
    </div>
  );
}

export function AlertBanner({ alerts }) {
  if (!alerts?.length) return null;
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 6,
      animation: "fadeUp .25s ease both",
    }}>
      {alerts.map((a, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          background: "rgba(245,166,35,.07)",
          border: "1px solid rgba(245,166,35,.25)",
          borderRadius: 8, padding: "9px 14px",
          fontSize: 14, color: "var(--text-2)", lineHeight: 1.6,
        }}>
          <span style={{ color: "var(--amber)", flexShrink: 0 }}>●</span>
          {a}
        </div>
      ))}
    </div>
  );
}
