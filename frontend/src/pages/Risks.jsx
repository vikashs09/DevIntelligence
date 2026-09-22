import { useEffect, useState } from "react";
import { ShieldAlert, RefreshCw, CheckCircle2 } from "lucide-react";
import { api } from "../services/api";

export default function Risks() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setD((await api.get("/analytics/overview")).data); }
    catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="page">
      <div className="page-title">
        <div><span className="eyebrow">EARLY WARNING SYSTEM</span><h1>Health & Risks</h1><p>Explainable signals from delivery data, GitHub activity, issues and pull requests.</p></div>
        <button className="primary small" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button>
      </div>

      {!d ? <div className="loading">Checking workspace health…</div> : (
        <>
          <section className="panel health-summary">
            <div className="health-score-large">
              <div className="score-ring" style={{ "--score": `${d.health.score}%` }}><div><strong>{d.health.score}</strong><small>/100</small></div></div>
              <div><span className="eyebrow">WEIGHTED PROJECT HEALTH</span><h2>{healthLabel(d.health.score)}</h2><p className="muted">The score is calculated from four normalized evidence signals.</p></div>
            </div>
          </section>

          <div className="analytics-grid">
            <Card title="Task evidence" value={d.health.taskScore} weight="40%" />
            <Card title="GitHub activity" value={d.health.githubActivity} weight="25%" />
            <Card title="Issue health" value={d.health.issueScore} weight="20%" />
            <Card title="PR health" value={d.health.prScore} weight="15%" />
          </div>

          <section className="panel risk-list-panel">
            <div className="panel-head"><div><span className="eyebrow">ACTIONABLE SIGNALS</span><h2>Risk register</h2></div><ShieldAlert size={19}/></div>
            {d.health.risks.map((r, i) => (
              <div className="risk-card" key={i}>
                <div className="risk-icon"><ShieldAlert size={19}/></div>
                <div><span className={`risk-sev ${r.severity}`}>{r.severity}</span><h3>{r.title}</h3><p>{r.detail}</p></div>
              </div>
            ))}
            {!d.health.risks.length && <div className="empty"><CheckCircle2 size={28}/><p>No current risk signals.</p></div>}
          </section>
        </>
      )}
    </div>
  );
}
function Card({ title, value, weight }) {
  return <div className="metric"><div><span>{title}</span><strong>{value}/100</strong><small>Weight {weight}</small></div></div>;
}
function healthLabel(score) {
  if (score >= 80) return "Strong evidence";
  if (score >= 60) return "Needs attention";
  return "High attention required";
}
