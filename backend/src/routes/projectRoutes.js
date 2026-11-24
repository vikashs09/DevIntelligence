import express from "express";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Repository from "../models/Repository.js";
import Note from "../models/Note.js";
import Report from "../models/Report.js";
import FileMetric from "../models/FileMetric.js";
import AuditLog from "../models/AuditLog.js";
import { auth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();
router.use(auth);

router.get("/", requirePermission("project.view"), async (req, res) => {
  const projects = await Project.find({ team: req.user.team._id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, projects });
});

router.post("/", requirePermission("project.create"), async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name || name.length > 120) return res.status(400).json({ success: false, message: "Project name is required (max 120 characters)." });
  const project = await Project.create({
    team: req.user.team._id, createdBy: req.user._id, name,
    description: String(req.body.description || "").slice(0, 5000),
    status: ["planning", "active", "on_hold", "completed"].includes(req.body.status) ? req.body.status : "planning",
    githubOwner: String(req.body.githubOwner || "").slice(0, 100),
    githubRepo: String(req.body.githubRepo || "").slice(0, 100)
  });
  await AuditLog.create({ team: req.user.team._id, actor: req.user._id, action: "project.created",
    resourceType: "project", resourceId: String(project._id), summary: `Created project ${project.name}` });
  req.app.get("io")?.to(`team:${req.user.team._id}`).emit("project:created", project);
  res.status(201).json({ success: true, project });
});

router.patch("/:id", requirePermission("project.update"), async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, team: req.user.team._id });
  if (!project) return res.status(404).json({ success: false, message: "Project not found." });
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name || name.length > 120) return res.status(400).json({ success: false, message: "Invalid project name." });
    project.name = name;
  }
  if (req.body.description !== undefined) project.description = String(req.body.description).slice(0, 5000);
  if (req.body.status !== undefined) {
    if (!["planning", "active", "on_hold", "completed"].includes(req.body.status)) return res.status(400).json({ success: false, message: "Invalid project status." });
    project.status = req.body.status;
  }
  if (req.body.githubOwner !== undefined) project.githubOwner = String(req.body.githubOwner).slice(0, 100);
  if (req.body.githubRepo !== undefined) project.githubRepo = String(req.body.githubRepo).slice(0, 100);
  await project.save();
  // Keep repository/project associations consistent when a GitHub link is removed.
  if (req.body.githubOwner === "" && req.body.githubRepo === "") {
    await Repository.updateMany({ team: req.user.team._id, project: project._id }, { $unset: { project: 1 } });
  }
  await AuditLog.create({ team: req.user.team._id, actor: req.user._id, action: "project.updated",
    resourceType: "project", resourceId: String(project._id), summary: `Updated project ${project.name}` });
  req.app.get("io")?.to(`team:${req.user.team._id}`).emit("project:updated", project);
  res.json({ success: true, project });
});

router.delete("/:id", requirePermission("project.delete"), async (req, res) => {
  const project = await Project.findOneAndDelete({ _id: req.params.id, team: req.user.team._id });
  if (!project) return res.status(404).json({ success: false, message: "Project not found." });
  await Task.updateMany({ project: project._id, team: req.user.team._id }, { $unset: { project: 1 } });
  await Repository.updateMany({ project: project._id, team: req.user.team._id }, { $unset: { project: 1 } });
  await Note.updateMany({ projectId: project._id, team: req.user.team._id }, { $unset: { projectId: 1 } });
  await Report.updateMany({ projectId: project._id, team: req.user.team._id }, { $unset: { projectId: 1 } });
  await FileMetric.updateMany({ project: project._id, team: req.user.team._id }, { $unset: { project: 1 } });
  await AuditLog.create({ team: req.user.team._id, actor: req.user._id, action: "project.deleted",
    resourceType: "project", resourceId: String(project._id), summary: `Deleted project ${project.name}` });
  req.app.get("io")?.to(`team:${req.user.team._id}`).emit("project:deleted", { projectId: project._id });
  res.json({ success: true, message: "Project deleted." });
});

export default router;
