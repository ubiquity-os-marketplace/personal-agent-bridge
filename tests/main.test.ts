import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { drop } from "@mswjs/data";
import { customOctokit as Octokit } from "@ubiquity-os/plugin-sdk/octokit";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
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

    await expect(runPlugin(context)).resolves.toBeUndefined();

    expect(infoSpy).toHaveBeenNthCalledWith(1, `Comment received:`, {
      caller: STRINGS.CALLER_LOGS_ANON,
      personalAgentOwner: STRINGS.personalAgentOwner,
      owner: STRINGS.USER,
      comment: STRINGS.commentBody,
    });

    expect(errorSpy).toHaveBeenNthCalledWith(1, `Error dispatching workflow: Error: incorrect key pair for the given ciphertext`);
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
    },
    octokit: octokit,
    command: null,
  };
}
