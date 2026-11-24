import React, { useEffect, useState } from "react";
import { Search, X, ArrowUpRight, Command } from "lucide-react";
import { getToken } from "./services/api";
import SplashScreen from "./components/SplashScreen";
import AuthPage from "./pages/AuthPage";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Team from "./pages/Team";
import Chat from "./pages/Chat";
import AI from "./pages/AI";
import GitHub from "./pages/GitHub";
import Analytics from "./pages/Analytics";
import Projects from "./pages/Projects";
import Risks from "./pages/Risks";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Notes from "./pages/Notes";import Reports from "./pages/Reports";import GraphExplorer from "./pages/GraphExplorer";
import Profile from "./pages/Profile";
import FileHealth from "./pages/FileHealth";
import { api, clearSession, getSession, setSession } from "./services/api";
import "./styles.css";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  const [splash, setSplash] = useState(true);
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [theme, setTheme] = useState(() => ["dark","light","cloud"].includes(localStorage.getItem("devintel_theme")) ? localStorage.getItem("devintel_theme") : "dark");
  const dark = theme === "dark";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandResults, setCommandResults] = useState([]);
  const [commandIndex, setCommandIndex] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const githubAppInstalled = params.get("github_app_installed");
    const githubAppError = params.get("github_app_error");
    if (githubAppInstalled || githubAppError) {
      setPage("github");
      if (githubAppError) console.error("GitHub App setup error:", githubAppError);
      window.history.replaceState({}, "", window.location.pathname);
    }
    const oauth = params.get("auth_token");

    if (oauth) {
      setSession({ token: oauth });
      api.get("/auth/me")
        .then((r) => {
          setSession({ token: oauth, user: r.data.user });
          setUser(r.data.user);
          api.get("/notifications").then((n) => setUser((current) => current ? { ...current, unreadNotifications: n.data.unread || 0 } : current)).catch(() => {});
          window.history.replaceState({}, "", window.location.pathname);
        })
        .catch(() => clearSession());
      return;
    }

    const saved = getSession();
    if (saved.user && saved.token) {
      setUser(saved.user);
      api.get("/auth/me")
        .then((r) => {
          setUser(r.data.user);
          localStorage.setItem("devintel_user", JSON.stringify(r.data.user));
          api.get("/notifications").then((n) => setUser((current) => current ? { ...current, unreadNotifications: n.data.unread || 0 } : current)).catch(() => {});
        })
        .catch(() => {
          clearSession();
          setUser(null);
        });
    }
  }, []);

  useEffect(() => { document.documentElement.dataset.theme=theme;localStorage.setItem("devintel_theme",theme); },[theme]);
  useEffect(() => {const preferred=user?.preferences?.theme;if(["dark","light","cloud"].includes(preferred))setTheme(preferred);},[user?.preferences?.theme]);

  // Global command palette: functional keyboard shortcut and scoped API search.
  useEffect(() => {
    function keydown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCommandOpen(x => !x); }
      if (e.key === "Escape") setCommandOpen(false);
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => {
    if (!commandOpen) return;
    const destinations = ["dashboard", "projects", "tasks", "team", "chat", "ai", "notes", "reports", "graph", "file-health", "github", "analytics", "risks", "notifications", "settings"];
    const q = commandQuery.trim().toLowerCase();
    const shortcuts = destinations.filter(x => !q || x.includes(q)).map(x => ({type:"page", title:x.replaceAll("-", " ").replace(/\b\w/g,c => c.toUpperCase()), subtitle:"Open page", target:x}));
    if (q.length < 2) {setCommandResults(shortcuts);setCommandIndex(0);return;}
    let cancelled=false;
    const timer=setTimeout(async()=>{
      try {const response=await api.get("/search",{params:{q}});if(!cancelled){setCommandResults([...shortcuts,...(response.data.results||[])]);setCommandIndex(0)}}
      catch {if(!cancelled)setCommandResults(shortcuts)}
    },220);
    return ()=>{cancelled=true;clearTimeout(timer)};
  },[commandOpen,commandQuery]);

  function handleThemeChange(next) {const value=typeof next==="boolean"?(next?"dark":"light"):next;if(!["dark","light","cloud"].includes(value))return;setTheme(value);if(user)api.patch("/auth/preferences",{theme:value}).then(r=>{setUser(r.data.user);localStorage.setItem("devintel_user",JSON.stringify(r.data.user))}).catch(console.error);}

  function login(nextUser) {
    setUser(nextUser);
    setPage("dashboard");
    setSidebarOpen(false);
    api.get("/notifications")
      .then((r) => setUser((current) => current ? { ...current, unreadNotifications: r.data.unread || 0 } : current))
      .catch(() => {});
  }

  function updateUser(nextUser) {
    setUser(nextUser);
    localStorage.setItem("devintel_user", JSON.stringify(nextUser));
  }

  function logout() {
    clearSession();
    setUser(null);
    setPage("dashboard");
  }

  if (splash) return <SplashScreen onDone={() => setSplash(false)} dark={dark} />;
  if (!user) return <AuthPage onLogin={login} dark={dark} setDark={handleThemeChange} />;

  const props = { user };

  let content = <Dashboard />;
  if (page === "notes") content = <Notes {...props} />;
  if (page === "reports") content = <Reports {...props} />;
  if (page === "graph") content = <GraphExplorer {...props} onNavigate={setPage} />;
  if (page === "file-health") content = <FileHealth {...props} />;
  if (page === "projects") content = <Projects {...props} onNavigate={setPage} />;
  if (page === "tasks") content = <Tasks {...props} />;
  if (page === "team") content = <Team {...props} />;
  if (page === "chat") content = <Chat {...props} />;
  if (page === "ai") content = <AI {...props} />;
  if (page === "github") content = <GitHub {...props} />;
  if (page === "analytics") content = <Analytics {...props} />;
  if (page === "risks") content = <Risks {...props} />;
  if (page === "notifications") content = <Notifications {...props} />;
  if (page === "settings") content = <Settings {...props} onUser={updateUser} theme={theme} onTheme={handleThemeChange} />;
  if (page === "profile") content = <Profile {...props} onUser={updateUser} />;

  return (
    <div className={`app ${theme}`}>
      <Sidebar
        page={page}
        setPage={setPage}
        user={user}
        onLogout={logout}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="main">
        <Header
          theme={theme}
          user={user}
          dark={dark}
          setDark={handleThemeChange}
          onQuick={() => setPage("tasks")}
          onSearch={() => setCommandOpen(true)}
          onMenu={() => setSidebarOpen(true)}
          onProfile={() => setPage("profile")}
          onNotifications={() => setPage("notifications")}
        />

        <ErrorBoundary key={page} onReset={() => setPage("dashboard")}>{content}</ErrorBoundary>
        {commandOpen && (
          <div className="command-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setCommandOpen(false); }}>
            <section className="command-dialog" role="dialog" aria-modal="true" aria-label="Global search and command palette">
              <div className="command-input-row">
                <Search size={19} />
                <input autoFocus value={commandQuery} onChange={(e) => setCommandQuery(e.target.value)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setCommandIndex(i=>Math.min(commandResults.length-1,i+1))}if(e.key==='ArrowUp'){e.preventDefault();setCommandIndex(i=>Math.max(0,i-1))}if(e.key==='Enter'&&commandResults[commandIndex]){setPage(commandResults[commandIndex].target||'dashboard');setCommandOpen(false)}}} placeholder="Search tasks, projects, repositories, people, messages..." />
                <button onClick={() => setCommandOpen(false)} aria-label="Close search"><X size={18} /></button>
              </div>
              <div className="command-hint"><Command size={13} /> Search your workspace or choose a destination <span>ESC to close</span></div>
              <div className="command-results">
                {commandResults.length ? commandResults.map((item, index) => (
                  <button key={`${item.type}-${item.id || item.target}-${index}`} className={`command-result ${index === commandIndex ? "active" : ""}`}
                    onMouseEnter={() => setCommandIndex(index)} onClick={() => { setPage(item.target || "dashboard"); setCommandOpen(false); }}>
                    <span className="command-result-type">{item.type || "command"}</span>
                    <span className="command-result-copy"><strong>{item.title}</strong><small>{item.subtitle || item.target}</small></span>
                    <ArrowUpRight size={15} />
                  </button>
                )) : <div className="command-empty">No matching workspace results.</div>}
              </div>
              <footer><span>↑ ↓ Navigate</span><span>↵ Open</span><span>⌘/Ctrl + K Search</span></footer>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
