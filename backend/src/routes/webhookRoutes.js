import express from "express";
import crypto from "node:crypto";
import Repository from "../models/Repository.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import GitHubInstallation from "../models/GitHubInstallation.js";
import GitHubEvent from "../models/GitHubEvent.js";
import Task from "../models/Task.js";
import AuditLog from "../models/AuditLog.js";

const router = express.Router();

function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function taskKeysFromPayload(event, payload) {
  const candidates = [
    payload.ref, payload.pull_request?.head?.ref, payload.pull_request?.base?.ref,
    payload.pull_request?.title, payload.pull_request?.body,
    payload.issue?.title, payload.issue?.body, payload.comment?.body,
    ...(payload.commits || []).map((c) => `${c.message || ""} ${c.url || ""}`),
    payload.head_commit?.message
  ].filter(Boolean).join("\n");
  return [...new Set((candidates.match(/(?:TASK-\d+|#\d+)/gi) || []).map((v) => v.toUpperCase()))];
}

function eventDetails(event, payload) {
  const pr = payload.pull_request;
  const review = payload.review;
  const workflow = payload.workflow_run;
  const deployment = payload.deployment_status || payload.deployment;
  if (event === "push") {
    return (payload.commits || []).map((c) => ({
      type: "commit", message: c.message || "Commit pushed", sourceUrl: c.url,
      actor: c.author?.username || payload.pusher?.name, occurredAt: c.timestamp || new Date()
    }));
  }
  if (event === "pull_request") return [{
    type: "pull_request", message: `PR #${pr?.number} ${payload.action || "updated"}: ${pr?.title || ""}`,
    sourceUrl: pr?.html_url, actor: payload.sender?.login, occurredAt: new Date()
  }];
  if (event === "pull_request_review") return [{
    type: "review", message: `PR #${pr?.number} review: ${review?.state || payload.action}`,
    sourceUrl: review?.html_url || pr?.html_url, actor: review?.user?.login, occurredAt: new Date()
  }];
  if (event === "workflow_run") return [{
    type: "ci", message: `Workflow ${workflow?.name || ""}: ${workflow?.conclusion || workflow?.status || payload.action}`,
    sourceUrl: workflow?.html_url, actor: workflow?.actor?.login, occurredAt: new Date()
  }];
  if (event.startsWith("deployment")) return [{
    type: "deployment", message: `Deployment ${deployment?.state || payload.action || "updated"}`,
    sourceUrl: deployment?.target_url || deployment?.environment_url, actor: payload.sender?.login, occurredAt: new Date()
  }];
  return [];
}

router.post("/github", express.raw({ type: "application/json", limit: "2mb" }), async (req, res) => {
  let storedEvent;
  try {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const signature = req.headers["x-hub-signature-256"] || "";
    if ((process.env.NODE_ENV === "production" || secret) && !verifySignature(req.body, signature, secret)) {
      return res.status(401).json({ received: false, message: "Invalid or missing GitHub webhook signature." });
    }
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ received: false, message: "Expected raw JSON webhook body." });

    const deliveryId = String(req.headers["x-github-delivery"] || "").trim();
    if (!deliveryId) return res.status(400).json({ received: false, message: "Missing GitHub delivery ID." });
    const event = String(req.headers["x-github-event"] || "unknown");
    const payload = JSON.parse(req.body.toString("utf8") || "{}");
    const fullName = payload.repository?.full_name || "";
    const installationId = Number(payload.installation?.id || 0) || null;

    try {
      storedEvent = await GitHubEvent.create({
        deliveryId, eventType: event, action: payload.action, repositoryId: payload.repository?.id,
        repositoryFullName: fullName, installationId, status: "received", payload
      });
    } catch (error) {
      if (error?.code === 11000) return res.status(202).json({ received: true, duplicate: true, deliveryId });
      throw error;
    }

    if (["installation", "installation_repositories"].includes(event) && installationId) {
      const action = String(payload.action || "");
      const account = payload.installation?.account || {};
      if (["deleted", "suspend"].includes(action)) {
        await GitHubInstallation.findOneAndUpdate({ installationId }, { suspendedAt: new Date() });
      } else if (account.login) {
        await GitHubInstallation.findOneAndUpdate(
          { installationId },
          {
            accountId: account.id, accountLogin: account.login, accountType: account.type || "User",
            repositorySelection: payload.installation?.repository_selection || "selected",
            permissions: payload.installation?.permissions || {}, suspendedAt: null,
            lastVerifiedAt: new Date()
          }, { new: true }
        );
      }
    }

    let repo = null;
    if (fullName) {
      repo = await Repository.findOneAndUpdate({ fullName }, { lastSynced: new Date() }, { new: true });
      if (repo) {
        storedEvent.team = repo.team;
        await storedEvent.save();
        const details = eventDetails(event, payload);
        const keys = taskKeysFromPayload(event, payload);
        const tasks = keys.length ? await Task.find({
          team: repo.team,
          $or: keys.map((key) => ({ taskKey: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }))
        }) : [];

        for (const task of tasks) {
          {
            task.github = task.github || {};
            task.github.commits = task.github.commits || [];
            task.github.pullRequests = task.github.pullRequests || [];
            task.github.reviews = task.github.reviews || [];
            task.github.checks = task.github.checks || [];
            task.github.deployments = task.github.deployments || [];
            task.activity = task.activity || [];
            task.github.repository = repo._id;
            task.github.repositoryFullName = repo.fullName;
            if (payload.ref?.startsWith("refs/heads/")) task.github.branch = payload.ref.replace("refs/heads/", "");
            if (event === "push") {
              for (const commit of (payload.commits || [])) {
                if (!task.github.commits.some((item) => item.sha === commit.id)) task.github.commits.push({
                  sha: commit.id, message: commit.message, url: commit.url,
                  author: commit.author?.username || commit.author?.name, committedAt: commit.timestamp
                });
              }
            }
            if (event === "pull_request" && payload.pull_request) {
              const p = payload.pull_request;
              const existing = task.github.pullRequests.find((item) => item.number === p.number);
              const value = { number: p.number, title: p.title, url: p.html_url, state: p.merged_at ? "merged" : p.state, mergedAt: p.merged_at || null };
              if (existing) Object.assign(existing, value); else task.github.pullRequests.push(value);
              if (["opened", "reopened", "synchronize"].includes(payload.action) && task.status === "todo") task.status = "in_progress";
              if (p.merged_at) task.status = "done";
            }
            if (event === "pull_request_review" && payload.review) task.github.reviews.push({
              state: payload.review.state, reviewer: payload.review.user?.login,
              submittedAt: payload.review.submitted_at, pullRequestNumber: payload.pull_request?.number
            });
            if (event === "workflow_run" && payload.workflow_run) task.github.checks.push({
              name: payload.workflow_run.name, conclusion: payload.workflow_run.conclusion,
              url: payload.workflow_run.html_url, completedAt: payload.workflow_run.updated_at
            });
            if (["deployment", "deployment_status"].includes(event)) {
              const deployment = payload.deployment_status || payload.deployment || {};
              task.github.deployments.push({
                environment: deployment.environment || payload.deployment?.environment || "",
                state: deployment.state || payload.action || "updated",
                url: deployment.target_url || deployment.environment_url || "",
                deployedAt: deployment.created_at || new Date()
              });
            }
            task.activity.push(...details.map((d) => ({ ...d, occurredAt: d.occurredAt || new Date() })));
            await task.save();
            req.app.get("io")?.to(`team:${repo.team}`).emit("task:github-update", { taskId: task._id, taskKey: task.taskKey, eventType: event });
          }
        }

        const titleMap = {
          push: "GitHub push received", pull_request: "GitHub pull request updated",
          pull_request_review: "GitHub review updated", issues: "GitHub issue updated",
          issue_comment: "GitHub issue comment received", workflow_run: "GitHub Actions workflow updated",
          check_run: "GitHub check updated", release: "GitHub release updated",
          deployment: "GitHub deployment updated", deployment_status: "Deployment status updated"
        };
        const users = await User.find({ team: repo.team }).select("_id");
        if (users.length) {
          const docs = users.map((u) => ({
            team: repo.team, user: u._id, type: "github",
            title: titleMap[event] || "GitHub activity received",
            message: `${fullName} · ${event}${payload.action ? ` · ${payload.action}` : ""}`,
            link: `github:${repo._id}`
          }));
          await Notification.insertMany(docs);
          for (const doc of docs) req.app.get("io")?.to(`user:${doc.user}`).emit("notification:new", doc);
        }
        await AuditLog.create({
          team: repo.team, action: `github.${event}`, resourceType: "repository",
          resourceId: String(repo._id), summary: `${event} received for ${fullName}`,
          metadata: { deliveryId, action: payload.action }
        });
        req.app.get("io")?.to(`team:${repo.team}`).emit("github:event", {
          eventType: event, action: payload.action, repository: fullName,
          deliveryId, occurredAt: new Date().toISOString()
        });
      }
    }

    storedEvent.status = repo ? "processed" : "ignored";
    storedEvent.processedAt = new Date();
    await storedEvent.save();
    res.status(202).json({ received: true, deliveryId, processed: Boolean(repo) });
  } catch (e) {
    if (storedEvent) {
      storedEvent.status = "failed";
      storedEvent.error = String(e.message || "Webhook processing failed").slice(0, 500);
      storedEvent.processedAt = new Date();
      await storedEvent.save().catch(() => {});
    }
    console.error("GitHub webhook error:", e);
    res.status(400).json({ received: false, message: "Webhook processing failed." });
  }
});

export default router;
