import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    type: { type: String, enum: ["group", "direct"], default: "group", index: true },
    channel: { type: String, default: "general", trim: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    text: { type: String, required: true, maxlength: 4000, trim: true },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    edited: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ team: 1, type: 1, channel: 1, createdAt: -1 });
messageSchema.index({ team: 1, type: 1, sender: 1, recipient: 1, createdAt: -1 });

export default mongoose.model("Message", messageSchema);
