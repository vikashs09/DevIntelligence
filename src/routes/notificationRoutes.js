import express from "express";
import Notification from "../models/Notification.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();
router.use(auth);

router.get("/", async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id, team: req.user.team._id })
    .sort({ createdAt: -1 }).limit(100);
  const unread = await Notification.countDocuments({ user: req.user._id, team: req.user.team._id, read: false });
  res.json({ success: true, notifications, unread });
});

router.patch("/:id/read", async (req, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id, team: req.user.team._id },
    { read: true },
    { new: true }
  );
  if (!n) return res.status(404).json({ success: false, message: "Notification not found" });
  res.json({ success: true, notification: n });
});

router.patch("/read-all", async (req, res) => {
  await Notification.updateMany({ user: req.user._id, team: req.user.team._id, read: false }, { read: true });
  res.json({ success: true });
});

export default router;
