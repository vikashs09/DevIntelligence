import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    installationId: { type: Number, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", index: true },
    accountId: { type: Number },
    accountLogin: { type: String, required: true, index: true },
    accountType: { type: String, enum: ["User", "Organization"], default: "User" },
    repositorySelection: { type: String, default: "selected" },
    permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
    suspendedAt: Date,
    lastVerifiedAt: Date,
  },
  { timestamps: true }
);

schema.index({ team: 1, accountLogin: 1 });
export default mongoose.model("GitHubInstallation", schema);
