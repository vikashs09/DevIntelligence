export function calculateHealth({
  tasks = [],
  openIssues = 0,
  totalIssues = 0,
  openPullRequests = 0,
  totalPullRequests = 0,
  mergedPullRequests = 0,
  recentCommits30d = 0,
}) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const overdue = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done"
  ).length;
  const highRiskTasks = tasks.filter(
    (t) => ["high", "critical"].includes(t.priority) && t.status !== "done"
  ).length;

  const taskCompletion = totalTasks ? (completedTasks / totalTasks) * 100 : 0;
  const overdueRate = totalTasks ? (overdue / totalTasks) * 100 : 0;
  const taskScore = totalTasks
    ? Math.max(0, Math.min(100, taskCompletion - overdueRate * 0.5))
    : 0;

  // Target: 20 meaningful commits per 30-day window.
  const githubActivity = Math.min(100, (recentCommits30d / 20) * 100);

  const issueScore = totalIssues
    ? Math.max(0, 100 - (openIssues / totalIssues) * 100)
    : 0;

  const prScore = totalPullRequests
    ? Math.min(100, Math.max(0, (mergedPullRequests / totalPullRequests) * 100))
    : 0;

  const hasData = Boolean(totalTasks || totalIssues || totalPullRequests || recentCommits30d);
  const score = hasData
    ? Math.round(taskScore * 0.4 + githubActivity * 0.25 + issueScore * 0.2 + prScore * 0.15)
    : 0;

  const risks = [];
  if (overdue) risks.push({ severity: "high", title: `${overdue} overdue task${overdue > 1 ? "s" : ""}`, detail: "Deadline pressure is reducing delivery evidence." });
  if (highRiskTasks) risks.push({ severity: "medium", title: `${highRiskTasks} high-priority task${highRiskTasks > 1 ? "s" : ""} still open`, detail: "Review ownership, blockers and due dates." });
  if (totalIssues && openIssues / totalIssues > 0.3) risks.push({ severity: "medium", title: "Open issue ratio is elevated", detail: `${openIssues} of ${totalIssues} tracked issues are open.` });
  if (totalPullRequests && openPullRequests / totalPullRequests > 0.35) risks.push({ severity: "medium", title: "PR queue is growing", detail: `${openPullRequests} pull requests remain open.` });
  if (!recentCommits30d) risks.push({ severity: "medium", title: "No recent GitHub activity", detail: "Sync a repository to refresh development signals." });

  return {
    score: Math.max(0, Math.min(100, score)),
    taskScore: Math.round(taskScore),
    githubActivity: Math.round(githubActivity),
    issueScore: Math.round(issueScore),
    prScore: Math.round(prScore),
    completedTasks,
    totalTasks,
    overdue,
    highRiskTasks,
    recentCommits30d,
    risks,
    hasData,
    weights: { task: 40, github: 25, issues: 20, prs: 15 },
  };
}
