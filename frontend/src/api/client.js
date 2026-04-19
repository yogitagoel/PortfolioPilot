// API client for communicating with the backend
import axios from "axios";

const BASE = "http://localhost:8000";

const http = axios.create({
  baseURL: BASE,
  timeout: 45_000,
  headers: { "Content-Type": "application/json" },
});

http.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      "Unknown error";
    const status = err.response?.status ?? 0;
    return Promise.reject({ message, status });
  }
);

// Local derivations
function deriveCompositeScore(vol, var95, sharpe) {
  const volNorm = Math.min(Math.max(vol / 0.04, 0), 1);
  const varNorm = Math.min(Math.max(var95 / 0.05, 0), 1);
  const sharpeNorm = 1 - Math.min(Math.max((sharpe + 1) / 4, 0), 1);
  return Math.round((0.4 * volNorm + 0.4 * varNorm + 0.2 * sharpeNorm) * 100);
}

function deriveMarketRegime(vol, netDelta, var95) {
  if (vol > 0.025 || var95 > 0.03) return "HIGH_RISK";
  if (Math.abs(netDelta) > 0.7) return "DIRECTIONAL";
  return "STABLE";
}

// Transformers 
function transformRecommendation(raw) {
  return {
    symbol:raw.symbol,
    action:raw.action,
    confidence:raw.confidence??0,
    reason:raw.reason??"",
    targetWeight:raw.target_weight??0,
  };
}

export function transformAnalysis(raw) {
  const rm = raw.risk_metrics ?? {};
  const greeks = rm.portfolio_greeks ?? {};
  const rs = raw.risk_score ?? {};

  const vol = rm.portfolio_volatility ?? 0;
  const var95 = rm.var_95 ?? 0;
  const sharpe = rm.sharpe_ratio ?? 0;
  const netDelta = greeks.net_delta ?? 0;

  const backendScore = rs.score ?? null;
  const compositeRiskScore = backendScore !== null ? Math.round(backendScore) : deriveCompositeScore(vol, var95, sharpe);

  return {
    riskScore: {
      score: rs.score ?? 0,
      label: rs.label ?? "UNKNOWN",
      rationale: rs.rationale ?? "",
      volContribution: (rs.vol_contribution && rs.vol_contribution > 0)
        ? rs.vol_contribution
        : Math.min(25, Math.max(0, ((vol * Math.sqrt(252)) - 0.05) / 0.35 * 25)),
      varContribution: rs.var_contribution   ?? 0,
      sharpeContribution: rs.sharpe_contribution ?? 0,
    },

    metrics: {
      volatility: vol,
      var95,
      sharpe,
      totalOptionsNotional: rm.total_options_notional ?? 0,
    },

    greeks: {
      delta: netDelta,
      gamma: greeks.net_gamma ?? 0,
      vega: greeks.net_vega  ?? 0,
      theta: greeks.net_theta ?? 0,
      rho: greeks.net_rho   ?? 0,
      options_risk_score: greeks.options_risk_score ?? 0,
    },

    weights: rm.asset_weights          ?? {},
    covariance: rm.covariance_matrix ?? {},
    pnlScenarios: rm.options_pnl_scenarios  ?? {},

    recommendations: (raw.recommendations ?? []).map(transformRecommendation),

    optionGreeks: raw.option_greeks_breakdown ?? [],
    predictions: raw.predictions ?? [],
    summary: raw.summary ?? "",
    alerts: raw.alerts ?? [],
    processingTimeMs: raw.processing_time_ms ?? 0,

    compositeRiskScore,
    marketRegime: deriveMarketRegime(vol, netDelta, var95),
    timestamp: new Date().toISOString(),
  };
}

export function computeScenarioLocally(baseResult, priceShockPct, volAdjPct) {
  const { metrics, greeks, riskScore } = baseResult;

  const shockFactor = 1 + Math.abs(priceShockPct) * 0.01 * 0.5;
  const volFactor   = 1 + volAdjPct * 0.01;
  const stressedVol = metrics.volatility * shockFactor * volFactor;

  const Z       = 1.6449;
  const muDaily = metrics.sharpe > 0
    ? (metrics.sharpe * metrics.volatility * Math.sqrt(252) + 0.05) / 252
    : 0;
  const stressedVar95   = Z * stressedVol - muDaily;
  const sigAnnual       = stressedVol * Math.sqrt(252);
  const stressedSharpe  = sigAnnual > 1e-8 ? (muDaily * 252 - 0.05) / sigAnnual : 0;
  const stressedScore   = deriveCompositeScore(stressedVol, stressedVar95, stressedSharpe);
  const stressedLabel   =
    stressedScore >= 75 ? "EXTREME" :
    stressedScore >= 50 ? "HIGH"    :
    stressedScore >= 25 ? "MODERATE": "LOW";

  return {
    ...baseResult,
    metrics: { ...metrics, volatility: stressedVol, var95: stressedVar95, sharpe: stressedSharpe },
    riskScore: { ...riskScore, score: stressedScore, label: stressedLabel },
    compositeRiskScore: stressedScore,
    marketRegime: deriveMarketRegime(stressedVol, greeks.delta, stressedVar95),
    isScenario: true,
  };
}

// Public API

// POST /api/v1/analyse
export async function analyzePortfolio(portfolio) {
  const { data } = await http.post("/api/v1/analyse", portfolio);
  return transformAnalysis(data);
}

export const analysePortfolio = analyzePortfolio;

// GET /api/v1/health
export async function getHealth() {
  const { data } = await http.get("/api/v1/health");
  return data;
}

// POST /api/v1/sessions: register portfolio for live updates 
export async function createSession(portfolio) {
  const { data } = await http.post("/api/v1/sessions", portfolio);
  return data;
}

// GET /api/v1/sessions/:id :latest analysis for a live session
export async function getSession(sessionId) {
  const { data } = await http.get(`/api/v1/sessions/${sessionId}`);
  const transformed = transformAnalysis(data);
  if (data.updated_at) transformed.updated_at = data.updated_at;
  return transformed;
}

// POST /api/v1/sessions/:id/refresh : Recalculation
export async function refreshSession(sessionId) {
  const { data } = await http.post(`/api/v1/sessions/${sessionId}/refresh`);
  return data; // { status, updated_at }
}

// DELETE /api/v1/sessions/:id
export async function deleteSession(sessionId) {
  const { data } = await http.delete(`/api/v1/sessions/${sessionId}`);
  return data;
}

// Auth + History
export async function apiRegister(username, password) {
  const res = await http.post("/api/v1/auth/register", { username, password });
  return res.data;
}

export async function apiLogin(username, password) {
  const res = await http.post("/api/v1/auth/login", { username, password });
  return res.data;
}

export async function apiSaveHistory(userId, portfolio, summary) {
  const res = await http.post("/api/v1/history", {
    user_id: userId,
    portfolio,
    summary,
  });
  return res.data;
}

export async function apiGetHistory(userId) {
  const res = await http.get(`/api/v1/history/${userId}`);
  return res.data;
}
