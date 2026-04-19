
import { useState, useCallback } from "react";
import { analyzePortfolio, apiSaveHistory } from "./api/client.js";

import LoginPage                  from "./components/LoginPage.jsx";
import HistoryTab                 from "./components/HistoryTab.jsx";
import PortfolioForm              from "./components/PortfolioForm.jsx";
import MetricCard, { RegimeBadge, StatPill } from "./components/MetricCard.jsx";
import RiskGauge                  from "./components/RiskGauge.jsx";
import RecommendationCard         from "./components/RecommendationCard.jsx";
import ScenarioSimulator          from "./components/ScenarioSimulator.jsx";
import { WeightChart, RiskBreakdownChart, GreeksPanel, PnLScenarioChart } from "./components/Charts.jsx";
import { SkeletonDashboard, ErrorBanner, AlertBanner } from "./components/LoadingState.jsx";
import OptionsGreeksPanel         from "./components/OptionsGreeksPanel.jsx";
import OptionsRiskPanel           from "./components/OptionsRiskPanel.jsx";
import TabBar                     from "./components/TabBar.jsx";
import ChartsPanel                from "./components/ChartsPanel.jsx";


const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_KEY || "";


const fmtPct = (v, dp = 2) => `${(v * 100).toFixed(dp)}%`;
const fmtFix = (v, dp = 3) => v.toFixed(dp);

function scoreColor(s)  { return s >= 75 ? "red" : s >= 50 ? "amber" : s >= 25 ? "cyan" : "green"; }
function sharpeColor(s) { return s >= 1.5 ? "green" : s >= 0.5 ? "cyan" : s >= 0 ? "amber" : "red"; }
function varColor(v)    { return v > 0.03 ? "red" : v > 0.015 ? "amber" : "green"; }
function volColor(v)    { return v > 0.025 ? "red" : v > 0.012 ? "amber" : "green"; }


