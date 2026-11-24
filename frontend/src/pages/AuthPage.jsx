import { useEffect, useState } from "react";
import {
  ArrowRight, Mail, LockKeyhole, Users, ShieldCheck, Chrome, Github, RefreshCw, Eye, EyeOff
} from "lucide-react";
import { api, setSession, API_URL } from "../services/api";
import Logo from "../components/Logo";

export default function AuthPage({ onLogin, dark = true, setDark }) {
  const theme = document.documentElement.dataset.theme || (dark?"dark":"light");
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).get("signup") === "1" ? "signup" : "login");
  const [signupMode, setSignupMode] = useState("create");
  const [otp, setOtp] = useState(false);
  const [email, setEmail] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", teamId: "" });
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) setError(authError);
  }, []);

  const update = (e) => setForm((v) => ({ ...v, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError(""); setNotice("");

    try {
      if (mode === "login") {
        const r = await api.post("/auth/login", form);
        setSession(r.data);
        onLogin(r.data.user);
      } else {
        const r = await api.post("/auth/signup", { ...form, mode: signupMode });
        setEmail(r.data.email);
        setOtp(true);
      }
    } catch (err) {
      const response = err.response?.data;
      if (response?.needsVerification && response?.email) {
        setEmail(response.email);
        setOtp(true);
        setNotice("Your account needs verification. Request a new code below.");
      }
      setError(response?.message || "Unable to complete authentication. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    if (!email || resending) return;
    setResending(true); setError(""); setNotice("");
    try {
      const response = await api.post("/auth/resend-otp", { email });
      setNotice(response.data.message || "A new verification code has been sent.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not resend code. Check email configuration.");
    } finally { setResending(false); }
  }

  async function verify(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const r = await api.post("/auth/verify-otp", { email, otp: code });
      setSession(r.data);
      onLogin(r.data.user);
    } catch (err) {
      setError(err.response?.data?.message || "Invalid code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`auth-shell ${theme}`}>
      <div className="auth-glow one" />
      <div className="auth-glow two" />
      <div className="auth-theme-switch">
        <select className="theme-picker" aria-label="Theme" value={theme} onChange={e=>setDark?.(e.target.value)}><option value="dark">Dark</option><option value="light">Light</option><option value="cloud">Cloud</option></select>
      </div>

      <div className="auth-card">
        <div className="auth-brand">
          <Logo />
        </div>

        {otp ? (
          <>
            <div className="auth-icon"><ShieldCheck /></div>
            <div className="auth-heading">
              <span className="eyebrow">EMAIL VERIFICATION</span>
              <h1>Verify your email</h1>
              <p className="muted">We sent a 6-digit code to <strong>{email}</strong>.</p>
            </div>

            {error && <div className="error-box" role="alert">{error}</div>}
            {notice && <div className="auth-notice" role="status">{notice}</div>}

            <form onSubmit={verify}>
              <label>
                Verification code
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                  minLength={6}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder="000000"
                  required
                />
              </label>
              <button className="primary full" disabled={loading}>
                {loading ? "Verifying…" : "Verify & continue"} <ArrowRight size={17} />
              </button>
            </form>

            <div className="auth-verify-actions">
              <button type="button" className="link-btn" onClick={resendOtp} disabled={resending}><RefreshCw size={14}/> {resending ? "Resending…" : "Resend code"}</button>
              <button type="button" className="link-btn auth-back" onClick={() => {setOtp(false);setError("");setNotice("");setCode("");}}>Use a different email</button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-heading">
              <span className="eyebrow">PRIVATE TEAM WORKSPACE</span>
              <h1>{mode === "login" ? "Welcome back" : "Build together, intelligently."}</h1>
              <p className="muted">
                {mode === "login"
                  ? "Sign in to your team command center."
                  : "Create a workspace or join your team."}
              </p>
            </div>

            {error && <div className="error-box" role="alert">{error}</div>}
            {notice && <div className="auth-notice" role="status">{notice}</div>}

            <form onSubmit={submit}>
              {mode === "signup" && (
                <>
                  <label>
                    Full name
                    <input autoComplete="name" name="name" value={form.name} onChange={update} placeholder="Your name" required />
                  </label>

                  <div className="auth-segment-label">Choose your workspace</div>
                  <div className="segmented" role="group" aria-label="Team signup mode">
                    <button type="button" className={signupMode === "create" ? "active" : ""} onClick={() => setSignupMode("create")}>Create team</button>
                    <button type="button" className={signupMode === "join" ? "active" : ""} onClick={() => setSignupMode("join")}>Join team</button>
                  </div>
                </>
              )}

              <label>
                <Mail size={15} />
                Email
                <input autoComplete="email" name="email" type="email" value={form.email} onChange={update} placeholder="you@company.com" required />
              </label>

              {(mode === "login" || signupMode === "join") && (
                <label>
                  <Users size={15} />
                  Team ID
                  <input name="teamId" value={form.teamId} onChange={update} placeholder="TEAM-XXXXXXXX" required />
                </label>
              )}

              <label>
                <LockKeyhole size={15} />
                Password
                <span className="auth-password-row"><input name="password" type={showPassword ? "text" : "password"} value={form.password} onChange={update} placeholder="Minimum 8 characters" minLength={8} required autoComplete={mode === "login" ? "current-password" : "new-password"}/><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span>
              </label>

              <button className="primary full" disabled={loading}>
                {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
                <ArrowRight size={17} />
              </button>
            </form>

            <div className="or"><span />or<span /></div>

            <div className="oauth-grid">
              <a className="oauth-btn" href={`${API_URL}/auth/github`}>
                <Github size={17} /> Continue with GitHub
              </a>
              <a className="oauth-btn" href={`${API_URL}/auth/google`}>
                <Chrome size={17} /> Continue with Google
              </a>
            </div>

            <p className="switch">
              {mode === "login" ? "New here?" : "Already have an account?"}{" "}
              <button
                className="link-btn"
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError("");
                  setOtp(false); setNotice("");
                }}
              >
                {mode === "login" ? "Create account" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
