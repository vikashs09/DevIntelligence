import mongoose from "mongoose";

const schema = new mongoose.Schema({
  team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  action: { type: String, required: true, index: true },
  resourceType: String,
  resourceId: String,
  summary: String,
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  requestId: String
}, { timestamps: true });

schema.index({ team: 1, createdAt: -1 });
export default mongoose.model("AuditLog", schema);
