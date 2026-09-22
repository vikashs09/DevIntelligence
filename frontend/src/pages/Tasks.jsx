import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Filter, Plus, Trash2, CalendarDays, UserRound, AlertTriangle } from "lucide-react";
import { api } from "../services/api";

const statuses = ["todo", "in_progress", "review", "done"];
const priorities = ["low", "medium", "high", "critical"];

export default function Tasks({ user }) {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [priority, setPriority] = useState("all");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", status: "todo", assignee: "", project: "", dueDate: "" });
  const [error, setError] = useState("");

  async function load() {
    try {
      const [t, m, p] = await Promise.all([api.get("/tasks"), api.get("/team/members"), api.get("/projects")]);
      setTasks(t.data.tasks || []);
      setMembers(m.data.members || []);
      setProjects(p.data.projects || []);
    } catch (e) {
      setError(e.response?.data?.message || "Unable to load tracker data.");
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => tasks.filter((t) => {
    const q = query.toLowerCase();
    return (filter === "all" || t.status === filter) &&
      (priority === "all" || t.priority === priority) &&
      (!q || `${t.title} ${t.taskKey} ${t.description || ""}`.toLowerCase().includes(q));
  }), [tasks, filter, priority, query]);

  const stats = {
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done").length,
    active: tasks.filter((t) => t.status !== "done").length,
    overdue: tasks.filter((t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < new Date()).length,
  };

  async function add(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      await api.post("/tasks", form);
      setForm({ title: "", description: "", priority: "medium", status: "todo", assignee: "", project: "", dueDate: "" });
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Unable to create task.");
    }
  }

  async function update(id, data) {
    try { await api.patch(`/tasks/${id}`, data); await load(); }
    catch (e) { setError(e.response?.data?.message || "Unable to update task."); }
  }

  async function remove(id) {
    if (!window.confirm("Delete this task?")) return;
    try { await api.delete(`/tasks/${id}`); await load(); }
    catch (e) { setError(e.response?.data?.message || "Unable to delete task."); }
  }

  return (
    <div className="page">
      <div className="page-title">
        <div><span className="eyebrow">DELIVERY CONTROL</span><h1>Task Tracker</h1><p>Assign, prioritize, track and close work with real ownership and deadlines.</p></div>
        <button className="primary small" onClick={() => setShowForm(!showForm)}><Plus size={16} /> New task</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="tracker-stats">
        <Metric label="Total" value={stats.total} />
        <Metric label="Active" value={stats.active} />
        <Metric label="Completed" value={stats.done} />
        <Metric label="Overdue" value={stats.overdue} danger={stats.overdue > 0} />
      </div>

      {showForm && (
        <form className="panel task-form" onSubmit={add}>
          <div className="form-grid">
            <label>Task title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Fix authentication flow" required /></label>
            <label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What needs to be done?" /></label>
            <label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{priorities.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statuses.map((s) => <option key={s}>{s.replace("_", " ")}</option>)}</select></label>
            <label>Assignee<select value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}><option value="">Unassigned</option>{members.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}</select></label>
            <label>Project<select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })}><option value="">No project</option>{projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
            <label>Due date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
          </div>
          <div className="form-actions"><button type="button" className="ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="primary">Create task</button></div>
        </form>
      )}

      <div className="tracker-toolbar">
        <div className="search-inline"><Filter size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks…" /></div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All statuses</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="all">All priorities</option>{priorities.map((p) => <option key={p}>{p}</option>)}</select>
      </div>

      <section className="panel">
        <div className="list-head"><b>{filtered.length} visible tasks</b><span>Live MongoDB tracker</span></div>
        {filtered.map((t) => {
          const overdue = t.status !== "done" && t.dueDate && new Date(t.dueDate) < new Date();
          return (
            <div className={`task-row detailed ${overdue ? "overdue" : ""}`} key={t._id}>
              <button className="check" onClick={() => update(t._id, { status: t.status === "done" ? "todo" : "done" })}>
                {t.status === "done" ? <CheckCircle2 /> : <Circle />}
              </button>
              <div className={t.status === "done" ? "done task-main" : "task-main"}>
                <div className="task-title-line"><b>{t.taskKey} · {t.title}</b><span className={`priority ${t.priority}`}>{t.priority}</span></div>
                <small>{t.description || "No description"} {t.project?.name ? ` · ${t.project.name}` : ""}</small>
                <div className="task-meta">
                  {t.assignee && <span><UserRound size={12} /> {t.assignee.name}</span>}
                  {t.dueDate && <span className={overdue ? "danger-text" : ""}><CalendarDays size={12} /> {new Date(t.dueDate).toLocaleDateString()}</span>}
                  {overdue && <span className="danger-text"><AlertTriangle size={12} /> Overdue</span>}
                </div>
              </div>
              <select className="status-select" value={t.status} onChange={(e) => update(t._id, { status: e.target.value })}>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
              <button className="icon-btn danger" onClick={() => remove(t._id)}><Trash2 size={16} /></button>
            </div>
          );
        })}
        {!filtered.length && <div className="empty">No tasks match these filters.</div>}
      </section>
    </div>
  );
}

function Metric({ label, value, danger }) {
  return <div className={`metric mini-metric ${danger ? "metric-danger" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}
