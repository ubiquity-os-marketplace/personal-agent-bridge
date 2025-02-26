import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { drop } from "@mswjs/data";
import { CommentHandler } from "@ubiquity-os/plugin-sdk";
import { customOctokit as Octokit } from "@ubiquity-os/plugin-sdk/octokit";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import { http, HttpResponse } from "msw";
import manifest from "../manifest.json";
import { runPlugin } from "../src/index";
import { Env } from "../src/types";
import { Context } from "../src/types/context";
import { db } from "./__mocks__/db";
import { createComment, setupTests } from "./__mocks__/helpers";
import { server } from "./__mocks__/node";
import { STRINGS } from "./__mocks__/strings";

const octokit = new Octokit();
const commentCreateEvent = "issue_comment.created";

beforeAll(() => {
  server.listen();
});
afterEach(() => {
  server.resetHandlers();
  jest.clearAllMocks();
});
afterAll(() => server.close());

describe("Personal Agent Bridge Plugin tests", () => {
  beforeEach(async () => {
    drop(db);
    await setupTests();
  });

  it("Should serve the manifest file", async () => {
    const worker = (await import("../src/worker")).default;
    const response = await worker.fetch(new Request("http://localhost/manifest.json"), {} as Env);
    const content = await response.json();
    expect(content).toEqual(manifest);
  });

  it("Should handle personal agent command", async () => {
    const { context, errorSpy, okSpy, infoSpy, verboseSpy } = createContext();

    expect(context.eventName).toBe(commentCreateEvent);

    await runPlugin(context);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenNthCalledWith(1, `Comment received:`, {
      caller: STRINGS.CALLER_LOGS_ANON,
      personalAgentOwner: STRINGS.personalAgentOwner,
      owner: STRINGS.USER,
      comment: STRINGS.commentBody,
    });
    expect(okSpy).toHaveBeenNthCalledWith(1, `Successfully sent the command to ${STRINGS.personalAgentOwner}/personal-agent`);
    expect(verboseSpy).toHaveBeenNthCalledWith(1, "Exiting callPersonalAgent");
  });

  it("Should ignore irrelevant comments", async () => {
    const { context, errorSpy, infoSpy } = createContext("foo bar");

    expect(context.eventName).toBe(commentCreateEvent);
    expect(context.payload.comment.body).toBe("foo bar");

    await runPlugin(context);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenNthCalledWith(1, "Ignoring irrelevant comment: foo bar");
  });

  it("Should fail on wrong X25519_PRIVATE_KEY", async () => {
    const { context, errorSpy, infoSpy } = createContext();
    context.env.X25519_PRIVATE_KEY = "roWTTjNnyKI4VBHQ3JlLUR7bZpxGcHNYCqK4GgLcslA";

    expect(context.eventName).toBe(commentCreateEvent);

    await expect(runPlugin(context)).rejects.not.toBeUndefined();

    expect(infoSpy).toHaveBeenNthCalledWith(1, `Comment received:`, {
      caller: STRINGS.CALLER_LOGS_ANON,
      personalAgentOwner: STRINGS.personalAgentOwner,
      owner: STRINGS.USER,
      comment: STRINGS.commentBody,
    });

    expect(errorSpy).toHaveBeenNthCalledWith(1, `Error dispatching workflow: Error: incorrect key pair for the given ciphertext`, expect.anything());
  });

  it("Should fail on wrong organization/owner", async () => {
    const { context, errorSpy, infoSpy } = createContext();
    server.use(
      http.get("https://api.github.com/repos/:owner/:repo/contents/.github%2Fpersonal-agent.config.yml", () => {
        const content = `GITHUB_PAT_ENCRYPTED: "erIGLwzgm3Vs4gXTJg3-Byr6niB_G0u_Ty3KvOeF-j7jhprsKS2kbijeT66Sxx4sheq0bThyrXAELZ-I1Hl-odb0uhRVnld_nX8mVJn4F7FoG77aPDlKCHvvD7vMlmOc8FcZoEY6V5UAvz2liduwNpMJCDVcZz01iK-hsgvHjuNVbHtUbNL55Nt2zKPsgh3fvA"`;
        return HttpResponse.text(content);
      })
    );
    expect(context.eventName).toBe(commentCreateEvent);

    await expect(runPlugin(context)).rejects.not.toBeUndefined();

    expect(infoSpy).toHaveBeenNthCalledWith(1, `Comment received:`, {
      caller: STRINGS.CALLER_LOGS_ANON,
      personalAgentOwner: STRINGS.personalAgentOwner,
      owner: STRINGS.USER,
      comment: STRINGS.commentBody,
    });

    expect(errorSpy).toHaveBeenNthCalledWith(1, `Personal agent PAT does not allow running on ${STRINGS.USER}/personal-agent`);
  });
});

