import { App } from "@octokit/app";

let cachedApp = null;

function config() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !privateKey) {
    throw new Error("GitHub App is not configured. Add GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY to backend/.env");
  }
  return { appId, privateKey };
}

export function getGithubApp() {
  if (!cachedApp) {
    const { appId, privateKey } = config();
    cachedApp = new App({ appId, privateKey });
  }
  return cachedApp;
}

export async function getInstallationOctokit(installationId) {
  if (!installationId) throw new Error("GitHub installation ID is required");
  return getGithubApp().getInstallationOctokit(Number(installationId));
}

export async function getInstallation(installationId) {
  const app = getGithubApp();
  const response = await app.octokit.request("GET /app/installations/{installation_id}", {
    installation_id: Number(installationId),
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return response.data;
}

export function getInstallUrl(state = "") {
  const base = process.env.GITHUB_APP_INSTALL_URL || "https://github.com/apps/devintelligenceproject/installations/new";
  if (!state) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}state=${encodeURIComponent(state)}`;
}
