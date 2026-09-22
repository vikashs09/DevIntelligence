import { Search, Plus, Sun, Moon, Command, Menu, Bell } from "lucide-react";

export default function Header({ user, dark, setDark, onQuick, onMenu, onProfile, onNotifications }) {
  return (
    <header className="topbar">
      <button className="mobile-menu icon-btn" onClick={onMenu} aria-label="Open menu">
        <Menu size={20} />
      </button>

      <div className="search">
        <Search size={17} />
        <input placeholder="Search tasks, projects, people…" />
        <kbd><Command size={11} /> K</kbd>
      </div>

      <div className="top-actions">
        <button className="icon-btn" onClick={() => setDark(!dark)} title="Theme">
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button className="icon-btn notification-button" onClick={onNotifications} title="Notifications">
          <Bell size={18} />
          {user.unreadNotifications > 0 && <span />}
        </button>
        <button className="primary small desktop-new" onClick={onQuick}>
          <Plus size={16} /> New task
        </button>
        <button className="profile-trigger" onClick={onProfile} title="Open profile">
          {user.avatar ? <img src={user.avatar} alt="" /> : <span>{user.name?.[0]?.toUpperCase()}</span>}
        </button>
      </div>
    </header>
  );
}
