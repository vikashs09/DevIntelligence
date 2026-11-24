import express from "express";
import { auth, roles } from "../middleware/auth.js";
import Repository from "../models/Repository.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import GitHubInstallation from "../models/GitHubInstallation.js";
import GitHubEvent from "../models/GitHubEvent.js";
import FileMetric from "../models/FileMetric.js";
import {analyzeFileMetadata,summarizeFileHealth} from "../services/fileHealthService.js";
import {checkScopes} from "../middleware/aiScopes.js";
import jwt from "jsonwebtoken";
import { getInstallation, getInstallationOctokit, getInstallUrl } from "../services/githubAppService.js";

const router = express.Router();

const GITHUB_API = "https://api.github.com";

const appState = (userId) => jwt.sign({ action: "github-app-install", userId: String(userId) }, process.env.JWT_SECRET, { expiresIn: "15m" });

// GitHub redirects here after an App installation. This route intentionally runs
// before auth middleware; the signed state binds the installation to the user
// who initiated the flow. We still verify the installation against GitHub.
router.get("/app/setup", async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  try {
    const installationId = Number(req.query.installation_id);
    const state = String(req.query.state || "");
    if (!installationId || !state) throw new Error("GitHub App installation information is missing.");
    const stateData = jwt.verify(state, process.env.JWT_SECRET);
    if (stateData.action !== "github-app-install" || !stateData.userId) throw new Error("Invalid GitHub App setup state.");

    const user = await User.findById(stateData.userId).populate("team", "name teamId settings");
    if (!user) throw new Error("Dev Intelligence account no longer exists.");

    const installation = await getInstallation(installationId);
    const account = installation.account || {};
    if (!account.login) throw new Error("GitHub did not return the installed account.");

    const record = await GitHubInstallation.findOneAndUpdate(
      { installationId },
      {
        installationId, user: user._id, team: user.team?._id, accountId: account.id,
        accountLogin: account.login, accountType: account.type || "User",
        repositorySelection: installation.repository_selection || "selected",
        permissions: installation.permissions || {}, suspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null,
        lastVerifiedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    user.githubAppConnected = true;
    if (account.avatar_url && !user.avatar) user.avatar = account.avatar_url;
    await user.save();

    res.redirect(`${clientUrl}/?github_app_installed=1&installation_id=${encodeURIComponent(record.installationId)}`);
  } catch (e) {
    res.redirect(`${clientUrl}/?github_app_error=${encodeURIComponent(e.message)}`);
  }
});

router.use(auth);

router.get("/events", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const events = await GitHubEvent.find({ team: req.user.team?._id })
      .select("-payload").sort({ receivedAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    res.json({ success: true, events, page, limit });
  } catch {
    res.status(500).json({ success: false, message: "Unable to load GitHub event history." });
  }
});

router.get("/sync-status", async (req, res) => {
  try {
    const team = req.user.team?._id;
    const [latest, failed, repositories] = await Promise.all([
      GitHubEvent.findOne({ team }).sort({ receivedAt: -1 }).lean(),
      GitHubEvent.countDocuments({ team, status: "failed" }),
      Repository.find({ team }).select("fullName lastSynced").sort({ lastSynced: -1 }).limit(50).lean()
    ]);
    const age = latest ? Date.now() - new Date(latest.receivedAt).getTime() : null;
    const state = !latest ? "DISCONNECTED" : latest.status === "failed" ? "FAILED" : age > 15 * 60 * 1000 ? "DELAYED" : "LIVE";
    res.json({ success: true, state, lastEventAt: latest?.receivedAt || null,
      lastEventType: latest?.eventType || null, failedEvents: failed, repositories });
  } catch {
    res.status(500).json({ success: false, message: "Unable to load GitHub sync status." });
  }
});


const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "Dev-Intelligence",
});

function getToken(req) {
  return req.user?.githubAccessToken || "";
}

