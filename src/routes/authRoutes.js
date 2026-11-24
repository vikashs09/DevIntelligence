import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Team from "../models/Team.js";
import { makeTeamId } from "../utils/teamId.js";
import { makeOtp, sha256 } from "../utils/security.js";
import { sendOtpEmail } from "../services/mailer.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const sign = (user) =>
  jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: "7d" });

const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  verified: u.verified,
  team: u.team
    ? { id: u.team._id, name: u.team.name, teamId: u.team.teamId, settings: u.team.settings }
    : null,
  avatar: u.avatar,
  preferences: u.preferences,
  github: {
    connected: Boolean((u.githubId && u.githubAccessToken) || u.githubAppConnected),
    login: u.githubLogin || "",
  },
});

function oauthState(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "10m" });
}

function githubConfig() {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    throw new Error("GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to backend/.env");
  }
}

function githubRedirect() {
  return process.env.GITHUB_CALLBACK_URL || `http://localhost:${process.env.PORT || 5000}/api/auth/github/callback`;
}

router.get("/google", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).send("Google sign-in is not configured.");
  }
  const redirect_uri =
    process.env.GOOGLE_CALLBACK_URL ||
    `http://localhost:${process.env.PORT || 5000}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get("/google/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) throw new Error("Google authorization was cancelled");

    const redirect_uri =
      process.env.GOOGLE_CALLBACK_URL ||
      `http://localhost:${process.env.PORT || 5000}/api/auth/google/callback`;

    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResp.json();
    if (!tokenResp.ok) throw new Error(tokens.error_description || "Google token exchange failed");

    const infoResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = await infoResp.json();
    if (!info.email) throw new Error("Google did not return an email");

    let user = await User.findOne({ email: info.email.toLowerCase() });
    if (!user) {
      user = await User.create({
        name: info.name || info.email.split("@")[0],
        email: info.email.toLowerCase(),
        googleId: info.sub,
        verified: true,
        avatar: info.picture,
      });
      const team = await Team.create({
        name: `${user.name}'s Team`,
        teamId: makeTeamId(),
        owner: user._id,
      });
      user.team = team._id;
      user.role = "leader";
      await user.save();
    }

    user.googleId = info.sub;
    user.verified = true;
    if (info.picture) user.avatar = info.picture;
    await user.save();
    await user.populate("team", "name teamId settings");

    res.redirect(`${CLIENT_URL}/?auth_token=${encodeURIComponent(sign(user))}`);
  } catch (e) {
    res.redirect(`${CLIENT_URL}/?auth_error=${encodeURIComponent(e.message)}`);
  }
});

// GitHub login/signup.
router.get("/github", (req, res) => {
  try {
    githubConfig();
    const state = oauthState({ action: "login" });
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: githubRedirect(),
      response_type: "code",
      scope: "read:user user:email repo",
      state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  } catch (e) {
    res.status(503).send(e.message);
  }
});

// Authenticated GitHub connection URL.
router.get("/github/connect-url", auth, (req, res) => {
  try {
    githubConfig();
    const state = oauthState({ action: "connect", userId: req.user._id.toString() });
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: githubRedirect(),
      response_type: "code",
      scope: "read:user user:email repo",
      state,
    });
    res.json({ success: true, url: `https://github.com/login/oauth/authorize?${params}` });
  } catch (e) {
    res.status(503).json({ success: false, message: e.message });
  }
});

router.get("/github/callback", async (req, res) => {
  try {
    githubConfig();
    const { code, state } = req.query;
    if (!code || !state) throw new Error("GitHub authorization was cancelled");

    const stateData = jwt.verify(state, process.env.JWT_SECRET);
    const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: githubRedirect(),
      }),
    });

    const tokens = await tokenResp.json();
    if (!tokenResp.ok || !tokens.access_token) {
      throw new Error(tokens.error_description || "GitHub token exchange failed");
    }

    const ghHeaders = {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Dev-Intelligence",
    };

    const [ghUserResp, emailResp] = await Promise.all([
      fetch("https://api.github.com/user", { headers: ghHeaders }),
      fetch("https://api.github.com/user/emails", { headers: ghHeaders }),
    ]);

    const ghUser = await ghUserResp.json();
    const emails = await emailResp.json();
    const primaryEmail =
      Array.isArray(emails)
        ? emails.find((e) => e.primary && e.verified)?.email ||
          emails.find((e) => e.verified)?.email
        : null;

    if (!ghUser.login) throw new Error("GitHub account information was unavailable");

    if (stateData.action === "connect") {
      const user = await User.findById(stateData.userId);
      if (!user) throw new Error("Your account no longer exists");

      user.githubId = String(ghUser.id);
      user.githubLogin = ghUser.login;
      user.githubAccessToken = tokens.access_token;
      if (ghUser.avatar_url) user.avatar = ghUser.avatar_url;
      if (primaryEmail && !user.email) user.email = primaryEmail.toLowerCase();
      user.verified = true;
      await user.save();

      res.redirect(`${CLIENT_URL}/?github_connected=1`);
      return;
    }

    let user =
      (await User.findOne({ githubId: String(ghUser.id) })) ||
      (primaryEmail ? await User.findOne({ email: primaryEmail.toLowerCase() }) : null);

    if (!user) {
      user = await User.create({
        name: ghUser.name || ghUser.login,
        email: (primaryEmail || `${ghUser.login}@users.noreply.github.com`).toLowerCase(),
        githubId: String(ghUser.id),
        githubLogin: ghUser.login,
        githubAccessToken: tokens.access_token,
        verified: true,
        avatar: ghUser.avatar_url,
      });

      const team = await Team.create({
        name: `${user.name}'s Team`,
        teamId: makeTeamId(),
        owner: user._id,
      });
      user.team = team._id;
      user.role = "leader";
    } else {
      user.githubId = String(ghUser.id);
      user.githubLogin = ghUser.login;
      user.githubAccessToken = tokens.access_token;
      user.verified = true;
      if (ghUser.avatar_url) user.avatar = ghUser.avatar_url;
      if (!user.team) {
        const team = await Team.create({
          name: `${user.name}'s Team`,
          teamId: makeTeamId(),
          owner: user._id,
        });
        user.team = team._id;
        user.role = "leader";
      }
    }

    await user.save();
    await user.populate("team", "name teamId settings");
    res.redirect(`${CLIENT_URL}/?auth_token=${encodeURIComponent(sign(user))}`);
  } catch (e) {
    res.redirect(`${CLIENT_URL}/?auth_error=${encodeURIComponent(e.message)}`);
  }
});

