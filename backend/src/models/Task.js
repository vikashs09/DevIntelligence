import mongoose from "mongoose";

const taskSchema = new mongoose.Schema({
  team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true, index: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", index: true },
  title: { type: String, required: true, trim: true, maxlength: 240 },
  description: { type: String, default: "", maxlength: 10000 },
  status: { type: String, enum: ["todo", "in_progress", "review", "done"], default: "todo", index: true },
  priority: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium", index: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  blockedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
  dueDate: Date,
  taskKey: { type: String, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  // Engineering traceability. External identifiers are stored as strings to preserve provider formats.
  github: {
    repository: { type: mongoose.Schema.Types.ObjectId, ref: "Repository" },
    repositoryFullName: String,
    branch: String,
    commits: [{ sha: String, message: String, url: String, author: String, committedAt: Date }],
    pullRequests: [{ number: Number, title: String, url: String, state: String, mergedAt: Date }],
    reviews: [{ state: String, reviewer: String, submittedAt: Date, pullRequestNumber: Number }],
    checks: [{ name: String, conclusion: String, url: String, completedAt: Date }],
    deployments: [{ environment: String, state: String, url: String, deployedAt: Date }]
  },
  activity: [{
    type: { type: String },
    message: String,
    sourceUrl: String,
    actor: String,
    occurredAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

taskSchema.index({ team: 1, "github.repositoryFullName": 1, "github.branch": 1 });
export default mongoose.model("Task", taskSchema);
