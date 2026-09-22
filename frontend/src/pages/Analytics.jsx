import { useEffect, useState } from "react";
import { Download, RefreshCw, FileText, Activity, AlertTriangle } from "lucide-react";
import { api } from "../services/api";

export default function Analytics() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setD((await api.get("/analytics/overview")).data); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function downloadReport() {
    if (!d) return;
    const report = {
      product: "Dev Intelligence",
      generatedAt: d.generatedAt,
      workspace: d.stats,
      github: d.github,
      health: d.health,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dev-intelligence-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printReport() {
    if (!d) return;
    const w = window.open("", "_blank", "width=900,height=900");
    if (!w) return;
    w.document.write(`<html><head><title>Dev Intelligence Report</title><style>
      body{font-family:Arial,sans-serif;padding:40px;color:#17121f}h1{margin-bottom:4px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{padding:18px;border:1px solid #ddd;border-radius:12px}.muted{color:#666}.risk{padding:12px;border:1px solid #ddd;border-radius:10px;margin:8px 0}
    </style></head><body><h1>Dev Intelligence — Workspace Report</h1><p class="muted">Generated ${new Date(d.generatedAt).toLocaleString()}</p>
    <div class="grid">${[
      ["Health", `${d.health.score}/100`],["Tasks", d.stats.tasks],["Completed", d.stats.completed],["Overdue", d.health.overdue]
    ].map(([a,b]) => `<div class="card"><b>${a}</b><h2>${b}</h2></div>`).join("")}</div>
    <h2>Health components</h2><div class="grid">${[
      ["Task evidence",d.health.taskScore],["GitHub activity",d.health.githubActivity],["Issue health",d.health.issueScore],["PR health",d.health.prScore]
    ].map(([a,b])=>`<div class="card"><b>${a}</b><h2>${b}/100</h2></div>`).join("")}</div>
    <h2>Risks</h2>${d.health.risks.length ? d.health.risks.map(r=>`<div class="risk"><b>${r.severity.toUpperCase()}</b> — ${escapeHtml(r.title)}<br><span class="muted">${escapeHtml(r.detail)}</span></div>`).join("") : "<p>No current risk signals.</p>"}
    <h2>GitHub</h2><p>30-day commits: ${d.github.recentCommits30d} · Open issues: ${d.github.openIssues}/${d.github.totalIssues} · Open PRs: ${d.github.openPullRequests}/${d.github.totalPullRequests} · Merged PRs: ${d.github.mergedPullRequests}</p>
    </body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  return (
    <div className="page">
      <div className="page-title">
        <div><span className="eyebrow">SIGNAL EXPLORER</span><h1>Analytics & Reports</h1><p>Transparent project metrics calculated from your workspace and GitHub evidence.</p></div>
        <div className="page-actions"><button className="ghost" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button><button className="primary small" onClick={downloadReport} disabled={!d}><Download size={15}/> JSON report</button><button className="primary small" onClick={printReport} disabled={!d}><FileText size={15}/> Print / PDF</button></div>
      </div>

      {d && <>
        <div className="analytics-grid">
          <Card t="Health score" v={`${d.health.score}/100`} />
          <Card t="Task completion" v={`${d.stats.tasks ? Math.round(d.stats.completed / d.stats.tasks * 100) : 0}%`} />
          <Card t="Active work" v={d.stats.pending} />
          <Card t="Due within 3 days" v={d.stats.dueSoon} />
        </div>

        <section className="panel formula">
          <div className="panel-head"><div><span className="eyebrow">HEALTH MODEL</span><h2>Weighted Project Health Score</h2></div><Activity size={19}/></div>
          <p>Task evidence 40% · GitHub activity 25% · Issue health 20% · PR health 15%</p>
          <div className="formula-grid">
            <Bar label="Task evidence" value={d.health.taskScore} weight="40%" />
            <Bar label="GitHub activity" value={d.health.githubActivity} weight="25%" />
            <Bar label="Issue health" value={d.health.issueScore} weight="20%" />
            <Bar label="PR health" value={d.health.prScore} weight="15%" />
          </div>
        </section>

        <section className="panel report-risk-panel">
          <div className="panel-head"><div><span className="eyebrow">RISK SIGNALS</span><h2>What needs attention</h2></div><AlertTriangle size={19}/></div>
          {d.health.risks.map((r, i) => <div className="risk-inline" key={i}><span className={`risk-sev ${r.severity}`}>{r.severity}</span><div><b>{r.title}</b><small>{r.detail}</small></div></div>)}
          {!d.health.risks.length && <div className="empty">No current risk signals.</div>}
        </section>
      </>}
    </div>
  );
}

function Card({ t, v }) {
  return <div className="metric"><div><span>{t}</span><strong>{v}</strong><small>Live workspace value</small></div></div>;
}
function Bar({ label, value, weight }) {
  return <div className="health-component"><div><span>{label}</span><b>{value}/100 <small>weight {weight}</small></b></div><div className="bar"><i style={{ width: `${Math.min(100, value)}%` }} /></div></div>;
}
function escapeHtml(s = "") { return s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