// Visiting the API URL in a browser uses GET; send users to the real React form.
router.get("/signup", (req, res) => res.redirect(303, `${CLIENT_URL}/?signup=1`));

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, mode = "create", teamId } = req.body || {};
    if (!name || !email || !password || password.length < 8) {
      return res.status(400).json({ message: "Name, email and an 8+ character password are required" });
    }

    const normalized = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || !String(name).trim() || String(name).trim().length > 80) {
      return res.status(400).json({ message: "Enter a valid email and name (max 80 characters)." });
    }
    if (!["create", "join"].includes(mode)) return res.status(400).json({ message: "Invalid signup mode." });
    // Do not create an unusable user account when SMTP is missing.
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(503).json({ message: "Email verification is unavailable. Configure SMTP in backend/.env and restart the backend." });
    }
    const existing = await User.findOne({ email: normalized });
    if (existing) {
      if (!existing.verified && existing.passwordHash && await bcrypt.compare(password, existing.passwordHash)) {
        return res.status(409).json({ message: "This account needs email verification. Use Resend verification code.", needsVerification: true, email: normalized });
      }
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    // Validate team membership before creating a user, avoiding orphan accounts.
    let joiningTeam = null;
    if (mode === "join") {
      joiningTeam = await Team.findOne({ teamId: String(teamId || "").trim().toUpperCase() });
      if (!joiningTeam) return res.status(404).json({ message: "Team ID not found" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email: normalized, passwordHash });

    let team;
    if (mode === "create") {
      team = await Team.create({ name: `${name}'s Team`, teamId: makeTeamId(), owner: user._id });
      user.team = team._id;
      user.role = "leader";
      await user.save();
      team.owner = user._id;
      await team.save();
    } else {
      team = joiningTeam;
      user.team = team._id;
      user.role = "developer";
      await user.save();
    }

    const otp = makeOtp();
    user.otpHash = sha256(otp);
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    try {
      await sendOtpEmail(user.email, otp);
    } catch (mailError) {
      // The account is intentionally retained as unverified so users can retry OTP.
      console.error("Signup OTP delivery failed:", mailError.message);
      return res.status(503).json({ message: "Account created but verification email could not be delivered. Check SMTP settings and use Resend verification code.", needsVerification: true, email: user.email });
    }

    res.status(201).json({ message: "Verification code sent", email: user.email });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user || !user.otpHash || !user.otpExpiresAt || user.otpExpiresAt < new Date() || user.otpHash !== sha256(String(otp))) {
      return res.status(400).json({ message: "Invalid or expired verification code" });
    }
    user.verified = true;
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    await user.save();
    await user.populate("team", "name teamId settings");
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post("/resend-otp", async (req, res) => {
  try {
    const user = await User.findOne({ email: String(req.body?.email || "").toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: "Account not found" });
    if (user.verified) return res.status(400).json({ message: "Email is already verified. Please sign in." });
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(503).json({ message: "Email delivery is not configured. Please set SMTP credentials." });
    }
    const otp = makeOtp();
    user.otpHash = sha256(otp);
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    await sendOtpEmail(user.email, otp);
    res.json({ message: "A new code was sent" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password, teamId } = req.body;
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).populate("team", "name teamId settings");
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    if (!user.verified) {
      return res.status(403).json({ message: "Please verify your email first", needsVerification: true, email: user.email });
    }
    if (!user.team || user.team.teamId !== String(teamId || "").toUpperCase()) {
      return res.status(403).json({ message: "That Team ID does not match your account" });
    }
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get("/me", auth, async (req, res) => {
  await req.user.populate("team", "name teamId settings");
  res.json({ user: publicUser(req.user) });
});

router.patch("/profile", auth, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const avatar = String(req.body.avatar || "").trim();
  if (!name) return res.status(400).json({ message: "Name is required" });
  req.user.name = name.slice(0, 80);
  req.user.avatar = avatar.slice(0, 500);
  await req.user.save();
  await req.user.populate("team", "name teamId settings");
  res.json({ success: true, user: publicUser(req.user) });
});

router.patch("/preferences", auth, async (req, res) => {
  const allowed = ["theme", "emailNotifications", "desktopNotifications", "aiPermissions"];
  for (const key of allowed) if (key in req.body && key !== "aiPermissions") req.user.preferences[key] = req.body[key];
  if (req.body.aiPermissions && typeof req.body.aiPermissions === "object" && !Array.isArray(req.body.aiPermissions)) { for(const key of ["ai:read_files","ai:read_reports","ai:read_github","ai:read_notes","ai:write_notes"]) if(typeof req.body.aiPermissions[key] === "boolean") req.user.preferences.aiPermissions.set(key,req.body.aiPermissions[key]); }
  await req.user.save();
  await req.user.populate("team", "name teamId settings");
  res.json({ success: true, user: publicUser(req.user) });
});

export default router;