/**
 * The heart of each test. This function creates a context object with the necessary data for the plugin to run.
 *
 * So long as everything is defined correctly in the db (see `./__mocks__/helpers.ts: setupTests()`),
 * this function should be able to handle any event type and the conditions that come with it.
 *
 * Refactor according to your needs.
 */
function createContext(
  commentBody: string = STRINGS.commentBody,
  repoId: number = 1,
  payloadSenderId: number = 1,
  commentId: number = 1,
  issueOne: number = 1
) {
  const repo = db.repo.findFirst({ where: { id: { equals: repoId } } }) as unknown as Context["payload"]["repository"];
  const sender = db.users.findFirst({ where: { id: { equals: payloadSenderId } } }) as unknown as Context["payload"]["sender"];
  const issue1 = db.issue.findFirst({ where: { id: { equals: issueOne } } }) as unknown as Context["payload"]["issue"];

  createComment(commentBody, commentId); // create it first then pull it from the DB and feed it to _createContext
  const comment = db.issueComments.findFirst({ where: { id: { equals: commentId } } }) as unknown as Context["payload"]["comment"];

  const context = createContextInner(repo, sender, issue1, comment);
  const infoSpy = jest.spyOn(context.logger, "info");
  const errorSpy = jest.spyOn(context.logger, "error");
  const debugSpy = jest.spyOn(context.logger, "debug");
  const okSpy = jest.spyOn(context.logger, "ok");
  const verboseSpy = jest.spyOn(context.logger, "verbose");

  return {
    context,
    infoSpy,
    errorSpy,
    debugSpy,
    okSpy,
    verboseSpy,
    repo,
    issue1,
  };
}

/**
 * Creates the context object central to the plugin.
 *
 * This should represent the active `SupportedEvents` payload for any given event.
 */
function createContextInner(
  repo: Context["payload"]["repository"],
  sender: Context["payload"]["sender"],
  issue: Context["payload"]["issue"],
  comment: Context["payload"]["comment"]
): Context {
  return {
    eventName: "issue_comment.created",
    payload: {
      action: "created",
      sender: sender,
      repository: repo,
      issue: issue,
      comment: comment,
      installation: { id: 1 } as Context["payload"]["installation"],
      organization: { login: STRINGS.USER } as Context["payload"]["organization"],
    } as Context["payload"],
    logger: new Logs("debug") as unknown as Context["logger"],
    config: {},
    env: {
      X25519_PRIVATE_KEY: "lkQCx6wMxB7V8oXVxWDdEY2xqAF5VqJx7dLIK4qMyIw",
      APP_ID: "test",
      APP_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----
MIICeAIBADANBgkqhkiG9w0BAQEFAASCAmIwggJeAgEAAoGBAPNftFKuTmAKzgii
jnXfNtDwXRkbA/j82+pPFFtVyUgTV25jw0KjaAzEBp6Rj2MO4oQug+PfPTWLwnvQ
UihtMVS4gfCCK6DlfTPo1ESNUOGBC5XUAmMNkN5c2qfwG+Mvn77/AsNYfadCOaF5
ubsH8vxMs6yXOUxvybkY6AObiyJfAgMBAAECgYEAhbeHtAXhOhO1sDjgXRMPYy0t
eaXGQP9tNQfN/4Da3qcB2r0lg2+Us67glC8VwS9kdYu5G3KEhu8LJEwJV/zmpLt8
7YZnH3OT+2eChIbNBaC6cwvdKK+Q0DvSS4FnJKWLjYUYtEob8KuFroCLL6MFJanx
uC5fo3mrt5bgB2lXcAECQQD/xRVgPNPMyxIodJ4NNYbulsqB1bnT4EDo2xC7ollZ
5McL9AEkqMiEzaUqhNsBTfb+IRabtAWezsbKrdMVmQdfAkEA85fD9dIYCkgfKs3K
fmO5zIa9gxYpnksXpbC1RCdduPMVaB8hDVMdl43QA/J/zdkdUK5wq8gJRFS+wdwD
wHrFAQJAGtm1xMSd94HaBiU38msMHz/1QmwNdhC0v70/pHMGrkk2HCshc5fEdSyh
ijUoSJrGsycGGJJthJ5wgBZ/cmT+QQJBAIBKqfZJlEe1/FQ61i8CrtQ9Eop7nae0
vNuS2aTvZrkFrXyNCIdQAwHSun+ZtB3h/0KC3OxcCiVmzKClE4TIJAECQQDfyQxG
0FuTi6qKDkW0oMLx5vdWvXrHwYDAkpBBn8cI6IBsevVtph/ggrmKrYkhEyRasToy
QD6nsO7d61MTjIzS
-----END PRIVATE KEY-----`,
    },
    octokit: octokit,
    command: null,
    commentHandler: new CommentHandler(),
  };
}
