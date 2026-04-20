import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function LoginPage({ onLogin, onSkip }) {
  const [mode,     setMode]     = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  const submit = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields."); return;
    }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/api/v1/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Error"); return; }
      sessionStorage.setItem("pp_user", JSON.stringify(data));
      onLogin(data);
    } catch (e) {
      setError("Cannot reach server. Check backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "32px 16px",
    }}>
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px",
          background: "linear-gradient(135deg,var(--cyan),var(--green))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, fontWeight: 900, color: "var(--bg)",
        }}>P</div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.03em" }}>PortfolioPilot</div>
        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4, letterSpacing: ".06em", textTransform: "uppercase" }}>
          Risk Intelligence Terminal
        </div>
      </div>

      <div style={{
        width: "100%", maxWidth: 380,
        background: "var(--bg-1)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "28px 28px",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          background: "var(--bg-2)", borderRadius: 8, padding: 3, marginBottom: 24,
        }}>
          {["login", "register"].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null); }} style={{
              background: mode === m ? "var(--bg-1)" : "transparent",
              border: mode === m ? "1px solid var(--border)" : "1px solid transparent",
              color: mode === m ? "var(--text)" : "var(--text-3)",
              borderRadius: 6, padding: "7px 0",
              fontSize: 13, fontWeight: 600, textTransform: "uppercase",
              letterSpacing: ".06em", cursor: "pointer", transition: "all .15s",
            }}>
              {m === "login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 6 }}>
              Username
            </label>
            <input
              value={username} onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="your_username"
              style={{
                width: "100%", background: "var(--bg-2)", border: "1px solid var(--border)",
                borderRadius: 7, padding: "9px 12px", color: "var(--text)", fontSize: 14,
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="••••••••"
              style={{
                width: "100%", background: "var(--bg-2)", border: "1px solid var(--border)",
                borderRadius: 7, padding: "9px 12px", color: "var(--text)", fontSize: 14,
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{
              background: "var(--red-dim)", border: "1px solid var(--red)",
              borderRadius: 6, padding: "8px 12px",
              fontSize: 13, color: "var(--red)",
            }}>{error}</div>
          )}

          <button onClick={submit} disabled={loading} style={{
            background: loading ? "var(--bg-3)" : "var(--cyan)",
            color: loading ? "var(--text-3)" : "var(--bg)",
            border: "none", borderRadius: 8, padding: "10px 0",
            fontSize: 14, fontWeight: 700, letterSpacing: ".05em",
            textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "background .15s",
          }}>
            {loading && <span style={{
              width: 13, height: 13, borderRadius: "50%",
              border: "2px solid var(--text-3)", borderTopColor: "transparent",
              animation: "spin .7s linear infinite", display: "inline-block",
            }}/>}
            {mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          margin: "20px 0",
        }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }}/>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }}/>
        </div>

        <button onClick={onSkip} style={{
          width: "100%", background: "transparent",
          border: "1px solid var(--border)", borderRadius: 8, padding: "9px 0",
          fontSize: 13, color: "var(--text-3)", cursor: "pointer",
          transition: "border-color .15s",
        }}
          onMouseEnter={e => e.target.style.borderColor = "var(--border-bright)"}
          onMouseLeave={e => e.target.style.borderColor = "var(--border)"}
        >
          Continue without signing in
        </button>

        <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", marginTop: 16, lineHeight: 1.6 }}>
          Signing in lets you save and review your past analyses.
        </div>
      </div>
    </div>
  );
}
