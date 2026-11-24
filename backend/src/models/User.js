import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    githubId: { type: String, unique: true, sparse: true },
    githubLogin: { type: String, default: "" },
    githubAccessToken: { type: String, default: "" },
    githubAppConnected: { type: Boolean, default: false },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
    role: {
      type: String,
      enum: ["leader", "manager", "team_leader", "developer", "designer", "viewer"],
      default: "developer",
    },
    verified: { type: Boolean, default: false },
    avatar: String,
    preferences: {
      theme: { type: String, enum: ["system", "dark", "light", "cloud"], default: "dark" },
      aiPermissions: { type: Map, of: Boolean, default: {} },
      emailNotifications: { type: Boolean, default: true },
      desktopNotifications: { type: Boolean, default: true },
    },
    otpHash: String,
    otpExpiresAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
