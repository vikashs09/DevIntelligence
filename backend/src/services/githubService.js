const GITHUB_API = "https://api.github.com";

async function githubRequest(endpoint) {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is missing in backend/.env");
  }

  const response = await fetch(`${GITHUB_API}${endpoint}`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `GitHub API Error ${response.status}: ${errorText}`
    );
  }

  return response.json();
}

export async function getGithubUser() {
  return githubRequest("/user");
}

export async function getRepositories() {
  return githubRequest(
    "/user/repos?per_page=100&sort=updated"
  );
}

export async function getRepository(owner, repo) {
  return githubRequest(`/repos/${owner}/${repo}`);
}

export async function getPullRequests(owner, repo) {
  return githubRequest(
    `/repos/${owner}/${repo}/pulls?state=all&per_page=100`
  );
}

export async function getIssues(owner, repo) {
  return githubRequest(
    `/repos/${owner}/${repo}/issues?state=all&per_page=100`
  );
}

export async function getCommits(owner, repo) {
  return githubRequest(
    `/repos/${owner}/${repo}/commits?per_page=100`
  );
}