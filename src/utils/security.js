import crypto from "node:crypto";
export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
export function makeOtp() { return String(crypto.randomInt(100000, 1000000)); }
