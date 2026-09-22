import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, MessageSquare,
  BrainCircuit, Github, BarChart3, ShieldAlert, Bell, Settings, LogOut, X
} from "lucide-react";
import Logo from "./Logo";

const items = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["projects", "Projects", FolderKanban],
  ["tasks", "Task Tracker", CheckSquare],
  ["team", "Team", Users],
  ["chat", "Chat", MessageSquare],
  ["ai", "AI Assistant", BrainCircuit],
  ["github", "GitHub", Github],
  ["analytics", "Analytics", BarChart3],
  ["risks", "Health & Risks", ShieldAlert],
  ["notifications", "Notifications", Bell],
  ["settings", "Settings", Settings],
];

export default function Sidebar({ page, setPage, user, onLogout, open, onClose }) {
  return (
    <>
      {open && <button className="sidebar-overlay" onClick={onClose} aria-label="Close menu" />}
      <aside className={`sidebar ${open ? "mobile-open" : ""}`}>
        <div className="sidebar-head">
          <Logo />
          <button className="icon-btn mobile-close" onClick={onClose} aria-label="Close menu">
            <X size={19} />
          </button>
        </div>

        <div className="workspace">
          <span>WORKSPACE</span>
          <strong>{user.team?.name || "My Team"}</strong>
          <small>{user.team?.teamId || "—"}</small>
        </div>

        <nav>
          {items.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav ${page === id ? "active" : ""}`}
              onClick={() => { setPage(id); onClose?.(); }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "notifications" && user.unreadNotifications > 0 && (
                <i>{Math.min(user.unreadNotifications, 9)}</i>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="user-mini user-link" onClick={() => { setPage("profile"); onClose?.(); }}>
            <div className="avatar">{user.name?.[0]?.toUpperCase()}</div>
            <div>
              <b>{user.name}</b>
              <small>{String(user.role || "").replace("_", " ")}</small>
            </div>
          </button>
          <button className="nav" onClick={onLogout}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
