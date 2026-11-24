import mongoose from "mongoose";

const schema = new mongoose.Schema({
  team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  color: { type: String, enum: ["blue", "violet", "teal", "rose", "slate"], default: "blue" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
schema.index({ team: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
export default mongoose.model("NoteFolder", schema);
