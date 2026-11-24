import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, ExternalLink, FolderKanban, GitBranch, Github, Link2, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, Unlink2, X } from "lucide-react";
import { api } from "../services/api";

const STATUSES = ["planning", "active", "on_hold", "completed"];
const canManage = (user) => ["leader", "manager", "team_leader"].includes(user?.role);
const cleanMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;
const friendlyStatus = (status) => ({ on_hold: "On hold", planning: "Planning", active: "Active", completed: "Completed" }[status] || status);

export default function Projects({ user, onNavigate }) {
  const [projects, setProjects] = useState([]);
  const [linked, setLinked] = useState([]);
  const [available, setAvailable] = useState([]);
  const [githubConnected, setGithubConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", status: "planning" });
  const [repository, setRepository] = useState("");
  const [manualRepo, setManualRepo] = useState("");
  const [connectProjectId, setConnectProjectId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/projects");
      setProjects(response.data.projects || []);
      const [connections, account, accessible] = await Promise.allSettled([
        api.get("/github/linked"), api.get("/github/status"), api.get("/github/repositories")
      ]);
      if (connections.status === "fulfilled") setLinked(connections.value.data.repositories || []);
      if (account.status === "fulfilled") setGithubConnected(Boolean(account.value.data.connected));
      if (accessible.status === "fulfilled") setAvailable(accessible.value.data.repositories || []);
    } catch (e) { setError(cleanMessage(e, "Projects could not be loaded.")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => projects.filter(p => {
    const matches = `${p.name} ${p.description || ""} ${p.githubOwner || ""} ${p.githubRepo || ""}`.toLowerCase().includes(search.toLowerCase());
    return matches && (statusFilter === "all" || p.status === statusFilter);
  }), [projects, search, statusFilter]);
  const repoOptions = useMemo(() => Array.from(new Set([
    ...available.map(r => r.full_name || r.fullName), ...linked.map(r => r.fullName || r.full_name)
  ].filter(Boolean))).sort(), [available, linked]);
  const linkedFor = p => linked.filter(r => String(r.project?._id || r.project || "") === String(p._id));

  function openCreate() { setForm({ name: "", description: "", status: "planning" }); setDialog({ type: "create" }); setError(""); }
  function openEdit(project) { setForm({ name: project.name, description: project.description || "", status: project.status || "planning" }); setDialog({ type: "edit", project }); setError(""); }
  function openConnect(project) {
    setConnectProjectId(project._id);
    const currentRepo = project.githubOwner && project.githubRepo ? `${project.githubOwner}/${project.githubRepo}` : "";
    if (currentRepo && !repoOptions.includes(currentRepo)) { setRepository("__manual"); setManualRepo(currentRepo); }
    else { setRepository(currentRepo); setManualRepo(""); }
    setDialog({ type: "connect", project }); setError("");
  }
  async function saveProject(e) {
    e.preventDefault(); if (!form.name.trim()) return;
    setWorking(true); setError("");
    try {
      if (dialog.type === "create") await api.post("/projects", form);
      else await api.patch(`/projects/${dialog.project._id}`, form);
      setNotice(dialog.type === "create" ? "Project created successfully." : "Project details saved.");
      setDialog(null); await load();
    } catch (err) { setError(cleanMessage(err, "Project could not be saved.")); }
    finally { setWorking(false); }
  }
  async function deleteProject(project) {
    if (!window.confirm(`Delete “${project.name}”? Tasks will become unassigned; repository links will be detached.`)) return;
    setWorking(true); setError("");
    try { await api.delete(`/projects/${project._id}`); setNotice("Project deleted."); await load(); }
    catch (err) { setError(cleanMessage(err, "Could not delete project.")); }
    finally { setWorking(false); }
  }
  async function connectRepo(e) {
    e.preventDefault();
    const selected = (repository === "__manual" ? manualRepo : repository).trim();
    const parts = selected.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) { setError("Choose a repository or enter owner/repository."); return; }
    setWorking(true); setError("");
    try {
      await api.post("/github/sync", { owner: parts[0], name: parts[1], projectId: connectProjectId });
      setNotice(`Connected ${selected} to the project.`); setDialog(null); await load();
    } catch (err) { setError(cleanMessage(err, "Could not connect repository. Check GitHub authorization and installation access.")); }
    finally { setWorking(false); }
  }
  async function detachRepository(project) {
    if (!window.confirm(`Remove the repository association from “${project.name}”? This does not remove it from GitHub.`)) return;
    setWorking(true); setError("");
    try {
      await api.patch(`/projects/${project._id}`, { githubOwner: "", githubRepo: "" });
      setNotice("Repository association removed."); await load();
    } catch (err) { setError(cleanMessage(err, "Could not unlink repository.")); }
    finally { setWorking(false); }
  }

  return <div className="page projects-workspace">
    <header className="page-title projects-page-heading">
      <div><span className="eyebrow">YOUR ENGINEERING WORKSPACES</span><h1>Projects</h1><p>Keep plans, tasks and repository intelligence organized in one place.</p></div>
      {canManage(user) && <button className="primary small" onClick={openCreate}><Plus size={17} /> New project</button>}
    </header>
    {error && !dialog && <div className="error-box" role="alert">{error} <button className="ghost small" onClick={() => setError("")}>Dismiss</button></div>}
    {notice && <div className="project-notice" role="status"><Check size={16}/>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={15}/></button></div>}
    <div className="projects-overview-grid">
      <div className="projects-stat"><span>Projects</span><strong>{projects.length}</strong><small>Total workspaces</small></div>
      <div className="projects-stat"><span>In progress</span><strong>{projects.filter(p => p.status === "active").length}</strong><small>Active engineering work</small></div>
      <div className="projects-stat"><span>Linked repositories</span><strong>{projects.filter(p => p.githubOwner && p.githubRepo).length}</strong><small>Project ↔ GitHub connections</small></div>
    </div>
    <section className="projects-section">
      <div className="projects-section-head"><div><h2>All projects</h2><p>Manage each project's status and GitHub source.</p></div><div className="projects-toolbar"><label className="projects-search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects" aria-label="Search projects" /></label><label className="projects-filter"><span className="sr-only">Filter project status</span><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option>{STATUSES.map(s=><option key={s} value={s}>{friendlyStatus(s)}</option>)}</select><ChevronDown size={14}/></label><button title="Refresh projects" className="projects-refresh" onClick={load}><RefreshCw size={16}/></button></div></div>
      {loading ? <div className="projects-empty"><LoaderCircle className="spin" size={24}/><p>Loading your projects…</p></div> : !filtered.length ? <div className="projects-empty"><FolderKanban size={32}/><h3>{projects.length ? "No matching projects" : "Start with your first project"}</h3><p>{projects.length ? "Try another name or status." : "Create a project, then connect a repository to monitor its activity."}</p>{!projects.length && canManage(user) && <button className="primary small" onClick={openCreate}><Plus size={16}/> Create project</button>}</div> :
        <div className="projects-cards-grid">{filtered.map(p => <article className="project-work-card" key={p._id}>
          <div className="project-work-top"><div className="project-work-icon"><FolderKanban size={21}/></div><span className={`project-status project-status-${p.status || 'planning'}`}>{friendlyStatus(p.status)}</span></div>
          <h3 title={p.name}>{p.name}</h3><p className="project-work-description">{p.description || "No description added yet. Add context to help your team."}</p>
          <div className="project-repo-panel"><div className="project-repo-title"><Github size={16}/><span>GitHub repository</span></div>
            {p.githubOwner && p.githubRepo ? <div className="project-connected-repo"><a href={`https://github.com/${encodeURIComponent(p.githubOwner)}/${encodeURIComponent(p.githubRepo)}`} rel="noopener noreferrer" target="_blank">{p.githubOwner}/{p.githubRepo} <ExternalLink size={13}/></a><small><Check size={13}/> Connected{linkedFor(p).length ? " · Synced" : ""}</small></div> : <p className="project-no-repo">No repository connected</p>}
          </div>
          <div className="project-work-actions">{canManage(user) ? <><button className="project-action-primary" onClick={() => openConnect(p)}><Link2 size={15}/>{p.githubRepo ? "Change repo" : "Connect repo"}</button><button className="project-action-icon" title="Edit project" aria-label={`Edit ${p.name}`} onClick={() => openEdit(p)}><Pencil size={15}/></button>{p.githubRepo && <button className="project-action-icon" title="Unlink repository" onClick={() => detachRepository(p)}><Unlink2 size={15}/></button>}{["leader", "manager"].includes(user?.role) && <button className="project-action-icon danger" title="Delete project" onClick={() => deleteProject(p)}><Trash2 size={15}/></button>}</> : <span className="project-readonly">View-only project</span>}</div>
        </article>)}</div>}
    </section>
    <section className="projects-github-help"><GitBranch size={20}/><div><strong>Repository intelligence</strong><p>Connect GitHub in the GitHub section first. Syncing a repository associates it with this project and updates its engineering signals.</p></div>{onNavigate && <button onClick={() => onNavigate("github")}>Open GitHub <ArrowRight size={15}/></button>}</section>
    {dialog && <div className="project-dialog-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !working) setDialog(null); }}><section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title"><header><div><span className="eyebrow">PROJECT WORKSPACE</span><h2 id="project-dialog-title">{dialog.type === "create" ? "Create project" : dialog.type === "edit" ? "Edit project" : "Connect GitHub repository"}</h2></div><button className="project-action-icon" disabled={working} onClick={() => setDialog(null)} aria-label="Close dialog"><X size={18}/></button></header>
      {error && <div className="error-box" role="alert">{error}</div>}
      {dialog.type === "connect" ? <form onSubmit={connectRepo} className="project-dialog-form"><p>Choose a repository that your connected GitHub account or App can access. We will sync it and associate it with <strong>{dialog.project.name}</strong>.</p><label>Repository<select value={repository} onChange={e => setRepository(e.target.value)} required><option value="">Select repository…</option>{repoOptions.map(r => <option key={r} value={r}>{r}</option>)}<option value="__manual">Enter owner/repository manually</option></select></label>{repository === "__manual" && <label>Owner / Repository<input value={manualRepo} onChange={e => setManualRepo(e.target.value)} placeholder="organization/repository" required autoFocus /></label>}{!githubConnected && <div className="project-dialog-tip">GitHub account not connected. Open GitHub and complete authorization first.</div>}<footer><button type="button" className="ghost" onClick={() => setDialog(null)}>Cancel</button><button className="primary" disabled={working || !repository || (repository === "__manual" && !manualRepo.trim())}>{working ? "Connecting…" : "Connect & sync"}<GitBranch size={16}/></button></footer></form> : <form onSubmit={saveProject} className="project-dialog-form"><label>Project name<input value={form.name} onChange={e => setForm(v => ({...v,name:e.target.value}))} required maxLength={120} autoFocus placeholder="e.g. Dev-Intelligence"/></label><label>Description<textarea value={form.description} onChange={e => setForm(v => ({...v,description:e.target.value}))} rows={3} maxLength={5000} placeholder="What is this project about?"/></label><label>Status<select value={form.status} onChange={e => setForm(v => ({...v,status:e.target.value}))}>{STATUSES.map(s=><option key={s} value={s}>{friendlyStatus(s)}</option>)}</select></label><footer><button type="button" className="ghost" onClick={() => setDialog(null)}>Cancel</button><button className="primary" disabled={working || !form.name.trim()}>{working ? "Saving…" : dialog.type === "create" ? "Create project" : "Save changes"}<Check size={16}/></button></footer></form>}
    </section></div>}
  </div>;
}
