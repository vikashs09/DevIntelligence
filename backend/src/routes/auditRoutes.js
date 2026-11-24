import express from "express";
import { auth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import AuditLog from "../models/AuditLog.js";

const router = express.Router();
router.use(auth, requirePermission("audit.view"));
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const logs = await AuditLog.find({ team: req.user.team?._id })
      .populate("actor", "name email avatar")
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    res.json({ success: true, logs, page, limit });
  } catch {
    res.status(500).json({ success: false, message: "Unable to load audit logs." });
  }
});
export default router;
