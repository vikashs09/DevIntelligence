import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", index: true },
    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    owner: { type: String, required: true },
    name: { type: String, required: true },
    fullName: { type: String, required: true },
    githubId: { type: Number, index: true },
    installationId: { type: Number, index: true },
    url: String,
    description: String,
    private: Boolean,
    fork: Boolean,
    parentFullName: String,
    sourceFullName: String,
    defaultBranch: String,
    language: String,
    license: String,
    topics: [String],
    stars: Number,
    forks: Number,
    watchers: Number,
    openIssues: Number,
    totalIssues: Number,
    openPullRequests: Number,
    totalPullRequests: Number,
    mergedPullRequests: Number,
    commitCount: Number,
    recentCommits30d: { type: Number, default: 0 },
    lastSynced: Date,
  },
  { timestamps: true }
);

schema.index({ team: 1, fullName: 1 }, { unique: true });
export default mongoose.model("Repository", schema);
