import mongoose from "mongoose";

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  teamId: { type: String, required: true, unique: true, uppercase: true, index: true },
  description: { type: String, default: "" },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  settings: {
    allowMemberInvites: { type: Boolean, default: false },
    chatEnabled: { type: Boolean, default: true },
    aiEnabled: { type: Boolean, default: true },
    aiPermissions: { type: Map, of: Boolean, default: {} }
  },
  createdAt: { type: Date, default: Date.now }
});
export default mongoose.model("Team", teamSchema);
