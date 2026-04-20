
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
  Sector,
} from "recharts";

const PALETTE = ["#00b4d8","#0cce6b","#a78bfa","#f5a623","#ff3d57","#38bdf8","#34d399"];

const card = {
  background:"var(--bg-1)", border:"1px solid var(--border)",
  borderRadius:10, padding:"18px 20px",
};
const sectionTitle = {
  fontSize:13, fontWeight:700, color:"#fff",
  textTransform:"uppercase", letterSpacing:".1em", marginBottom:16,
};
const tipStyle = {
  background:"var(--bg-3)", border:"1px solid var(--border)",
  borderRadius:7, padding:"9px 13px", fontSize:14,
};

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tipStyle}>
      {label && <div style={{ color:"var(--text-2)", marginBottom:4 }}>{label}</div>}
      {payload.map((p,i)=>(
        <div key={i} style={{ color:p.color||"var(--cyan)", fontFamily:"var(--font-mono)" }}>
          {p.name}: <b>{typeof p.value==="number" ? p.value.toFixed(5) : p.value}</b>
        </div>
      ))}
    </div>
  );
}

function ActivePie(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx} cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 6}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke="none"
    />
  );
}

export function WeightChart({ weights, covariance }) {
  const data = Object.entries(weights).map(([name, value]) => ({ name, value }));
  if (!data.length) return null;


  const symbols = data.map(d => d.name);
  const w = symbols.map(s => weights[s] ?? 0);

  const riskData = (() => {
    if (!covariance || Object.keys(covariance).length === 0) return [];
    const sigmaw = symbols.map((si) =>
      symbols.reduce((sum, sj, j) => sum + (covariance[si]?.[sj] ?? 0) * w[j], 0)
    );
    const raw = symbols.map((_, i) => Math.abs(w[i] * sigmaw[i]));
    const total = raw.reduce((s, v) => s + v, 0) || 1;
    return symbols.map((sym, i) => ({
      name: sym,
      value: parseFloat(((raw[i] / total) * 100).toFixed(2)),
    }));
  })();

  return (
    <>
      <div style={{display:"flex",gap:14,width:"100%"}}>
      {/* ── Weight Allocation ── */}
      <div style={{...card,flex:1}}>
        <div style={sectionTitle}>Weight Allocation</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", gap: 24, width: "100%" }}>
          <div style={{ flexShrink: 0, width: 160, height: 160 }}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={data} cx="50%" cy="50%"
                  innerRadius={45} outerRadius={70}
                  paddingAngle={2} dataKey="value"
                  activeShape={<ActivePie />}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]}
                      stroke="var(--bg-1)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<Tip />} cursor={false} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, maxWidth: "250px" }}>
            {data.map((d, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 15, width: "100%",
                paddingBottom: i < data.length - 1 ? 6 : 0,
                borderBottom: i < data.length - 1 ? "1px solid var(--border-2)" : "none",
              }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                <span style={{ flex: 1, color: "var(--text-2)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.name}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: PALETTE[i % PALETTE.length], fontWeight: 700, flexShrink: 0 }}>
                  {(d.value * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Risk Contribution ── */}
      {riskData.length > 0 && (
        <div style={{ ...card, flex: 1 }}>
          <div style={sectionTitle}>Risk Contribution</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", gap: 24, width: "100%" }}>
            <div style={{ flexShrink: 0, width: 160, height: 160 }}>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={riskData} cx="50%" cy="50%"
                    innerRadius={45} outerRadius={70}
                    paddingAngle={2} dataKey="value"
                    activeShape={<ActivePie />}
                  >
                    {riskData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]}
                        stroke="var(--bg-1)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip content={<Tip />} cursor={false} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, maxWidth: "250px" }}>
              {riskData.map((d, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 15, width: "100%",
                  paddingBottom: i < riskData.length - 1 ? 6 : 0,
                  borderBottom: i < riskData.length - 1 ? "1px solid var(--border-2)" : "none",
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                  <span style={{ flex: 1, color: "var(--text-2)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.name}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: PALETTE[i % PALETTE.length], fontWeight: 700, flexShrink: 0 }}>
                    {d.value.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

export function RiskBreakdownChart({ riskScore }) {
  if (!riskScore) return null;
  const vol    = +(riskScore.volContribution    || 0).toFixed(2);
  const varC   = +(riskScore.varContribution    || 0).toFixed(2);
  const sharpe = +(riskScore.sharpeContribution || 0).toFixed(2);

  const data = [
    { name:"Volatility", value: vol,    fill:"var(--red)"   },
    { name:"VaR",        value: varC,   fill:"var(--amber)" },
    { name:"Sharpe",     value: sharpe, fill:"var(--cyan)"  },
  ];

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const domainMax = Math.ceil(maxVal * 1.3);

  return (
    <div style={card}>
      <div style={sectionTitle}>Risk Score Components</div>
      <div style={{ fontSize:14, color:"var(--text-3)", marginBottom:10 }}>
        Points contributed to the composite risk score (0–100) by each factor
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} layout="vertical" margin={{ left:72, right:36, top:4, bottom:4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-3)" horizontal={false}/>
          <XAxis type="number"
            tick={{ fill:"var(--text-3)", fontSize:13, fontFamily:"var(--font-mono)" }}
            domain={[0, domainMax]}
            tickFormatter={v => v.toFixed(1)}
          />
          <YAxis type="category" dataKey="name"
            tick={{ fill:"var(--text-2)", fontSize:14 }} width={72}/>
          <Tooltip content={<Tip/>} cursor={{ fill:"rgba(255,255,255,0.04)" }}
            formatter={(v) => [v.toFixed(2), "Risk pts"]}/>
          <Bar dataKey="value" name="Score" radius={[0,4,4,0]} maxBarSize={22}
            activeBar={{ stroke:"none", opacity:0.9 }}>
            {data.map((d,i) => <Cell key={i} fill={d.fill}/>)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


export function GreeksPanel({ greeks }) {
  if (!greeks) return null;
  const rows = [
    { g:"Delta",  v:greeks.delta, d:"Price sensitivity — $1 move in underlying" },
    { g:"Gamma",  v:greeks.gamma, d:"Rate of change of delta" },
    { g:"Vega",   v:greeks.vega,  d:"P&L per 1% implied vol change" },
    { g:"Theta",  v:greeks.theta, d:"Daily time decay ($ per day)" },
    { g:"Rho",    v:greeks.rho,   d:"P&L per 1% interest rate change" },
  ];

  return (
    <div style={card}>
      <div style={sectionTitle}>Portfolio Greeks</div>
      <div>
        {rows.map((r,i)=>(
          <div key={i} style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"9px 0",
            borderBottom: i<rows.length-1 ? "1px solid var(--border-2)" : "none",
          }}>
            <div>
              <span style={{ fontSize:15, fontFamily:"var(--font-mono)", color:"var(--text)" }}>
                {r.g}
              </span>
              <span style={{ fontSize:15, color:"var(--text-3)", marginLeft:10 }}>{r.d}</span>
            </div>
            <span style={{
              fontFamily:"var(--font-mono)", fontSize:16, fontWeight:600,
              color: r.v > 0 ? "var(--green)" : r.v < 0 ? "var(--red)" : "var(--text-3)",
            }}>
              {r.v?.toFixed(4) ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


export function PnLScenarioChart({ scenarios }) {
  const entries = Object.entries(scenarios ?? {});
  if (!entries.length) return null;

  const data = entries.map(([key,val])=>({
    name:  key.includes("_") ? key.split("_").pop() : key,
    pnl:   +val.toFixed(2),
    color: val >= 0 ? "var(--green)" : "var(--red)",
  }));

  return (
    <div style={card}>
      <div style={sectionTitle}>Options P&L Scenarios</div>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} margin={{ left:12, right:12, top:4, bottom:4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-3)"/>
          <XAxis dataKey="name"
            tick={{ fill:"var(--text-3)", fontSize:13, fontFamily:"var(--font-mono)" }}/>
          <YAxis tick={{ fill:"var(--text-3)", fontSize:13, fontFamily:"var(--font-mono)" }}/>
          <Tooltip content={<Tip/>} cursor={{ fill:"rgba(255,255,255,0.04)" }}/>
          <ReferenceLine y={0} stroke="var(--border)"/>
          <Bar dataKey="pnl" name="P&L ($)" radius={[3,3,0,0]} maxBarSize={30}
            activeBar={{ stroke:"none", opacity:0.9 }}>
            {data.map((d,i) => <Cell key={i} fill={d.color}/>)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