async function oauthRequest(path, token) {
  if (!token) throw new Error("GitHub is not connected. Install the Dev Intelligence GitHub App or connect GitHub OAuth first.");
  const response = await fetch(`${GITHUB_API}${path}`, { headers: headers(token) });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const err = new Error(data?.message || `GitHub API request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function appRequest(installationId, path) {
  const octokit = await getInstallationOctokit(installationId);
  const response = await octokit.request(`GET ${path}`, {
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return response.data;
}

async function resolveInstallation(req, owner, name) {
  const repo = await Repository.findOne({
    fullName: `${owner}/${name}`,
    ...(req.user.team ? { team: req.user.team._id } : { connectedBy: req.user._id }),
  }).lean();
  if (repo?.installationId) return repo.installationId;
  const installation = await GitHubInstallation.findOne({
    accountLogin: owner,
    ...(req.user.team ? { team: req.user.team._id } : { user: req.user._id }),
    suspendedAt: null,
  }).sort({ updatedAt: -1 }).lean();
  return installation?.installationId || null;
}

async function githubRequest(req, path, options = {}) {
  const { owner, name } = options;
  if (owner && name) {
    const installationId = await resolveInstallation(req, owner, name);
    if (installationId) return appRequest(installationId, path);
  }
  return oauthRequest(path, getToken(req));
}

// File inventory is fetched exclusively from a repository already connected to this team.
router.get('/file-health',async(req,res,next)=>{try{
 const access=await checkScopes(req,['ai:read_files'],req.query.projectId||null);
 if(!access.ok)return res.status(403).json({message:access.message});
 const q={team:req.user.team?._id};if(req.query.repositoryId){if(!/^[a-f0-9]{24}$/i.test(String(req.query.repositoryId)))return res.status(400).json({message:'Invalid repository'});q.repository=req.query.repositoryId}
 if(req.query.projectId)q.project=req.query.projectId;
 const files=await FileMetric.find(q).sort({healthScore:1}).limit(1500).lean();
 res.json({success:true,files,summary:summarizeFileHealth(files)});
}catch(e){next(e)}});
router.post('/file-health/:repositoryId/sync',async(req,res,next)=>{try{
 const access=await checkScopes(req,['ai:read_files','ai:read_github']);if(!access.ok)return res.status(403).json({message:access.message});
 if(!/^[a-f0-9]{24}$/i.test(req.params.repositoryId))return res.status(400).json({message:'Invalid repository'});
 const repo=await Repository.findOne({_id:req.params.repositoryId,team:req.user.team?._id});
 if(!repo)return res.status(404).json({message:'Repository not found'});
 const [owner,name]=repo.fullName.split('/');if(!owner||!name)return res.status(422).json({message:'Invalid GitHub repository name'});
 const branch=repo.defaultBranch||'main';
 const result=await githubRequest(req,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,{owner,name});
 const blobs=(result.tree||[]).filter(f=>f.type==='blob').slice(0,3000);
 const paths=blobs.map(b=>b.path);const tests=paths.filter(p=>/(test|spec)/i.test(p));const docs=paths.filter(p=>/(docs?|readme)/i.test(p));
 const metrics=blobs.map(b=>analyzeFileMetadata(b,{testPaths:tests,docPaths:docs}));
 const syncedAt=new Date();if(metrics.length)await FileMetric.bulkWrite(metrics.map(m=>({updateOne:{filter:{team:req.user.team?._id,repository:repo._id,path:m.path},update:{$set:{...m,team:req.user.team?._id,repository:repo._id,project:repo.project||null,syncedAt}},upsert:true}})));
 // Remove deleted entries only on complete Git trees; truncated results must not purge data.
 if(!result.truncated)await FileMetric.deleteMany({team:req.user.team?._id,repository:repo._id,syncedAt:{$ne:syncedAt}});
 res.json({success:true,summary:{...summarizeFileHealth(metrics),truncated:Boolean(result.truncated),limitReached:blobs.length===3000},files:await FileMetric.find({team:req.user.team?._id,repository:repo._id}).sort({healthScore:1}).limit(500).lean()});
}catch(e){if(e.status===401||e.status===403)return res.status(403).json({message:'GitHub repository access denied; reconnect GitHub with contents:read permission'});next(e)}});
const safe = (v) => encodeURIComponent(String(v || ""));
const repoPath = (owner, name) => `/repos/${safe(owner)}/${safe(name)}`;

async function fetchPullIntelligence(req, owner, name, pulls) {
  const sample = pulls.slice(0, 30);
  const details = await Promise.all(sample.map(async (pr) => {
    try {
      const [reviews, detail] = await Promise.all([
        githubRequest(req, `${repoPath(owner, name)}/pulls/${pr.number}/reviews`, { owner, name }),
        githubRequest(req, `${repoPath(owner, name)}/pulls/${pr.number}`, { owner, name }),
      ]);
      return {
        number: detail.number,
        title: detail.title,
        state: detail.state,
        merged: Boolean(detail.merged_at),
        author: detail.user ? { login: detail.user.login, avatar: detail.user.avatar_url } : null,
        reviewers: [...new Map((reviews || []).map((r) => [r.user?.login, {
          login: r.user?.login, state: r.state, avatar: r.user?.avatar_url
        }])).values()],
        reviewCount: reviews?.length || 0,
        approvals: (reviews || []).filter((r) => r.state === "APPROVED").length,
        changes: {
          additions: detail.additions || 0,
          deletions: detail.deletions || 0,
          changedFiles: detail.changed_files || 0,
        },
        comments: detail.comments || 0,
        reviewComments: detail.review_comments || 0,
        createdAt: detail.created_at,
        updatedAt: detail.updated_at,
        mergedAt: detail.merged_at,
        htmlUrl: detail.html_url,
      };
    } catch {
      return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        merged: false,
        author: pr.user ? { login: pr.user.login, avatar: pr.user.avatar_url } : null,
        reviewers: [],
        reviewCount: 0,
        approvals: 0,
        changes: { additions: 0, deletions: 0, changedFiles: 0 },
        comments: 0,
        reviewComments: 0,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergedAt: null,
        htmlUrl: pr.html_url,
      };
    }
  }));
  return details;
}

function activityFrom({ commits, pulls, issues, workflows }) {
  const events = [];
  for (const c of commits.slice(0, 30)) {
    events.push({
      type: "commit",
      actor: c.author?.login || c.commit?.author?.name || "Unknown",
      avatar: c.author?.avatar_url,
      title: c.commit?.message?.split("\n")[0] || "Commit",
      date: c.commit?.author?.date || c.commit?.committer?.date,
      url: c.html_url,
      meta: `${(c.stats?.additions || 0)} additions · ${(c.stats?.deletions || 0)} deletions`,
    });
  }
  for (const p of pulls.slice(0, 20)) {
    events.push({
      type: "pull_request",
      actor: p.user?.login || "Unknown",
      avatar: p.user?.avatar_url,
      title: `${p.merged_at ? "Merged" : p.state === "open" ? "Opened" : "Closed"} PR #${p.number}: ${p.title}`,
      date: p.merged_at || p.updated_at || p.created_at,
      url: p.html_url,
      meta: p.merged_at ? "merged" : p.state,
    });
  }
  for (const i of issues.filter((x) => !x.pull_request).slice(0, 20)) {
    events.push({
      type: "issue",
      actor: i.user?.login || "Unknown",
      avatar: i.user?.avatar_url,
      title: `${i.state === "open" ? "Opened" : "Closed"} issue #${i.number}: ${i.title}`,
      date: i.updated_at || i.created_at,
      url: i.html_url,
      meta: i.labels?.map((l) => l.name).filter(Boolean).join(" · ") || i.state,
    });
  }
  for (const w of (workflows || []).slice(0, 15)) {
    events.push({
      type: "ci",
      actor: w.actor?.login || "GitHub Actions",
      avatar: w.actor?.avatar_url,
      title: `${w.conclusion === "success" ? "CI passed" : w.conclusion || "CI running"} · ${w.name}`,
      date: w.updated_at || w.created_at,
      url: w.html_url,
      meta: w.head_branch || "workflow",
    });
  }
  return events.filter((x) => x.date).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 80);
}

