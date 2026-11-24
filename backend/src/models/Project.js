import mongoose from "mongoose";
const projectSchema = new mongoose.Schema({
  team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: String,
  status: { type: String, enum: ["planning", "active", "on_hold", "completed"], default: "planning" },
  aiPermissions: { type: Map, of: Boolean, default: {} },
  githubOwner: String,
  githubRepo: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now }
});
export default mongoose.model("Project", projectSchema);
