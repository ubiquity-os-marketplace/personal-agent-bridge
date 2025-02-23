import { http, HttpResponse } from "msw";
import { db } from "./db";
import issueTemplate from "./issue-template";
/**
 * Intercepts the routes and returns a custom payload
 */
export const handlers = [
  // get org repos
  http.get("https://api.github.com/orgs/:org/repos", ({ params: { org } }: { params: { org: string } }) =>
    HttpResponse.json(db.repo.findMany({ where: { owner: { login: { equals: org } } } }))
  ),
  // get org repo issues
  http.get("https://api.github.com/repos/:owner/:repo/issues", ({ params: { owner, repo } }) =>
    HttpResponse.json(db.issue.findMany({ where: { owner: { equals: owner as string }, repo: { equals: repo as string } } }))
  ),
  // get issue
  http.get("https://api.github.com/repos/:owner/:repo/issues/:issue_number", ({ params: { owner, repo, issue_number: issueNumber } }) =>
    HttpResponse.json(
      db.issue.findFirst({ where: { owner: { equals: owner as string }, repo: { equals: repo as string }, number: { equals: Number(issueNumber) } } })
    )
  ),
  // get user
  http.get("https://api.github.com/users/:username", ({ params: { username } }) =>
    HttpResponse.json(db.users.findFirst({ where: { login: { equals: username as string } } }))
  ),
  // get repo
  http.get("https://api.github.com/repos/:owner/:repo", ({ params: { owner, repo } }: { params: { owner: string; repo: string } }) => {
    const item = db.repo.findFirst({ where: { name: { equals: repo }, owner: { login: { equals: owner } } } });
    if (!item) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(item);
  }),
  // create issue
  http.post("https://api.github.com/repos/:owner/:repo/issues", () => {
    const id = db.issue.count() + 1;
    const newItem = { ...issueTemplate, id };
    db.issue.create(newItem);
    return HttpResponse.json(newItem);
  }),
  // create comment
  http.post("https://api.github.com/repos/:owner/:repo/issues/:issue_number/comments", async ({ params: { issue_number: issueNumber }, request }) => {
    const { body } = await getValue(request.body);
    const id = db.issueComments.count() + 1;
    const newItem = { id, body, issue_number: Number(issueNumber), user: db.users.getAll()[0] };
    db.issueComments.create(newItem);
    return HttpResponse.json(newItem);
  }),

  http.get("https://api.github.com/repos/:owner/:repo/contents/.github%2Fpersonal-agent.config.yml", () => {
    const content = `GITHUB_PAT_ENCRYPTED: "4tRWEPGv5rUVp1f6TrXPDNzvX-FUtpfupzUQYsZCoDhv0zbV9JkxkVF-NpjAkFhf369P64mKWbbdj356rw0kyBr8pbKM2le8k4cF7BtbslhFyQ7OvKU7_Q1A1uMRcJX3jyyxVYj0xl3KgmBf1WuPpHtPIvErh8ybjMWpnM8mPAVa7HD3sBE_KyPi1tQqLEw4Zg"`;
    return HttpResponse.text(content);
  }),

  http.post("https://api.github.com/repos/:owner/:repo/actions/workflows/compute.yml/dispatches", () => {
    return new HttpResponse(null, {
      status: 204,
    });
  }),
];

async function getValue(body: ReadableStream<Uint8Array> | null) {
  if (body) {
    const reader = body.getReader();
    const streamResult = await reader.read();
    if (!streamResult.done) {
      const text = new TextDecoder().decode(streamResult.value);
      try {
        return JSON.parse(text);
      } catch (error) {
        console.error("Failed to parse body as JSON", error);
      }
    }
  }
}
