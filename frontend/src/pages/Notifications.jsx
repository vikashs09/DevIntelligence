import { useEffect, useState } from "react";
import { Bell, CheckCircle2, AtSign, ClipboardCheck, Github, CheckCheck } from "lucide-react";
import { api } from "../services/api";

const icons = {
  mention: AtSign,
  task_assigned: ClipboardCheck,
  task_updated: CheckCircle2,
  github: Github,
  system: Bell,
};

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");

  async function load() {
    try {
      const r = await api.get("/notifications");
      setItems(r.data.notifications || []);
      setUnread(r.data.unread || 0);
    } catch (e) {
      setError(e.response?.data?.message || "Unable to load notifications.");
    }
  }

  useEffect(() => { load(); }, []);

  async function read(id) {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems((v) => v.map((n) => n._id === id ? { ...n, read: true } : n));
      setUnread((v) => Math.max(0, v - 1));
    } catch {}
  }

  async function readAll() {
    await api.patch("/notifications/read-all");
    setItems((v) => v.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }

  return (
    <div className="page">
      <div className="page-title">
        <div><span className="eyebrow">SIGNAL FEED</span><h1>Notifications</h1><p>Mentions, assignments and important workspace events.</p></div>
        {unread > 0 && <button className="ghost" onClick={readAll}><CheckCheck size={15} /> Mark all read</button>}
      </div>
      {error && <div className="error-box">{error}</div>}
      <section className="panel notification-list">
        {items.map((n) => {
          const Icon = icons[n.type] || Bell;
          return (
            <button className={`notification-item ${n.read ? "read" : ""}`} key={n._id} onClick={() => !n.read && read(n._id)}>
              <div className="notification-icon"><Icon size={17} /></div>
              <div><b>{n.title}</b><small>{n.message}</small><time>{new Date(n.createdAt).toLocaleString()}</time></div>
              {!n.read && <i />}
            </button>
          );
        })}
        {!items.length && <div className="empty">No notifications yet. Mention a teammate or assign a task to create one.</div>}
      </section>
    </div>
  );
}
