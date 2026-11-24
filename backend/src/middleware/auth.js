import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Authentication required" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId).populate("team", "name teamId settings");
    if (!user) return res.status(401).json({ message: "Account not found" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired session" });
  }
}

export function roles(...allowed) {
  return (req, res, next) => allowed.includes(req.user.role) ? next() : res.status(403).json({ message: "You do not have permission for this action" });
}
