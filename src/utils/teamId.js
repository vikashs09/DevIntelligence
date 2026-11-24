import crypto from "node:crypto";
export function makeTeamId() {
  return `TEAM-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}