router.get("/status", async (req, res) => {
  try {
    const installations = await GitHubInstallation.find({
      ...(req.user.team ? { team: req.user.team._id } : { user: req.user._id }),
      suspendedAt: null,
    }).sort({ updatedAt: -1 }).lean();
    if (installations.length) {
      return res.json({
        connected: true,
        mode: "github-app",
        installations: installations.map((i) => ({
          id: i.installationId, accountLogin: i.accountLogin, accountType: i.accountType,
          repositorySelection: i.repositorySelection, permissions: i.permissions,
          lastVerifiedAt: i.lastVerifiedAt,
        })),
        account: { login: installations[0].accountLogin, name: installations[0].accountLogin, avatar: null },
      });
    }
    if (!req.user.githubAccessToken) return res.json({ connected: false, mode: "not-connected", appInstallUrl: getInstallUrl() });
    const gh = await githubRequest(req, "/user");
    res.json({
      connected: true,
      mode: "oauth",
      account: {
        id: gh.id, login: gh.login, name: gh.name, avatar: gh.avatar_url,
        profileUrl: gh.html_url, publicRepos: gh.public_repos,
        followers: gh.followers, following: gh.following,
        company: gh.company, location: gh.location, bio: gh.bio,
      },
    });
  } catch (e) {
    res.status(502).json({ connected: false, mode: "error", message: e.message });
  }
});

