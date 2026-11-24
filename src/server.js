import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "node:http";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";

import { connectDB } from "./config/db.js";
import User from "./models/User.js";
import Message from "./models/Message.js";
import Notification from "./models/Notification.js";

import authRoutes from "./routes/authRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import githubRoutes from "./routes/githubRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import noteRoutes from "./routes/noteRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import graphRoutes from "./routes/graphRoutes.js";
import aiPermissionRoutes from "./routes/aiPermissionRoutes.js";

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 5000);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use((req, res, next) => {
  const requestId = req.headers["x-request-id"]?.toString().slice(0, 100) || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
const rateBuckets = new Map();
app.use("/api", (req, res, next) => {
  const now = Date.now();
  const key = `${req.ip}:${req.path.startsWith("/auth") ? "auth" : "api"}`;
  const windowMs = 60_000;
  const limit = req.path.startsWith("/auth") ? 35 : 240;
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > windowMs) bucket = { start: now, count: 0 };
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > limit) return res.status(429).json({ success: false, code: "RATE_LIMITED", message: "Too many requests. Please retry shortly.", requestId });
  if (rateBuckets.size > 5000) for (const [k, v] of rateBuckets) if (now - v.start > windowMs) rateBuckets.delete(k);
  next();
});
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) =>
  res.json({ ok: true, service: "Dev Intelligence", time: new Date().toISOString() })
);

// Webhook must stay before JSON parsing for raw signature verification.
app.set("io", io);
app.use("/api/webhooks", webhookRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/graph", graphRoutes);
app.use("/api/ai-permissions", aiPermissionRoutes);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId).populate("team", "name teamId settings");
    if (!user) return next(new Error("Unauthorized"));
    if (!user.team) return next(new Error("User is not assigned to a team"));

    socket.user = user;
    next();
  } catch (error) {
    console.error("Socket authentication error:", error.message);
    next(new Error("Unauthorized"));
  }
});

function teamRoom(teamId) {
  return `team:${teamId}`;
}
function groupRoom(teamId, channel) {
  return `team:${teamId}:group:${channel}`;
}
function dmRoom(teamId, a, b) {
  const ids = [String(a), String(b)].sort();
  return `team:${teamId}:dm:${ids[0]}:${ids[1]}`;
}

io.on("connection", (socket) => {
  const teamId = socket.user.team._id.toString();
  socket.join(teamRoom(teamId));

  console.log(`🟢 Socket connected: ${socket.user.name} (${socket.id})`);

  socket.on("join-room", ({ type = "group", channel = "general", peerId } = {}) => {
    const room = type === "direct"
      ? (peerId ? dmRoom(teamId, socket.user._id, peerId) : null)
      : groupRoom(teamId, String(channel).trim().toLowerCase());

    if (!room) return;
    socket.join(room);
    socket.emit("room:joined", { room, type, channel, peerId });
  });

  socket.on("leave-room", ({ type = "group", channel = "general", peerId } = {}) => {
    const room = type === "direct"
      ? (peerId ? dmRoom(teamId, socket.user._id, peerId) : null)
      : groupRoom(teamId, String(channel).trim().toLowerCase());
    if (room) socket.leave(room);
  });

  // Backward compatibility with the previous chat client.
  socket.on("join-channel", (channel = "general") => {
    socket.join(groupRoom(teamId, String(channel).trim().toLowerCase()));
  });
  socket.on("leave-channel", (channel = "general") => {
    socket.leave(groupRoom(teamId, String(channel).trim().toLowerCase()));
  });

  socket.on("send-message", async ({ type = "group", channel = "general", peerId, text, mentions = [] } = {}, ack) => {
    try {
      if (socket.user.team.settings?.chatEnabled === false) {
        return ack?.({ success: false, message: "Team chat is disabled." });
      }

      const cleanText = String(text || "").trim();
      if (!cleanText) return ack?.({ success: false, message: "Message cannot be empty." });
      if (cleanText.length > 4000) return ack?.({ success: false, message: "Message cannot exceed 4000 characters." });

      let recipient = null;
      let room;

      if (type === "direct") {
        if (!peerId) return ack?.({ success: false, message: "A recipient is required." });
        recipient = await User.findOne({ _id: peerId, team: teamId }).select("_id name email role avatar");
        if (!recipient) return ack?.({ success: false, message: "Recipient is not a team member." });
        room = dmRoom(teamId, socket.user._id, recipient._id);
      } else {
        const safeChannel = String(channel || "general").trim().toLowerCase();
        room = groupRoom(teamId, safeChannel);
        channel = safeChannel;
      }

      const validMentions = Array.isArray(mentions)
        ? [...new Set(mentions.map(String))].filter((id) => id !== String(socket.user._id))
        : [];

      const teamMentionUsers = await User.find({
        _id: { $in: validMentions },
        team: teamId,
      }).select("_id name role avatar");

      const message = await Message.create({
        team: teamId,
        type: type === "direct" ? "direct" : "group",
        channel: type === "group" ? channel : "",
        sender: socket.user._id,
        recipient: recipient?._id || null,
        text: cleanText,
        mentions: teamMentionUsers.map((u) => u._id),
      });

      const populated = await message.populate([
        { path: "sender", select: "name role avatar" },
        { path: "recipient", select: "name role avatar" },
      ]);

      io.to(room).emit("message:new", populated);

      if (teamMentionUsers.length) {
        const docs = teamMentionUsers.map((member) => ({
          team: teamId,
          user: member._id,
          type: "mention",
          title: `${socket.user.name} mentioned you`,
          message: cleanText,
          link: `chat:${type === "group" ? channel : recipient?._id}`,
        }));
        await Notification.insertMany(docs);
        for (const member of teamMentionUsers) {
          io.to(`user:${member._id}`).emit("notification:new", docs.find((d) => String(d.user) === String(member._id)));
        }
      }

      ack?.({ success: true, message: populated });
    } catch (error) {
      console.error("Send message error:", error);
      ack?.({ success: false, message: error.message || "Failed to send message." });
    }
  });

  socket.join(`user:${socket.user._id}`);

  socket.on("disconnect", (reason) => {
    console.log(`🔴 Socket disconnected: ${socket.user.name} - ${reason}`);
  });
});

async function start() {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log("==========================================");
      console.log("       DEV INTELLIGENCE SERVER");
      console.log("==========================================");
      console.log(`🚀 API: http://localhost:${PORT}`);
      console.log(`🔌 Socket.IO: http://localhost:${PORT}`);
      console.log(`🌐 Client: ${CLIENT_URL}`);
      console.log("==========================================");
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

start();
