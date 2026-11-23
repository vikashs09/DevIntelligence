import { useEffect, useState } from "react";
import { Github, Mail, Shield, Users, Save, ExternalLink, UserCircle, GitCommit, GitPullRequest, CircleDot, Activity, Link2, MapPin, Building2 } from "lucide-react";
import { api } from "../services/api";

export default function Profile({ user, onUser }) {
  const [name, setName] = useState(user.name || "");
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [github, setGithub] = useState(null);
  const [stats, setStats] = useState(null);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const s = await api.get("/github/status");
      setGithub(s.data);
      if (s.data.connected) {
        const r = await api.get("/github/repositories");
        const repos = r.data.repositories || [];
        setStats({
          repos: repos.length,
          private: repos.filter(x => x.private).length,
          forks: repos.filter(x => x.fork).length,
          stars: repos.reduce((a,x)=>a+(x.stargazers_count||0),0),
        });
      }
    } catch { setGithub(null); }
  }

  useEffect(() => { load(); }, []);

  async function connectGitHub() {
    const r = await api.get("/auth/github/connect-url");
    window.location.href = r.data.url;
  }

  async function save(e) {
    e.preventDefault();
    try {
      const r = await api.patch("/auth/profile", { name, avatar });
      onUser(r.data.user);
      setMessage("Profile updated successfully.");
    } catch (err) {
      setMessage(err.response?.data?.message || "Unable to update profile.");
    }
  }

  const account = github?.account;

  return (
    <div className="page cinematic-page">
      <div className="profile-cinematic-hero glass-panel">
        <div className="profile-ring">
          {avatar || account?.avatar ? <img src={avatar || account.avatar} alt="" /> : <UserCircle size={60}/>}
        </div>
        <div className="profile-identity">
          <span className="eyebrow">DEVELOPER IDENTITY</span>
          <h1>{name || "Your Profile"}</h1>
          <p>{user.email}</p>
          <div className="profile-badges"><span>{String(user.role || "developer").replaceAll("_"," ")}</span><span>{user.verified ? "Verified" : "Verification pending"}</span>{user.team?.name && <span>{user.team.name}</span>}</div>
          {account && <div className="github-mini"><Github size={15}/><b>@{account.login}</b>{account.location&&<><MapPin size={12}/>{account.location}</>}{account.company&&<><Building2 size={12}/>{account.company}</>}</div>}
        </div>
        <div className="profile-actions">{github?.connected ? <a className="ghost-btn" href={account?.profileUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/> GitHub profile</a> : <button className="primary" onClick={connectGitHub}><Github size={16}/> Connect GitHub</button>}</div>
      </div>

      {message && <div className="success-box">{message}</div>}

      {github?.connected && stats && <div className="profile-stat-grid">
        <Stat icon={Github} value={stats.repos} label="Accessible repos"/>
        <Stat icon={Shield} value={stats.private} label="Private repos"/>
        <Stat icon={GitPullRequest} value={stats.forks} label="Forks"/>
        <Stat icon={Activity} value={stats.stars} label="Total stars"/>
      </div>}

      <div className="profile-grid">
        <section className="glass-panel">
          <div className="setting-head"><div className="setting-icon"><UserCircle size={18}/></div><div><b>Profile details</b><small>Your public identity inside Dev Intelligence.</small></div></div>
          <form className="profile-form" onSubmit={save}>
            <label>Display name<input value={name} onChange={e=>setName(e.target.value)} required maxLength={80}/></label>
            <label>Avatar URL<input value={avatar} onChange={e=>setAvatar(e.target.value)} placeholder="https://..."/></label>
            <button className="primary small"><Save size={15}/> Save profile</button>
          </form>
        </section>

        <section className="glass-panel">
          <div className="setting-head"><div className="setting-icon"><Shield size={18}/></div><div><b>Account & workspace</b><small>Identity, team and verification state.</small></div></div>
          <div className="data-list profile-data"><p><span>Email</span><b>{user.email}</b></p><p><span>Team</span><b>{user.team?.name || "Personal workspace"}</b></p><p><span>Team ID</span><b>{user.team?.teamId || "Personal"}</b></p><p><span>Role</span><b>{user.role}</b></p></div>
        </section>

        <section className="glass-panel github-profile-card">
          <div className="setting-head"><div className="setting-icon"><Github size={18}/></div><div><b>GitHub connection</b><small>Used for live repository intelligence.</small></div></div>
          {github?.connected ? <div className="connected-account">{account?.avatar&&<img src={account.avatar} alt=""/>}<div><strong>{account.name || account.login}</strong><small>@{account.login}</small></div><span className="connection ok">Connected</span></div> : <div className="connect-empty"><p className="muted">Your account can use Google/email login and connect GitHub separately.</p><button className="ghost-btn" onClick={connectGitHub}><Link2 size={14}/> Connect GitHub</button></div>}
        </section>
      </div>
    </div>
  );
}

function Stat({icon:Icon,value,label}) { return <div className="metric-card glass-panel"><Icon size={16}/><strong>{value}</strong><span>{label}</span></div>; }
