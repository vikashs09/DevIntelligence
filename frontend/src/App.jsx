import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
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
import Profile from "./pages/Profile";
import { api, clearSession, getSession, setSession } from "./services/api";
import "./styles.css";

export default function App() {
  const [splash, setSplash] = useState(true);
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [dark, setDark] = useState(() => localStorage.getItem("devintel_theme") !== "light");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
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

  useEffect(() => {
    if (!user) return;

    const theme = user.preferences?.theme;
    if (theme === "light") {
      setDark(false);
      localStorage.setItem("devintel_theme", "light");
    } else if (theme === "dark") {
      setDark(true);
      localStorage.setItem("devintel_theme", "dark");
    } else {
      const savedTheme = localStorage.getItem("devintel_theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        setDark(savedTheme === "dark");
      } else {
        setDark(window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true);
      }
    }
  }, [user]);

  useEffect(() => {
    if (!user || !getToken()) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5000", {
      auth: { token: getToken() },
      transports: ["websocket", "polling"],
    });
    socket.on("notification:new", () => {
      setUser((current) => current ? { ...current, unreadNotifications: (current.unreadNotifications || 0) + 1 } : current);
    });
    return () => socket.disconnect();
  }, [user?.id]);

  function handleThemeChange(nextDark) {
    setDark(nextDark);
    localStorage.setItem("devintel_theme", nextDark ? "dark" : "light");
  }

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
  if (page === "projects") content = <Projects {...props} />;
  if (page === "tasks") content = <Tasks {...props} />;
  if (page === "team") content = <Team {...props} />;
  if (page === "chat") content = <Chat {...props} />;
  if (page === "ai") content = <AI {...props} />;
  if (page === "github") content = <GitHub {...props} />;
  if (page === "analytics") content = <Analytics {...props} />;
  if (page === "risks") content = <Risks {...props} />;
  if (page === "notifications") content = <Notifications {...props} />;
  if (page === "settings") content = <Settings {...props} onUser={updateUser} />;
  if (page === "profile") content = <Profile {...props} onUser={updateUser} />;

  return (
    <div className={`app ${dark ? "dark" : "light"}`}>
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
          user={user}
          dark={dark}
          setDark={handleThemeChange}
          onQuick={() => setPage("tasks")}
          onMenu={() => setSidebarOpen(true)}
          onProfile={() => setPage("profile")}
          onNotifications={() => setPage("notifications")}
        />
        {content}
      </main>
    </div>
  );
}
