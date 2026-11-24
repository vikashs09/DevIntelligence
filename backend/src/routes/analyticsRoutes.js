import express from "express";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import Repository from "../models/Repository.js";
import GitHubEvent from "../models/GitHubEvent.js";
import { auth } from "../middleware/auth.js";
import { calculateHealth } from "../services/healthScoreService.js";

const router = express.Router();
router.use(auth);

async function buildOverview(teamId) {
  const [tasks, projects, members, repositories] = await Promise.all([
    Task.find({ team: teamId }).lean(),
    Project.find({ team: teamId }).lean(),
    User.find({ team: teamId }).select("name email role avatar").lean(),
    Repository.find({ team: teamId }).lean(),
  ]);

  const github = repositories.reduce(
    (a, r) => ({
      openIssues: a.openIssues + (r.openIssues || 0),
      totalIssues: a.totalIssues + (r.totalIssues || 0),
      openPullRequests: a.openPullRequests + (r.openPullRequests || 0),
      totalPullRequests: a.totalPullRequests + (r.totalPullRequests || 0),
      mergedPullRequests: a.mergedPullRequests + (r.mergedPullRequests || 0),
      recentCommits30d: a.recentCommits30d + (r.recentCommits30d ?? r.commitCount ?? 0),
    }),
    { openIssues: 0, totalIssues: 0, openPullRequests: 0, totalPullRequests: 0, mergedPullRequests: 0, recentCommits30d: 0 }
  );

  const health = calculateHealth({ tasks, ...github });
  const now = Date.now();
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const dueSoon = activeTasks.filter((t) => t.dueDate && new Date(t.dueDate).getTime() - now <= 3 * 86400000 && new Date(t.dueDate).getTime() >= now).length;

  return {
    stats: {
      projects: projects.length,
      tasks: tasks.length,
      completed: health.completedTasks,
      pending: tasks.length - health.completedTasks,
      members: members.length,
      repositories: repositories.length,
      dueSoon,
    },
    github,
    health,
    generatedAt: new Date().toISOString(),
  };
}

router.get("/overview", async (req, res) => {
  try {
    res.json(await buildOverview(req.user.team._id));
  } catch (e) {
    console.error("Analytics error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get("/dora", async (req, res) => {
  try {
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 86400000);
    const [events, tasks] = await Promise.all([
      GitHubEvent.find({ team: req.user.team._id, receivedAt: { $gte: since } }).select("+payload eventType receivedAt").lean(),
      Task.find({ team: req.user.team._id, updatedAt: { $gte: since } }).select("github").lean()
    ]);
    const deployments = events.filter((e) => ["deployment_status", "deployment"].includes(e.eventType));
    const successful = deployments.filter((e) => {
      const p = e.payload?.deployment_status || e.payload?.deployment || {};
      return ["success", "succeeded"].includes(String(p.state || "").toLowerCase());
    });
    const failed = deployments.filter((e) => {
      const p = e.payload?.deployment_status || e.payload?.deployment || {};
      return ["failure", "error"].includes(String(p.state || "").toLowerCase());
    });
    const leadTimes = [];
    for (const task of tasks) {
      const commits = task.github?.commits || [];
      const merged = (task.github?.pullRequests || []).filter((p) => p.mergedAt);
      if (!commits.length || !merged.length) continue;
      const commitTimes = commits.map((c) => new Date(c.committedAt || 0).getTime()).filter((n) => Number.isFinite(n) && n > 0);
      const mergeTimes = merged.map((p) => new Date(p.mergedAt).getTime()).filter((n) => Number.isFinite(n) && n > 0);
      if (!commitTimes.length || !mergeTimes.length) continue;
      const firstCommit = Math.min(...commitTimes);
      const mergeTime = Math.min(...mergeTimes);
      if (mergeTime >= firstCommit) leadTimes.push((mergeTime - firstCommit) / 3600000);
    }
    leadTimes.sort((a, b) => a - b);
    const medianLeadHours = leadTimes.length ? leadTimes[Math.floor(leadTimes.length / 2)] : null;
    const totalDeployments = successful.length + failed.length;
    const deploymentFrequency = successful.length / days;
    res.json({ success: true, periodDays: days, metrics: {
      deploymentFrequencyPerDay: Number(deploymentFrequency.toFixed(2)),
      successfulDeployments: successful.length,
      leadTimeMedianHours: medianLeadHours === null ? null : Number(medianLeadHours.toFixed(2)),
      changeFailureRate: totalDeployments ? Number((failed.length / totalDeployments * 100).toFixed(1)) : null,
      meanTimeToRecoveryHours: null
    }, coverage: {
      deploymentEvents: totalDeployments,
      tasksWithCommitAndMergeEvidence: leadTimes.length,
      mttr: "Unavailable until failure-to-recovery deployment pairs can be correlated."
    }, generatedAt: new Date().toISOString() });
  } catch {
    res.status(500).json({ success: false, message: "Unable to calculate engineering metrics." });
  }
});

router.get("/report", async (req, res) => {
  try {
    const report = await buildOverview(req.user.team._id);
    res.json({ success: true, report });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
