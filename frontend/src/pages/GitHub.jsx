import { useEffect, useMemo, useState } from "react";
import {
  Github, RefreshCw, ExternalLink, Unplug, Link2, GitPullRequest,
  CircleDot, GitCommit, GitBranch, Users, Workflow, Tag, GitFork,
  ShieldCheck, Activity, FileText, Printer, Sparkles, Search
} from "lucide-react";
import { api } from "../services/api";

const tabs = [
  ["overview", "Overview", Activity],
  ["prs", "Pull Requests", GitPullRequest],
  ["issues", "Issues", CircleDot],
  ["commits", "Commits", GitCommit],
  ["people", "People", Users],
  ["ci", "CI / Actions", Workflow],
  ["releases", "Releases", Tag],
  ["activity", "Activity", Activity],
];

export default function GitHub({ user }) {
  const [state, setState] = useState(null);
  const [repos, setRepos] = useState([]);
  const [linked, setLinked] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState("");
  const [intel, setIntel] = useState(null);
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [intelLoading, setIntelLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedRepo = useMemo(
    () => linked.find((r) => r.fullName === selected) || repos.find((r) => r.full_name === selected),
    [linked, repos, selected]
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const s = await api.get("/github/status");
      setState(s.data);
      if (!s.data.connected) {
        setRepos([]); setLinked([]); return;
      }
      const [r, l, p] = await Promise.all([
        api.get("/github/repositories"),
        api.get("/github/linked"),
        api.get("/projects"),
      ]);
      setRepos(r.data.repositories || []);
      setLinked(l.data.repositories || []);
      setProjects(p.data.projects || []);
      if (!selected && l.data.repositories?.[0]) setSelected(l.data.repositories[0].fullName);
    } catch (e) {
      setError(e.response?.data?.message || "GitHub request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function loadIntelligence(fullName = selected) {
    if (!fullName) return;
    const [o, n] = fullName.split("/");
    if (!o || !n) return;
    setIntelLoading(true);
    setError("");
    try {
      const r = await api.get(`/github/repositories/${encodeURIComponent(o)}/${encodeURIComponent(n)}/intelligence`);
      setIntel(r.data.intelligence);
    } catch (e) {
      setError(e.response?.data?.message || "Unable to load GitHub intelligence.");
    } finally {
      setIntelLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selected) loadIntelligence(selected); }, [selected]);

  async function connectGitHub() {
    try {
      const r = await api.get("/auth/github/connect-url");
      window.location.href = r.data.url;
    } catch (e) {
      setError(e.response?.data?.message || "GitHub OAuth is not configured.");
    }
  }

  async function sync(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/github/sync", { owner, name, projectId: projectId || undefined });
      const full = `${owner}/${name}`;
      setOwner(""); setName(""); setProjectId("");
      await load();
      setSelected(full);
      await loadIntelligence(full);
    } catch (e) {
      setError(e.response?.data?.message || "Repository sync failed.");
    }
  }

  async function disconnect(id) {
    if (!window.confirm("Disconnect this repository from your workspace?")) return;
    try {
      await api.delete(`/github/linked/${id}`);
      setIntel(null); setSelected("");
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Unable to disconnect repository.");
    }
  }

  async function printReport() {
    if (!selected) return;
    const [o, n] = selected.split("/");
    try {
      const r = await api.get(`/github/report?owner=${encodeURIComponent(o)}&name=${encodeURIComponent(n)}`);
      const report = r.data.report;
      const html = `<!doctype html><html><head><title>${report.repository} · Dev Intelligence Report</title>
      <style>body{font-family:Inter,Arial,sans-serif;padding:36px;color:#111}h1{margin-bottom:4px}small{color:#666}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:24px 0}.card{padding:16px;border:1px solid #ddd;border-radius:12px}.card b{font-size:24px;display:block;margin-top:5px}.row{padding:10px 0;border-bottom:1px solid #eee}.muted{color:#666}@media print{body{padding:10px}}</style></head>
      <body><h1>Dev Intelligence — GitHub Report</h1><div class="muted">${report.repository}</div><small>Generated ${new Date(report.generatedAt).toLocaleString()}</small>
      <div class="grid">${Object.entries(report.metrics).map(([k,v])=>`<div class="card">${k.replace(/[A-Z]/g,m=>" "+m)}<b>${v}</b></div>`).join("")}</div>
      <h2>Contributors / Commit Authors</h2>${report.contributors.map(x=>`<div class="row"><b>${x.author}</b> — ${x.commits} commits</div>`).join("")}
      <h2>PR Authors</h2>${report.prAuthors.map(x=>`<div class="row"><b>${x.author}</b> — ${x.prs} PRs</div>`).join("")}
      <h2>Issue Authors</h2>${report.issueAuthors.map(x=>`<div class="row"><b>${x.author}</b> — ${x.issues} issues</div>`).join("")}
      <h2>Recent Activity</h2>${report.recentActivity.map(x=>`<div class="row"><b>${x.actor}</b> · ${x.title}<br><small>${new Date(x.date).toLocaleString()} · ${x.meta || ""}</small></div>`).join("")}
      <script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
      const w = window.open("", "_blank", "width=1100,height=800");
      w.document.write(html); w.document.close();
    } catch (e) {
      setError(e.response?.data?.message || "Report generation failed.");
    }
  }

  const canManage = ["leader", "manager", "team_leader"].includes(user.role);
  const filteredRepos = repos.filter((r) => r.full_name.toLowerCase().includes(query.toLowerCase()));

  if (!state?.connected) {
    return (
      <div className="page cinematic-page">
        <div className="hero-3d github-hero">
          <div className="hero-orbit"><div className="orbit-core"><Github size={58} /></div><span /><span /><span /></div>
          <div>
            <span className="eyebrow">GITHUB INTELLIGENCE CLOUD</span>
            <h1>Connect your GitHub.<br /><em>Understand everything.</em></h1>
            <p>Commits, PRs, issues, reviews, collaborators, forks, CI/CD, releases and activity—organized into one live engineering intelligence layer.</p>
            <button className="primary magnetic" onClick={connectGitHub}><Github size={18} /> Connect GitHub</button>
          </div>
        </div>
        {error && <div className="error-box">{error}</div>}
        <div className="feature-orbit-grid">
          {["Fork intelligence", "PR & review analytics", "Contributor activity", "CI/CD monitoring", "Issue intelligence", "Printable reports"].map((x) => <div className="glass-feature" key={x}><Sparkles size={17}/><b>{x}</b><small>Live GitHub evidence, not dummy metrics.</small></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="page cinematic-page">
      <div className="page-title glass-title">
        <div>
          <span className="eyebrow">LIVE DEVELOPMENT EVIDENCE</span>
          <h1>GitHub Intelligence</h1>
          <p>Everything your individual workspace or team needs to understand engineering activity.</p>
        </div>
        <div className="title-actions">
          <button className="ghost-btn" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button>
          <button className="primary small" onClick={printReport} disabled={!selected}><Printer size={15}/> Print Report</button>
        </div>
      </div>

      {error && <div className="error-box glass-alert">{error}</div>}

      <section className="github-account glass-panel">
        <div className="account-orb">{state.account?.avatar ? <img src={state.account.avatar} alt="" /> : <Github/>}</div>
        <div className="account-copy"><span className="eyebrow">CONNECTED IDENTITY</span><h2>@{state.account?.login}</h2><p>{state.account?.name || "GitHub developer"} · {state.account?.publicRepos ?? 0} public repositories</p></div>
        <div className="account-pills"><span><ShieldCheck size={13}/> OAuth</span><span><Activity size={13}/> Live</span></div>
      </section>

      {canManage && (
        <form className="repo-connect-form glass-panel" onSubmit={sync}>
          <div><span className="eyebrow">LINK A REPOSITORY</span><h3>Add a project data source</h3></div>
          <input value={owner} onChange={(e)=>setOwner(e.target.value)} placeholder="owner / organization" required />
          <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="repository" required />
          <select value={projectId} onChange={(e)=>setProjectId(e.target.value)}><option value="">Project (optional)</option>{projects.map(p=><option key={p._id} value={p._id}>{p.name}</option>)}</select>
          <button className="primary small"><Link2 size={15}/> Sync</button>
        </form>
      )}

      <div className="repo-intelligence-layout">
        <aside className="repo-dock glass-panel">
          <div className="dock-head"><div><b>Repositories</b><small>{repos.length} accessible</small></div><Search size={15}/></div>
          <div className="search-inline glass-input"><Search size={14}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search repositories"/></div>
          <div className="repo-list">
            {filteredRepos.map(r => <button key={r.id} className={`repo-select ${selected===r.full_name?"active":""}`} onClick={()=>setSelected(r.full_name)}><Github size={15}/><span><b>{r.name}</b><small>{r.fork ? "Fork" : r.private ? "Private" : "Public"} · ★ {r.stargazers_count}</small></span></button>)}
          </div>
        </aside>

        <section className="intel-main">
          {intelLoading ? <div className="glass-panel intel-loading"><div className="data-pulse"/><h3>Synchronizing intelligence…</h3><p>Reading repository evidence from GitHub.</p></div> : intel ? <IntelligenceView intel={intel} tab={tab} setTab={setTab} onDisconnect={selectedRepo && linked.find(r=>r.fullName===selected)?.connectedBy ? ()=>disconnect(linked.find(r=>r.fullName===selected)._id) : null}/> : <div className="glass-panel empty"><Github size={30}/><h3>Select a repository</h3><p>Choose a repository to open its intelligence graph.</p></div>}
        </section>
      </div>
    </div>
  );
}

function IntelligenceView({ intel, tab, setTab }) {
  const r = intel.repository, s = intel.summary;
  return (
    <>
      <section className="repo-hero-card glass-panel">
        <div className="repo-hero-symbol"><Github size={30}/></div>
        <div className="repo-hero-copy"><div className="repo-badges"><span>{r.private ? "PRIVATE" : "PUBLIC"}</span>{r.fork && <span><GitFork size={12}/> FORK</span>}<span>{r.language || "Code"}</span></div><h2>{r.fullName}</h2><p>{r.description || "No repository description."}</p>{r.fork && <small><GitFork size={12}/> Forked from <b>{r.parent || r.source || "unknown source"}</b></small>}</div>
        <a className="icon-btn" href={r.url} target="_blank" rel="noreferrer"><ExternalLink size={16}/></a>
      </section>

      <div className="metric-grid cinematic-metrics">
        <Metric icon={GitCommit} value={s.commits} label="Commits" />
        <Metric icon={GitPullRequest} value={s.prs} label="Pull Requests" sub={`${s.openPrs} open · ${s.mergedPrs} merged`} />
        <Metric icon={CircleDot} value={s.issues} label="Issues" sub={`${s.openIssues} open · ${s.closedIssues} closed`} />
        <Metric icon={Users} value={s.contributors} label="Contributors" />
        <Metric icon={GitBranch} value={s.branches} label="Branches" />
        <Metric icon={Users} value={s.collaborators} label="Collaborators" />
        <Metric icon={Workflow} value={s.ciRuns} label="CI Runs" sub={s.ciSuccessRate == null ? "No completed runs" : `${s.ciSuccessRate}% success`} />
        <Metric icon={Tag} value={s.releases} label="Releases" />
      </div>

      <div className="intel-tabs glass-panel">{tabs.map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><Icon size={14}/>{label}</button>)}</div>

      <section className="glass-panel intel-content">
        {tab==="overview" && <Overview intel={intel}/>}
        {tab==="prs" && <PRTable items={intel.pullRequests}/>}
        {tab==="issues" && <IssueTable items={intel.issues}/>}
        {tab==="commits" && <CommitTable items={intel.commits}/>}
        {tab==="people" && <People intel={intel}/>}
        {tab==="ci" && <CITable items={intel.ciRuns}/>}
        {tab==="releases" && <ReleaseTable items={intel.releases} tags={intel.tags}/>}
        {tab==="activity" && <ActivityTable items={intel.activity}/>}
      </section>
    </>
  );
}

function Metric({icon:Icon,value,label,sub}) { return <div className="metric-card glass-panel"><Icon size={17}/><strong>{value ?? 0}</strong><span>{label}</span>{sub&&<small>{sub}</small>}</div>; }
function Overview({intel}) { const r=intel.repository; return <div className="overview-grid"><div><h3>Repository DNA</h3><div className="data-list"><p><span>Default branch</span><b>{r.defaultBranch}</b></p><p><span>License</span><b>{r.license || "—"}</b></p><p><span>Stars</span><b>{r.stars}</b></p><p><span>Forks</span><b>{r.forks}</b></p><p><span>Watchers</span><b>{r.watchers}</b></p><p><span>Topics</span><b>{r.topics?.join(", ") || "—"}</b></p></div></div><div><h3>Change intelligence</h3><div className="timeline-mini">{intel.activity.slice(0,8).map((a,i)=><div className="timeline-item" key={i}><span className="timeline-dot"/><div><b>{a.actor}</b> {a.title}<small>{new Date(a.date).toLocaleString()} · {a.meta||""}</small></div></div>)}</div></div></div>; }
function PRTable({items=[]}) { return <DataTable headers={["PR","Author","Status","Reviews","Changes","Updated"]} rows={items.map(p=>[<a href={p.htmlUrl} target="_blank" rel="noreferrer">#{p.number} {p.title}</a>,p.author?.login||"—",p.merged?"Merged":p.state,`${p.approvals}/${p.reviewCount}`,`+${p.changes.additions} / -${p.changes.deletions} · ${p.changes.changedFiles} files`,p.updatedAt?new Date(p.updatedAt).toLocaleDateString():"—"])} empty="No pull requests found."/>; }
function IssueTable({items=[]}) { return <DataTable headers={["Issue","Author","State","Assignees","Labels","Updated"]} rows={items.map(i=>[<a href={i.url} target="_blank" rel="noreferrer">#{i.number} {i.title}</a>,i.author||"—",i.state,i.assignees?.join(", ")||"Unassigned",i.labels?.join(", ")||"—",i.updatedAt?new Date(i.updatedAt).toLocaleDateString():"—"])} empty="No issues found."/>; }
function CommitTable({items=[]}) { return <DataTable headers={["Commit","Author","Message","Date"]} rows={items.map(c=>[c.sha?.slice(0,7),c.author||"—",<a href={c.url} target="_blank" rel="noreferrer">{c.message}</a>,c.date?new Date(c.date).toLocaleString():"—"])} empty="No commits found."/>; }
function People({intel}) { return <div className="people-grid"><div><h3>Contributors</h3>{intel.contributors.map(c=><div className="person-row" key={c.login}><img src={c.avatar} alt=""/><span><b>{c.login}</b><small>{c.contributions} contributions</small></span></div>)}</div><div><h3>Collaborators & permissions</h3>{intel.collaborators.map(c=><div className="person-row" key={c.login}><img src={c.avatar} alt=""/><span><b>{c.login}</b><small>{c.roleName || Object.entries(c.permissions||{}).filter(([,v])=>v).map(([k])=>k).join(", ") || "member"}</small></span></div>)}</div></div>; }
function CITable({items=[]}) { return <DataTable headers={["Workflow","Status","Conclusion","Branch","Actor","Updated"]} rows={items.map(w=>[w.name,w.status,w.conclusion||"running",w.branch,w.actor||"GitHub",new Date(w.updatedAt).toLocaleString()])} empty="No GitHub Actions runs found."/>; }
function ReleaseTable({items=[],tags=[]}) { return <div><h3>Releases</h3><DataTable headers={["Release","Tag","Author","Published"]} rows={items.map(r=>[<a href={r.url} target="_blank" rel="noreferrer">{r.name}</a>,r.tag,r.author||"—",r.publishedAt?new Date(r.publishedAt).toLocaleDateString():"—"])} empty="No releases found."/><h3 className="subhead">Tags</h3><div className="tag-cloud">{tags.map(t=><span key={t.name}><Tag size={12}/>{t.name}</span>)}</div></div>; }
function ActivityTable({items=[]}) { return <div className="timeline-full">{items.map((a,i)=><div className="timeline-item" key={`${a.type}-${i}`}><span className="timeline-dot"/><div><b>{a.actor}</b> · {a.title}<small>{a.date?new Date(a.date).toLocaleString():"—"} · {a.meta||""}</small></div>{a.url&&<a href={a.url} target="_blank" rel="noreferrer"><ExternalLink size={13}/></a>}</div>)}</div>; }
function DataTable({headers,rows,empty}) { return rows.length ? <div className="table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div> : <div className="empty">{empty}</div>; }
