import express from "express";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Repository from "../models/Repository.js";
import Notification from "../models/Notification.js";
import AuditLog from "../models/AuditLog.js";
import { auth, roles } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();
router.use(auth);

router.get("/", requirePermission("task.view"), async (req, res) => {
  try {
    const tasks = await Task.find({ team: req.user.team._id })
      .populate("assignee", "name email role avatar")
      .populate("project", "name")
      .populate("github.repository", "fullName url")
      .sort({ updatedAt: -1 }).limit(500);
    res.json({ success: true, tasks });
  } catch {
    res.status(500).json({ success: false, message: "Unable to load tasks." });
  }
});

router.post("/", requirePermission("task.create"), async (req, res) => {
  try {
    const teamId = req.user.team._id;
    const { title, description, status, priority, assignee, dueDate, project } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, message: "Task title is required." });
    let assignedUser = null;
    if (assignee) {
      assignedUser = await User.findOne({ _id: assignee, team: teamId }).select("_id name email role");
      if (!assignedUser) return res.status(400).json({ success: false, message: "Assignee is not a workspace member." });
    }
    if (project && !(await Project.exists({ _id: project, team: teamId }))) {
      return res.status(400).json({ success: false, message: "Project does not belong to this workspace." });
    }
    let sequence = await Task.countDocuments({ team: teamId }) + 1;
    let taskKey = `TASK-${String(sequence).padStart(3, "0")}`;
    while (await Task.exists({ team: teamId, taskKey })) {
      sequence += 1;
      taskKey = `TASK-${String(sequence).padStart(3, "0")}`;
    }
    const task = await Task.create({
      team: teamId, createdBy: req.user._id,
      taskKey,
      title: title.trim(), description: description || "",
      status: ["todo", "in_progress", "review", "done"].includes(status) ? status : "todo",
      priority: ["low", "medium", "high", "critical"].includes(priority) ? priority : "medium",
      assignee: assignedUser?._id, dueDate: dueDate || null, project: project || undefined
    });
    if (assignedUser && String(assignedUser._id) !== String(req.user._id)) {
      await Notification.create({ team: teamId, user: assignedUser._id, type: "task_assigned",
        title: `${req.user.name} assigned you a task`, message: `${task.taskKey} · ${task.title}`, link: `task:${task._id}` });
    }
    await AuditLog.create({ team: teamId, actor: req.user._id, action: "task.created",
      resourceType: "task", resourceId: String(task._id), summary: `Created ${task.taskKey}` });
    const populated = await task.populate([{ path: "assignee", select: "name email role avatar" }, { path: "project", select: "name" }]);
    req.app.get("io")?.to(`team:${teamId}`).emit("task:created", populated);
    res.status(201).json({ success: true, task: populated });
  } catch (e) {
    res.status(500).json({ success: false, message: e.code === 11000 ? "Task key collision. Please retry." : "Unable to create task." });
  }
});

router.get("/dependencies/graph", requirePermission("task.view"), async (req, res) => {
  try {
    const tasks = await Task.find({ team: req.user.team._id }).select("taskKey title status blockedBy").lean();
    res.json({ success: true, nodes: tasks.map((t) => ({ id: String(t._id), key: t.taskKey, title: t.title, status: t.status })),
      edges: tasks.flatMap((t) => (t.blockedBy || []).map((dependency) => ({ from: String(dependency), to: String(t._id), type: "blocks" }))) });
  } catch {
    res.status(500).json({ success: false, message: "Unable to load task dependencies." });
  }
});

router.get("/:id/timeline", async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, team: req.user.team._id }).select("activity github taskKey");
  if (!task) return res.status(404).json({ success: false, message: "Task not found." });
  const timeline = [...(task.activity || [])].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  res.json({ success: true, taskKey: task.taskKey, timeline, github: task.github });
});

router.get("/:id", async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, team: req.user.team._id })
    .populate("assignee", "name email role avatar").populate("project", "name")
    .populate("github.repository", "fullName url");
  if (!task) return res.status(404).json({ success: false, message: "Task not found." });
  res.json({ success: true, task });
});

router.patch("/:id", requirePermission("task.update"), async (req, res) => {
  try {
    const teamId = req.user.team._id;
    const task = await Task.findOne({ _id: req.params.id, team: teamId });
    if (!task) return res.status(404).json({ success: false, message: "Task not found." });
    if (req.body.assignee !== undefined) {
      if (req.body.assignee) {
        const member = await User.findOne({ _id: req.body.assignee, team: teamId }).select("_id");
        if (!member) return res.status(400).json({ success: false, message: "Assignee is not a workspace member." });
      }
      task.assignee = req.body.assignee || null;
    }
    for (const key of ["title", "description", "status", "priority", "dueDate", "project"]) {
      if (req.body[key] !== undefined) task[key] = req.body[key];
    }
    if (req.body.project && !(await Project.exists({ _id: req.body.project, team: teamId }))) {
      return res.status(400).json({ success: false, message: "Project does not belong to this workspace." });
    }
    if (req.body.blockedBy !== undefined) {
      if (!Array.isArray(req.body.blockedBy)) return res.status(400).json({ success: false, message: "blockedBy must be an array." });
      const ids = [...new Set(req.body.blockedBy.map(String))];
      if (ids.includes(String(task._id))) return res.status(400).json({ success: false, message: "A task cannot depend on itself." });
      const valid = await Task.countDocuments({ _id: { $in: ids }, team: teamId });
      if (valid !== ids.length) return res.status(400).json({ success: false, message: "All dependencies must belong to this workspace." });
      task.blockedBy = ids;
    }
    if (req.body.github !== undefined) {
      const g = req.body.github || {};
      task.github = task.github || {};
      if (g.repositoryId) {
        const repository = await Repository.findOne({ _id: g.repositoryId, team: teamId });
        if (!repository) return res.status(400).json({ success: false, message: "Repository does not belong to this workspace." });
        task.github.repository = repository._id;
        task.github.repositoryFullName = repository.fullName;
      }
      if (g.branch !== undefined) task.github.branch = String(g.branch).trim().slice(0, 255);
    }
    await task.save();
    await AuditLog.create({ team: teamId, actor: req.user._id, action: "task.updated",
      resourceType: "task", resourceId: String(task._id), summary: `Updated ${task.taskKey}` });
    const populated = await task.populate([{ path: "assignee", select: "name email role avatar" },
      { path: "project", select: "name" }, { path: "github.repository", select: "fullName url" }]);
    req.app.get("io")?.to(`team:${teamId}`).emit("task:updated", populated);
    res.json({ success: true, task: populated });
  } catch {
    res.status(500).json({ success: false, message: "Unable to update task." });
  }
});

router.delete("/:id", roles("leader", "manager", "team_leader"), async (req, res) => {
  const task = await Task.findOneAndDelete({ _id: req.params.id, team: req.user.team._id });
  if (!task) return res.status(404).json({ success: false, message: "Task not found." });
  await AuditLog.create({ team: req.user.team._id, actor: req.user._id, action: "task.deleted",
    resourceType: "task", resourceId: String(task._id), summary: `Deleted ${task.taskKey}` });
  req.app.get("io")?.to(`team:${req.user.team._id}`).emit("task:deleted", { taskId: task._id });
  res.json({ success: true, message: "Task deleted." });
});

export default router;
