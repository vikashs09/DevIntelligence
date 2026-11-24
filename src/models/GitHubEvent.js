import mongoose from "mongoose";

const schema = new mongoose.Schema({
  deliveryId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true, index: true },
  action: String,
  repositoryId: Number,
  repositoryFullName: String,
  installationId: Number,
  team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", index: true },
  status: { type: String, enum: ["received", "processed", "ignored", "failed"], default: "received", index: true },
  receivedAt: { type: Date, default: Date.now },
  processedAt: Date,
  error: String,
  payload: { type: mongoose.Schema.Types.Mixed, select: false }
}, { timestamps: true });

schema.index({ repositoryFullName: 1, receivedAt: -1 });
export default mongoose.model("GitHubEvent", schema);
