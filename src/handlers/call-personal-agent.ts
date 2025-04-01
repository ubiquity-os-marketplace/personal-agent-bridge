import { PluginInput } from "@ubiquity-os/plugin-sdk/signature";
import { Context } from "../types";

/**
 * NOTICE: run the personal-agent repository workflow of mentioned user
 *
 * Given below is the accepted format of comment to command the personal agent of @exampleGithubUser
 *
 * /@exampleGithubUser say hello
 *
 */
export async function callPersonalAgent(context: Context) {
  const { logger, payload } = context;

  const owner = payload.repository.owner.login;
  const body = payload.comment.body.trim();

  if (!body.trim().startsWith("@")) {
    logger.info(`Ignoring irrelevant comment: ${body}`);
    return;
  }

  const targetUser = /^\s*@([a-z0-9-_]+)/i.exec(body);
  if (!targetUser) {
    logger.error(`Missing target username from comment: ${body}`);
    return;
  }

  const personalAgentOwner = targetUser[1];
  logger.info(`Comment received:`, { owner, personalAgentOwner, comment: body });

  try {
    const repo = (await context.octokit.rest.repos.get({ owner: personalAgentOwner, repo: "personal-agent" })).data;
    const defaultBranch = repo.default_branch;

    const pluginInput = new PluginInput(
      context.env.APP_PRIVATE_KEY,
      crypto.randomUUID(),
      context.eventName,
      context.payload,
      context.config,
      "",
      defaultBranch,
      null
    );

    await context.octokit.rest.actions.createWorkflowDispatch({
      owner: personalAgentOwner,
      repo: "personal-agent",
      workflow_id: "compute.yml",
      ref: defaultBranch,
      inputs: await pluginInput.getInputs(),
    });
  } catch (error) {
    throw logger.error(`Error dispatching workflow: ${error}`, { error: error instanceof Error ? error : undefined });
  }

  logger.ok(`Successfully sent the command to ${personalAgentOwner}/personal-agent`);
  logger.verbose(`Exiting callPersonalAgent`);
}