router.get("/app/install-url", async (req, res) => {
  try {
    res.json({ success: true, url: getInstallUrl(appState(req.user._id)) });
  } catch (e) {
    res.status(503).json({ success: false, message: e.message });
  }
});

router.get("/app/installations", async (req, res) => {
  try {
    const installations = await GitHubInstallation.find({
      ...(req.user.team ? { team: req.user.team._id } : { user: req.user._id }),
      suspendedAt: null,
    }).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, installations });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get("/app/repositories", async (req, res) => {
  try {
    const installations = await GitHubInstallation.find({
      ...(req.user.team ? { team: req.user.team._id } : { user: req.user._id }),
      suspendedAt: null,
    }).lean();
    const all = [];
    for (const installation of installations) {
      const data = await appRequest(installation.installationId, "/installation/repositories?per_page=100");
      for (const repo of data.repositories || []) {
        all.push({ ...repo, _source: "github-app", installationId: installation.installationId, _accountLogin: installation.accountLogin });
      }
    }
    res.json({ success: true, repositories: all });
  } catch (e) {
    res.status(e.status === 401 ? 401 : 502).json({ success: false, message: e.message });
  }
});

router.get("/repositories", async (req, res) => {
  try {
    const appInstallations = await GitHubInstallation.find({
      ...(req.user.team ? { team: req.user.team._id } : { user: req.user._id }),
      suspendedAt: null,
    }).lean();
    const merged = new Map();
    for (const installation of appInstallations) {
      const data = await appRequest(installation.installationId, "/installation/repositories?per_page=100");
      for (const repo of data.repositories || []) merged.set(repo.full_name, { ...repo, _source: "github-app", installationId: installation.installationId });
    }
    if (req.user.githubAccessToken) {
      const oauthRepos = await oauthRequest("/user/repos?per_page=100&sort=updated&direction=desc", req.user.githubAccessToken);
      for (const repo of oauthRepos || []) if (!merged.has(repo.full_name)) merged.set(repo.full_name, { ...repo, _source: "oauth" });
    }
    res.json({ success: true, repositories: [...merged.values()] });
  } catch (e) {
    res.status(e.status === 401 ? 401 : 502).json({ success: false, message: e.message });
  }
});

router.get("/linked", async (req, res) => {
  try {
    const query = req.user.team
      ? { team: req.user.team._id }
      : { connectedBy: req.user._id };
    const repositories = await Repository.find(query).populate("project", "name").sort({ lastSynced: -1 }).lean();
    res.json({ success: true, repositories });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get("/repositories/:owner/:name/intelligence", async (req, res) => {
  try {
    const { owner, name } = req.params;
    const [repo, pulls, issuesRaw, commits, branches, contributors, collaborators, releases, tags, workflows] =
      await Promise.all([
        githubRequest(req, `${repoPath(owner, name)}`, { owner, name }),
        githubRequest(req, `${repoPath(owner, name)}/pulls?state=all&per_page=100&sort=updated&direction=desc`, { owner, name }),
        githubRequest(req, `${repoPath(owner, name)}/issues?state=all&per_page=100&sort=updated&direction=desc`, { owner, name }),
        githubRequest(req, `${repoPath(owner, name)}/commits?per_page=100`, { owner, name }),
        githubRequest(req, `${repoPath(owner, name)}/branches?per_page=100`, { owner, name }),
        githubRequest(req, `${repoPath(owner, name)}/contributors?per_page=100`, { owner, name }),
        githubRequest(req, `${repoPath(owner, name)}/collaborators?per_page=100`, { owner, name }),
        githubRequest(req, `${repoPath(owner, name)}/releases?per_page=30`, { owner, name }),
        githubRequest(req, `${repoPath(owner, name)}/tags?per_page=30`, { owner, name }),
        githubRequest(req, `${repoPath(owner, name)}/actions/runs?per_page=30`, { owner, name }),
      ]);

    const issues = issuesRaw.filter((i) => !i.pull_request);
    const prDetails = await fetchPullIntelligence(req, owner, name, pulls);

    const permissionMap = collaborators.map((c) => ({
      login: c.login,
      avatar: c.avatar_url,
      type: c.type,
      permissions: c.permissions || {},
      roleName: c.role_name || null,
      htmlUrl: c.html_url,
    }));

    const ciRuns = workflows.workflow_runs || [];
    const ciPassed = ciRuns.filter((w) => w.conclusion === "success").length;
    const ciCompleted = ciRuns.filter((w) => w.status === "completed").length;

    const intelligence = {
      repository: {
        id: repo.id, name: repo.name, fullName: repo.full_name, owner: repo.owner?.login,
        description: repo.description, url: repo.html_url, private: repo.private,
        fork: repo.fork, parent: repo.parent?.full_name || null, source: repo.source?.full_name || null,
        defaultBranch: repo.default_branch, language: repo.language, license: repo.license?.spdx_id || null,
        topics: repo.topics || [], stars: repo.stargazers_count, forks: repo.forks_count,
        watchers: repo.watchers_count, size: repo.size, openIssues: repo.open_issues_count,
        createdAt: repo.created_at, updatedAt: repo.updated_at, pushedAt: repo.pushed_at,
      },
      summary: {
        commits: commits.length,
        prs: pulls.length,
        openPrs: pulls.filter((p) => p.state === "open").length,
        mergedPrs: pulls.filter((p) => Boolean(p.merged_at)).length,
        closedPrs: pulls.filter((p) => p.state === "closed" && !p.merged_at).length,
        issues: issues.length,
        openIssues: issues.filter((i) => i.state === "open").length,
        closedIssues: issues.filter((i) => i.state === "closed").length,
        contributors: contributors.length,
        branches: branches.length,
        collaborators: permissionMap.length,
        releases: releases.length,
        tags: tags.length,
        ciRuns: ciRuns.length,
        ciPassed,
        ciCompleted,
        ciSuccessRate: ciCompleted ? Math.round((ciPassed / ciCompleted) * 100) : null,
      },
      pullRequests: prDetails,
      issues: issues.slice(0, 100).map((i) => ({
        number: i.number, title: i.title, state: i.state,
        author: i.user?.login, avatar: i.user?.avatar_url,
        assignees: i.assignees?.map((a) => a.login) || [],
        labels: i.labels?.map((l) => l.name) || [],
        comments: i.comments || 0, createdAt: i.created_at, updatedAt: i.updated_at,
        closedAt: i.closed_at, url: i.html_url,
      })),
      commits: commits.slice(0, 100).map((c) => ({
        sha: c.sha, message: c.commit?.message?.split("\n")[0],
        author: c.author?.login || c.commit?.author?.name,
        avatar: c.author?.avatar_url, date: c.commit?.author?.date,
        url: c.html_url,
      })),
      branches: branches.slice(0, 100).map((b) => ({ name: b.name, protected: b.protected })),
      contributors: contributors.slice(0, 100).map((c) => ({
        login: c.login, avatar: c.avatar_url, contributions: c.contributions, url: c.html_url,
      })),
      collaborators: permissionMap,
      releases: releases.map((r) => ({
        name: r.name || r.tag_name, tag: r.tag_name, author: r.author?.login,
        publishedAt: r.published_at, url: r.html_url, prerelease: r.prerelease,
      })),
      tags: tags.map((t) => ({ name: t.name, sha: t.commit?.sha })),
      ciRuns: ciRuns.slice(0, 30).map((w) => ({
        id: w.id, name: w.name, status: w.status, conclusion: w.conclusion,
        branch: w.head_branch, actor: w.actor?.login, createdAt: w.created_at,
        updatedAt: w.updated_at, url: w.html_url,
      })),
      activity: activityFrom({ commits, pulls, issues, workflows: ciRuns }),
    };

    res.json({ success: true, intelligence });
  } catch (e) {
    console.error("GitHub intelligence error:", e);
    res.status(e.status === 401 ? 401 : 502).json({ success: false, message: e.message });
  }
});

router.post("/ai-insight", async (req, res) => {
  try {
    const { question, intelligence } = req.body;
    if (!question || !intelligence) return res.status(400).json({ success: false, message: "question and intelligence are required" });
    const { askDeepSeek } = await import("../services/aiService.js");
    const answer = await askDeepSeek({
      question: String(question).slice(0, 4000),
      context: { source: "GitHub Intelligence", repository: intelligence.repository, summary: intelligence.summary, pullRequests: intelligence.pullRequests?.slice(0, 20), issues: intelligence.issues?.slice(0, 30), commits: intelligence.commits?.slice(0, 30), contributors: intelligence.contributors?.slice(0, 30), ciRuns: intelligence.ciRuns?.slice(0, 20), activity: intelligence.activity?.slice(0, 40) },
    });
    res.json({ success: true, answer });
  } catch (e) {
    res.status(e.status === 429 ? 429 : 500).json({ success: false, message: e.message });
  }
});

router.get("/report", async (req, res) => {
  try {
    const { owner, name } = req.query;
    if (!owner || !name) return res.status(400).json({ success: false, message: "owner and name are required" });
    const [repo, pulls, issuesRaw, commits, workflows] = await Promise.all([
      githubRequest(req, `${repoPath(owner, name)}`, { owner, name }),
      githubRequest(req, `${repoPath(owner, name)}/pulls?state=all&per_page=100`, { owner, name }),
      githubRequest(req, `${repoPath(owner, name)}/issues?state=all&per_page=100`, { owner, name }),
      githubRequest(req, `${repoPath(owner, name)}/commits?per_page=100`, { owner, name }),
      githubRequest(req, `${repoPath(owner, name)}/actions/runs?per_page=30`, { owner, name }),
    ]);
    const issues = issuesRaw.filter((i) => !i.pull_request);
    const by = (items, key) => Object.entries(items.reduce((a, x) => {
      const value = x[key];
      const k = typeof value === "string"
        ? value
        : value?.login || x.user?.login || x.author?.login || x.commit?.author?.name || "Unknown";
      a[k] = (a[k] || 0) + 1;
      return a;
    }, {})).sort((a, b) => b[1] - a[1]);
    const report = {
      generatedAt: new Date().toISOString(),
      repository: repo.full_name,
      period: "Latest available GitHub activity",
      metrics: {
        commits: commits.length,
        prsCreated: pulls.length,
        prsOpen: pulls.filter((p) => p.state === "open").length,
        prsMerged: pulls.filter((p) => p.merged_at).length,
        issuesCreated: issues.length,
        issuesOpen: issues.filter((i) => i.state === "open").length,
        issuesClosed: issues.filter((i) => i.state === "closed").length,
        ciRuns: workflows.workflow_runs?.length || 0,
        ciSuccess: workflows.workflow_runs?.filter((w) => w.conclusion === "success").length || 0,
      },
      contributors: by(commits, "author").slice(0, 20).map(([author, count]) => ({ author, commits: count })),
      prAuthors: by(pulls, "user").slice(0, 20).map(([author, prs]) => ({ author, prs })),
      issueAuthors: by(issues, "user").slice(0, 20).map(([author, issues]) => ({ author, issues })),
      recentActivity: activityFrom({ commits, pulls, issues, workflows: workflows.workflow_runs || [] }).slice(0, 50),
    };
    res.json({ success: true, report });
  } catch (e) {
    res.status(e.status === 401 ? 401 : 502).json({ success: false, message: e.message });
  }
});

router.post("/sync", roles("leader", "manager", "team_leader"), async (req, res) => {
  try {
    const owner = String(req.body.owner || "").trim();
    const name = String(req.body.name || "").trim();
    const projectId = req.body.projectId || null;
    if (!owner || !name) return res.status(400).json({ success: false, message: "Repository owner and name are required." });
    if (!/^[a-zA-Z0-9-]{1,39}$/.test(owner) || !/^[a-zA-Z0-9._-]{1,100}$/.test(name)) {
      return res.status(400).json({ success: false, message: "Invalid GitHub owner or repository name." });
    }
    // Never accept an arbitrary project ID: the destination must belong to this team.
    let targetProject = null;
    if (projectId) {
      if (!req.user.team?._id) return res.status(403).json({ success: false, message: "A team is required to link projects." });
      if (!/^[a-f0-9]{24}$/i.test(String(projectId))) return res.status(400).json({ success: false, message: "Invalid project ID." });
      targetProject = await Project.findOne({ _id: projectId, team: req.user.team._id });
      if (!targetProject) return res.status(404).json({ success: false, message: "Project not found in your team." });
    }

    const repo = await githubRequest(req, `${repoPath(owner, name)}`, { owner, name });
    const installationId = await resolveInstallation(req, owner, name);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [pulls, issuesRaw, commits] = await Promise.all([
      githubRequest(req, `${repoPath(owner, name)}/pulls?state=all&per_page=100`, { owner, name }),
      githubRequest(req, `${repoPath(owner, name)}/issues?state=all&per_page=100`, { owner, name }),
      githubRequest(req, `${repoPath(owner, name)}/commits?per_page=100&since=${encodeURIComponent(since)}`, { owner, name }),
    ]);
    const issues = issuesRaw.filter((i) => !i.pull_request);
    const query = req.user.team
      ? { team: req.user.team._id, fullName: repo.full_name }
      : { connectedBy: req.user._id, fullName: repo.full_name };

    const saved = await Repository.findOneAndUpdate(query, {
      team: req.user.team?._id,
      project: projectId || undefined,
      connectedBy: req.user._id,
      githubId: repo.id,
      installationId: installationId || undefined,
      owner: repo.owner?.login || owner,
      name: repo.name || name,
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description || "",
      private: Boolean(repo.private),
      fork: Boolean(repo.fork),
      parentFullName: repo.parent?.full_name || "",
      sourceFullName: repo.source?.full_name || "",
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      watchers: repo.watchers_count || 0,
      openIssues: issues.filter((i) => i.state === "open").length,
      totalIssues: issues.length,
      openPullRequests: pulls.filter((p) => p.state === "open").length,
      totalPullRequests: pulls.length,
      mergedPullRequests: pulls.filter((p) => p.merged_at).length,
      commitCount: commits.length,
      recentCommits30d: commits.length,
      defaultBranch: repo.default_branch || "main",
      language: repo.language || null,
      license: repo.license?.spdx_id || null,
      topics: repo.topics || [],
      lastSynced: new Date(),
    }, { upsert: true, new: true, setDefaultsOnInsert: true });

    if (targetProject) {
      await Project.updateOne({ _id: targetProject._id, team: req.user.team._id }, { githubOwner: repo.owner?.login || owner, githubRepo: repo.name || name });
    }

    res.json({ success: true, message: "Repository synchronized.", repository: saved });
  } catch (e) {
    console.error("GitHub sync error:", e);
    res.status(e.status === 401 ? 401 : 502).json({ success: false, message: e.message });
  }
});

router.delete("/linked/:id", roles("leader", "manager"), async (req, res) => {
  const repo = await Repository.findOneAndDelete(
    req.user.team
      ? { _id: req.params.id, team: req.user.team._id }
      : { _id: req.params.id, connectedBy: req.user._id }
  );
  if (!repo) return res.status(404).json({ success: false, message: "Repository not found." });
  res.json({ success: true, message: "Repository disconnected." });
});

export default router;
