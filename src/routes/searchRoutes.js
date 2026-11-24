import express from "express";
import { auth } from "../middleware/auth.js";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import Repository from "../models/Repository.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Note from "../models/Note.js";
import Report from "../models/Report.js";

const router = express.Router();
router.use(auth);

router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 120);
    if (q.length < 2) return res.json({ success: true, query: q, results: [] });
    const team = req.user.team?._id;
    if (!team) return res.status(403).json({ success: false, message: "Workspace membership required." });
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const [tasks, projects, repositories, users, messages, notes, reports] = await Promise.all([
      Task.find({ team, $or: [{ title: regex }, { taskKey: regex }, { description: regex }] }).select("title taskKey status priority").limit(8).lean(),
      Project.find({ team, $or: [{ name: regex }, { description: regex }] }).select("name status").limit(6).lean(),
      Repository.find({ team, $or: [{ fullName: regex }, { description: regex }] }).select("fullName url language").limit(6).lean(),
      User.find({ team, $or: [{ name: regex }, { email: regex }] }).select("name email role avatar").limit(6).lean(),
      Message.find({ team, text: regex }).select("text type channel createdAt").sort({ createdAt: -1 }).limit(6).lean(),
      Note.find({team,$or:[{title:regex},{content:regex},{tags:regex}]}).select("title category projectId").limit(6).lean(),
      Report.find({team,title:regex}).select("title format projectId").limit(6).lean()
    ]);
    const results = [
      ...tasks.map((x) => ({ type: "task", id: x._id, title: `${x.taskKey || "TASK"} · ${x.title}`, subtitle: `${x.status} · ${x.priority}`, target: "tasks" })),
      ...projects.map((x) => ({ type: "project", id: x._id, title: x.name, subtitle: x.status, target: "projects" })),
      ...repositories.map((x) => ({ type: "repository", id: x._id, title: x.fullName, subtitle: x.language || "GitHub repository", url: x.url, target: "github" })),
      ...users.map((x) => ({ type: "user", id: x._id, title: x.name, subtitle: x.email, target: "team" })),
      ...notes.map(x=>({type:"note",id:x._id,title:x.title,subtitle:x.category,target:"notes"})),
      ...reports.map(x=>({type:"report",id:x._id,title:x.title,subtitle:x.format,target:"reports"})),
      ...messages.map((x) => ({ type: "message", id: x._id, title: x.text.slice(0, 120), subtitle: `${x.type} · ${x.channel || "direct"}`, target: "chat" }))
    ];
    res.json({ success: true, query: q, results });
  } catch (error) {
    res.status(500).json({ success: false, message: "Search failed." });
  }
});

export default router;
