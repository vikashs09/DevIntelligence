const roleAliases = {
  leader: "owner", team_leader: "manager", manager: "manager",
  developer: "developer", designer: "developer", viewer: "viewer",
  owner: "owner", admin: "admin"
};

const grants = {
  owner: ["*"],
  admin: ["*"],
  manager: ["workspace.view","project.view","project.create","project.update","project.delete","task.view","task.create","task.update","task.assign","repository.view","repository.connect","team.view","team.manage","chat.view","chat.send","analytics.view","ai.use","members.invite","audit.view"],
  developer: ["workspace.view","project.view","task.view","task.create","task.update","repository.view","chat.view","chat.send","analytics.view","ai.use"],
  viewer: ["workspace.view","project.view","task.view","repository.view","chat.view","analytics.view"]
};

export function requirePermission(permission) {
  return (req, res, next) => {
    const role = roleAliases[req.user?.role] || "viewer";
    const allowed = grants[role] || grants.viewer;
    if (allowed.includes("*") || allowed.includes(permission)) return next();
    return res.status(403).json({ success: false, code: "FORBIDDEN", message: `Missing permission: ${permission}` });
  };
}

export function canRole(role, permission) {
  const normalized = roleAliases[role] || "viewer";
  const allowed = grants[normalized] || grants.viewer;
  return allowed.includes("*") || allowed.includes(permission);
}
