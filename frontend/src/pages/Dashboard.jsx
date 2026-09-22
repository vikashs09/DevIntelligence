import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, Users, ShieldAlert, FolderKanban, GitCommit, GitPullRequest, CircleDot } from "lucide-react";
import { api } from "../services/api";

export default function Dashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/analytics/overview").then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <div className="loading">Loading your live workspace…</div>;

  const { stats: s, health: h, github: g } = data;

  return (
    <div className="page">
      <div className="page-title">
        <div><span className="eyebrow">LIVE COMMAND CENTER</span><h1>Workspace overview</h1><p>One view of delivery, team activity, GitHub evidence and health.</p></div>
        <div className="live-pill online"><span /> Live data</div>
      </div>

      <div className="metric-grid">
        <Metric icon={FolderKanban} label="Projects" value={s.projects} hint="Workspace projects" />
        <Metric icon={CheckCircle2} label="Completed tasks" value={s.completed} hint={`${s.pending} active`} />
        <Metric icon={Users} label="Team members" value={s.members} hint="Workspace people" />
        <Metric icon={ShieldAlert} label="Health score" value={`${h.score}/100`} hint={`${h.risks.length} active signals`} />
      </div>

      <div className="dashboard-grid">
        <section className="panel health-card">
          <div className="panel-head"><div><span className="eyebrow">PROJECT HEALTH</span><h2>Evidence score</h2></div></div>
          <div className="health-main">
            <div className="score-ring" style={{ "--score": `${h.score}%` }}><div><strong>{h.score}</strong><small>/100</small></div></div>
            <div className="health-bars">
              <Bar label="Task evidence" value={h.taskScore} />
              <Bar label="GitHub activity" value={h.githubActivity} />
              <Bar label="Issue health" value={h.issueScore} />
              <Bar label="PR health" value={h.prScore} />
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">ENGINEERING SIGNALS</span><h2>GitHub snapshot</h2></div><GitCommit size={18}/></div>
          <div className="signal-grid">
            <Signal icon={GitCommit} label="30d commits" value={g.recentCommits30d} />
            <Signal icon={GitPullRequest} label="Open PRs" value={g.openPullRequests} />
            <Signal icon={CircleDot} label="Open issues" value={g.openIssues} />
            <Signal icon={GitPullRequest} label="Merged PRs" value={g.mergedPullRequests} />
          </div>
          <p className="muted dashboard-note">{g.totalIssues ? `${g.openIssues} of ${g.totalIssues} issues remain open.` : "Connect and sync GitHub to enrich health evidence."}</p>
        </section>
      </div>

      <section className="panel action-panel">
        <div className="panel-head"><div><span className="eyebrow">ACTION CENTER</span><h2>Current signals</h2></div></div>
        {h.risks.slice(0, 5).map((r, i) => <div className="action" key={i}><div className="status-dot" /><div><b>{r.title}</b><p>{r.detail}</p></div><ArrowUpRight size={16}/></div>)}
        {!h.risks.length && <div className="empty">No active signals. Keep tasks and GitHub data synchronized.</div>}
      </section>
    </div>
  );
}
function Metric({ icon: Icon, label, value, hint }) { return <div className="metric"><div className="metric-icon"><Icon size={19}/></div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></div>; }
function Bar({ label, value }) { return <div className="bar-row"><div><span>{label}</span><b>{value}</b></div><div className="bar"><i style={{ width: `${Math.min(100, value)}%` }}/></div></div>; }
function Signal({ icon: Icon, label, value }) { return <div className="signal"><Icon size={15}/><span>{label}</span><strong>{value}</strong></div>; }
