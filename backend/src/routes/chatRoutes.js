import express from "express";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();
router.use(auth);

const populate = (query) =>
  query.populate("sender", "name role avatar").populate("recipient", "name role avatar");

router.get("/group/:channel", async (req, res) => {
  try {
    if (!req.user?.team?._id) return res.status(403).json({ success: false, message: "User is not assigned to a team" });
    const channel = String(req.params.channel || "general").trim().toLowerCase();
    const messages = await populate(
      Message.find({ team: req.user.team._id, type: "group", channel }).sort({ createdAt: 1 }).limit(300)
    );
    res.json({ success: true, messages });
  } catch (error) {
    console.error("Group chat error:", error);
    res.status(500).json({ success: false, message: "Failed to load group messages" });
  }
});

router.get("/dm/:userId", async (req, res) => {
  try {
    const me = req.user._id;
    const peer = await User.findOne({ _id: req.params.userId, team: req.user.team._id }).select("_id name email role avatar");
    if (!peer) return res.status(404).json({ success: false, message: "Team member not found" });

    const messages = await populate(
      Message.find({
        team: req.user.team._id,
        type: "direct",
        $or: [
          { sender: me, recipient: peer._id },
          { sender: peer._id, recipient: me },
        ],
      }).sort({ createdAt: 1 }).limit(300)
    );
    res.json({ success: true, messages, peer });
  } catch (error) {
    console.error("Direct chat error:", error);
    res.status(500).json({ success: false, message: "Failed to load private messages" });
  }
});

// Backward-compatible group endpoint.
router.get("/:channel", async (req, res) => {
  try {
    const messages = await populate(
      Message.find({ team: req.user.team._id, type: "group", channel: String(req.params.channel).trim() })
        .sort({ createdAt: 1 }).limit(300)
    );
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load messages" });
  }
});

export default router;