export default function App() {
  
  const [showLogin, setShowLogin] = useState(false);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("pp_user")); } catch { return null; }
  });

 
  const [portfolio, setPortfolio] = useState(null);
  const [result,    setResult]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = (() => {
    const base = [
      { id: "overview",        label: "Overview" },
      { id: "charts",          label: "Charts & Analytics" },
      { id: "options",         label: "Options & Derivatives" },
      { id: "scenarios",       label: "Scenarios" },
      { id: "recommendations", label: "Recommendations" },
    ];
    if (user) base.push({ id: "history", label: "History" });
    return base.map(t => {
      if (!result) return t;
      if (t.id === "recommendations") return { ...t, badge: result.recommendations.length, badgeColor: "cyan" };
      if (t.id === "options")         return { ...t, badge: result.optionGreeks?.length || 0, badgeColor: "amber" };
      return t;
    });
  })();

  const avgImpliedVol = (() => {
    if (!result?.optionGreeks) return {};
    const map = {};
    result.optionGreeks.forEach(g => {
      if (!map[g.underlying]) map[g.underlying] = [];
      map[g.underlying].push(g.implied_vol);
    });
    const avg = {};
    Object.entries(map).forEach(([sym, vals]) => {
      avg[sym] = vals.reduce((s, v) => s + v, 0) / vals.length;
    });
    return avg;
  })();

  
  const [lastSavedPortfolio, setLastSavedPortfolio] = useState(null);

  const handleAnalyze = useCallback(async (p) => {
    setPortfolio(p);
    setLoading(true);
    setError(null);
    try {
      const res = await analyzePortfolio(p);
      setResult(res);
      setActiveTab("overview");

      
      if (user && JSON.stringify(p) !== JSON.stringify(lastSavedPortfolio)) {
        const summary = {
          compositeRiskScore: res.compositeRiskScore,
          riskLabel:   res.riskScore?.label,
          summary:     res.summary,
          var95:       res.metrics?.var95,
          sharpe:      res.metrics?.sharpe,
          volatility:  res.metrics?.volatility,
        };
        apiSaveHistory(user.id, p, summary).catch(() => {/* silent — don't block UI */});
        setLastSavedPortfolio(p);
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [user, lastSavedPortfolio]);

  const handleRetry = useCallback(() => {
    if (portfolio) handleAnalyze(portfolio);
  }, [portfolio, handleAnalyze]);

 
  const handleLogin = (userData) => {
    setUser(userData);
    setShowLogin(false);
  };
  const handleLogout = () => {
    sessionStorage.removeItem("pp_user");
    setUser(null);
    if (activeTab === "history") setActiveTab("overview");
  };


  if (showLogin) {
    return <LoginPage onLogin={handleLogin} onSkip={() => setShowLogin(false)} />;
  }

  /* Shared card style */
  const card = {
    background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 10,
  };

  /* EMPTY STATE */
  if (!result && !error) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
        <Header result={null} loading={loading} user={user} onLogin={() => setShowLogin(true)} onLogout={handleLogout} />

        <div style={{display: "flex", justifyContent: "center", padding: "32px 16px" }}>
          <div style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 20 }}>
            {loading && (
              <div style={{
                textAlign: "center", fontSize: 16, color: "var(--text-3)",
                letterSpacing: ".06em", textTransform: "uppercase",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: "2px solid var(--cyan)", borderTopColor: "transparent",
                  animation: "spin .7s linear infinite",
                }} />
                Analysing portfolio...
              </div>
            )}
            {!loading && (
              <div style={{ textAlign: "center" }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 13,
                  background: "linear-gradient(135deg,var(--cyan),var(--green))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, fontWeight: 900, color: "var(--bg)", margin: "0 auto 18px",
                }}>P</div>
                <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.03em", marginBottom: 8 }}>PortfolioPilot</div>
                <div style={{ fontSize: 16, color: "var(--text-3)", marginBottom: 24, lineHeight: 1.6 }}>
                  Add your equities and options below, then run the analysis.
                  <br />Volatility, Greeks, ML predictions and AI recommendations in one view.
                </div>
              </div>
            )}
            <PortfolioForm onAnalyse={handleAnalyze} onLive={handleAnalyze} loading={loading} />
          </div>
        </div>
      </div>
    );
  }

  /* RESULTS STATE */
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <Header result={result} loading={loading} user={user} onLogin={() => setShowLogin(true)} onLogout={handleLogout} />

      <div style={{
        display: "grid", gridTemplateColumns: "300px 1fr",
        gap: 16, padding: 16,
        maxWidth: 1500, margin: "0 auto", width: "100%",
        flex: 1, alignItems: "start",
      }}>

        {/* Sidebar */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 68 }}>
          <PortfolioForm onAnalyse={handleAnalyze} onLive={handleAnalyze} loading={loading} initialPortfolio={portfolio} />
          {portfolio && (
            <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", padding: "6px 0", borderTop: "1px solid var(--border-2)" }}>
              Edit above and re-analyse to add or modify positions
            </div>
          )}
        </aside>

        {/* Main content */}
        <main style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {error   && <ErrorBanner error={error} onRetry={handleRetry} />}
          {result?.alerts?.length > 0 && <AlertBanner alerts={result.alerts} />}

          {loading && (
            <div style={{ position: "relative" }}>
              <SkeletonDashboard />
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(6,10,16,.55)", backdropFilter: "blur(4px)",
                borderRadius: 10, zIndex: 10,
                fontSize: 14, color: "var(--text-3)", letterSpacing: ".06em",
                textTransform: "uppercase", gap: 10, flexDirection: "column",
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: "2px solid var(--cyan)", borderTopColor: "transparent",
                  animation: "spin .7s linear infinite",
                }} />
                Updating portfolio...
              </div>
            </div>
          )}

          {result && (
            <>
              <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

              {/* Tab 1: Overview*/}
              {activeTab === "overview" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .3s ease both" }}>
                  {result.riskScore.rationale && (
                    <div style={{ ...card, padding: "14px 20px", fontSize: 16, color: "#fff", lineHeight: 1.8 }}>
                      {result.riskScore.rationale}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 14 }}>
                    <div style={{ ...card, padding: "18px 10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <RiskGauge score={result.compositeRiskScore} label={result.riskScore.label} size={185} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
                      <MetricCard label="1-Day VaR (95%)"  value={fmtPct(result.metrics.var95)}      sub="Parametric daily loss at 95% confidence" color={varColor(result.metrics.var95)}       icon="V" />
                      <MetricCard label="Daily Volatility" value={fmtPct(result.metrics.volatility)} sub="Portfolio sigma (daily)"                 color={volColor(result.metrics.volatility)}  icon="~" />
                      <MetricCard label="Sharpe Ratio"     value={fmtFix(result.metrics.sharpe)}     sub="Annualised risk-adjusted return"          color={sharpeColor(result.metrics.sharpe)}   icon="S" />
                      <MetricCard label="Risk Score"       value={String(result.compositeRiskScore)} unit=" / 100" sub={`Label: ${result.riskScore.label}`} color={scoreColor(result.compositeRiskScore)} icon="R" />
                    </div>
                  </div>
                  <GreeksPanel greeks={result.greeks} />
                </div>
              )}

              {/* Tab 2: Charts & Analytics */}
              {activeTab === "charts" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .3s ease both", width: "100%" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, width: "100%" }}>
                    <WeightChart weights={result.weights} covariance={result.covariance} />
                    <RiskBreakdownChart riskScore={result.riskScore} />
                  </div>
                  <div style={{ width: "100%" }}>
                    <ChartsPanel
                      risk_metrics={{
                        asset_weights: result.weights,
                        portfolio_volatility: result.metrics.volatility,
                        var_95: result.metrics.var95,
                        sharpe_ratio: result.metrics.sharpe,
                        portfolio_greeks: { net_delta: result.greeks.delta, net_vega: result.greeks.vega },
                      }}
                      predictions={result.predictions}
                    />
                  </div>
                  {Object.keys(result.pnlScenarios).length > 0 && (
                    <div style={{ width: "100%" }}>
                      <PnLScenarioChart scenarios={result.pnlScenarios} />
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Options */}
              {activeTab === "options" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .3s ease both" }}>
                  <OptionsRiskPanel greeks={result.greeks} predictions={result.predictions} pnlScenarios={result.pnlScenarios} optionGreeks={result.optionGreeks} />
                  {result.optionGreeks?.length > 0 ? (
                    <OptionsGreeksPanel greeks={result.optionGreeks} pnl_scenarios={result.pnlScenarios} />
                  ) : (
                    <div style={{ ...card, padding: "36px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 16, lineHeight: 1.8 }}>
                      No options contracts in this portfolio.
                      <br />Add contracts using the sidebar form to see Greeks analysis and P&amp;L scenarios.
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: Scenarios */}
              {activeTab === "scenarios" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .3s ease both" }}>
                  <div style={{ ...card, padding: "16px 20px", fontSize: 16, color: "var(--text-3)", lineHeight: 1.8 }}>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>Scenario Simulator</span>
                    <span style={{ margin: "0 10px", color: "var(--border)" }}>|</span>
                    Apply price shocks and volatility adjustments locally to see how your risk metrics change under stress. Computed instantly without a backend call.
                  </div>
                  <div style={{ width: "100%" }}>
                    <ScenarioSimulator baseResult={result} />
                  </div>
                </div>
              )}

              {/* Tab 5: Recommendations */}
              {activeTab === "recommendations" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeUp .3s ease both" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.02em" }}>AI Recommendations</div>
                      <div style={{ fontSize: 15, color: "var(--text-3)", marginTop: 4 }}>
                        {result.recommendations.length} recommendation{result.recommendations.length !== 1 ? "s" : ""} based on risk analysis
                        {OPENROUTER_KEY && <span style={{ color: "var(--green)", marginLeft: 10 }}>AI analysis active</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 30, fontWeight: 800, color: "var(--cyan)", fontFamily: "var(--font-mono)" }}>
                      {result.recommendations.length}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
                    
                    {/* AI Recommendations */}
                    <div style={{ width: "100%" }}>
                      {result.recommendations.length > 0 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          {result.recommendations.map((rec, i) => (
                            <RecommendationCard key={i} rec={rec} delay={i * 0.05} openRouterKey={OPENROUTER_KEY || null} />
                          ))}
                        </div>
                      ) : (
                        <div style={{ ...card, padding: "36px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 16 }}>
                          No recommendations generated for this portfolio.
                        </div>
                      )}
                    </div>

                    {/* ML Predictions */}
                    {result.predictions.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", marginTop: 8 }}>
                        <div>
                          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.02em" }}>ML Predictions</div>
                          <div style={{ fontSize: 14, color: "var(--text-3)", marginTop: 4 }}>Forward return & volatility estimates per symbol</div>
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 14 }}>
                          {result.predictions.map((p, i) => (
                            <div key={i} style={{ ...card, padding: "16px", display: "flex", flexDirection: "column", gap: 10, animation: `fadeUp .35s ${i * 0.05}s ease both` }}>
                              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--cyan)", fontFamily: "var(--font-mono)", borderBottom: "1px solid var(--border-2)", paddingBottom: 8, marginBottom: 4 }}>
                                {p.symbol}
                              </div>
                              <StatPill label="Pred. Return" value={fmtPct(p.predicted_return, 3)}  color={p.predicted_return >= 0 ? "green" : "red"} />
                              <StatPill label="Pred. Vol"    value={fmtPct(p.predicted_volatility)} color={p.predicted_volatility > 0.4 ? "red" : "cyan"} />
                              <StatPill label="Confidence"   value={fmtPct(p.confidence)}           color={p.confidence >= 0.7 ? "green" : "amber"} />
                              <StatPill label="Implied Vol"  value={avgImpliedVol[p.symbol] != null ? fmtPct(avgImpliedVol[p.symbol]) : "N/A"} color={avgImpliedVol[p.symbol] != null ? "purple" : "dim"} />
                              {avgImpliedVol[p.symbol] != null && (
                                <StatPill 
                                  label="ML vs Implied" 
                                  value={(p.predicted_volatility - avgImpliedVol[p.symbol] >= 0 ? "+" : "") + fmtPct(p.predicted_volatility - avgImpliedVol[p.symbol]) + " divergence"} 
                                  color={Math.abs(p.predicted_volatility - avgImpliedVol[p.symbol]) > 0.1 ? "red" : "amber"} 
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 6: History */}
              {activeTab === "history" && user && (
                <div style={{ animation: "fadeUp .3s ease both" }}>
                  <HistoryTab
                    user={user}
                    onLoadResult={(entry) => {
                      if (entry?.portfolio) {
                        handleAnalyze(entry.portfolio);
                      }
                    }}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}


function Header({ result, loading, user, onLogin, onLogout }) {
  return (
    <header style={{
      background: "var(--bg-1)", borderBottom: "1px solid var(--border)",
      padding: "11px 26px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(12px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "linear-gradient(135deg,var(--cyan),var(--green))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, fontWeight: 900, color: "var(--bg)",
        }}>P</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-.02em", lineHeight: 1 }}>PortfolioPilot</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", letterSpacing: ".1em", textTransform: "uppercase", lineHeight: 1, marginTop: 3 }}>
            Risk Intelligence Terminal
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {result && (
          <>
            <RegimeBadge regime={result.marketRegime} />
            <span style={{ fontSize: 13, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              {new Date(result.timestamp).toLocaleTimeString()}
            </span>
            {result.processingTimeMs > 0 && (
              <span style={{ fontSize: 13, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                {result.processingTimeMs.toFixed(0)}ms
              </span>
            )}
          </>
        )}
        {loading && <div style={{ width: 8, height: 15, background: "var(--cyan)", animation: "blink 1s step-end infinite" }} />}

        {/* Auth pill / sign-in button */}
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 13, color: "var(--cyan)", fontFamily: "var(--font-mono)",
              background: "var(--cyan-dim)", borderRadius: 6, padding: "4px 10px",
              border: "1px solid rgba(0,180,216,.25)",
            }}>
              {user.username}
            </span>
            <button onClick={onLogout} style={{
              background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
              padding: "4px 10px", fontSize: 12, color: "var(--text-3)", cursor: "pointer",
            }}>Sign Out</button>
          </div>
        ) : (
          <button onClick={onLogin} style={{
            background: "var(--cyan-dim)", border: "1px solid rgba(0,180,216,.3)", borderRadius: 6,
            padding: "5px 14px", fontSize: 13, color: "var(--cyan)", cursor: "pointer",
            fontWeight: 600, letterSpacing: ".03em",
          }}>Sign In</button>
        )}
      </div>
    </header>
  );
}
