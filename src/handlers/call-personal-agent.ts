import { customOctokit } from "@ubiquity-os/plugin-sdk/octokit";
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
  const personalAgentRepo = "personal-agent";
  logger.info(`Comment received:`, { owner, personalAgentOwner, comment: body });

  try {
    const kernelOctokit = new customOctokit({
      auth: {
        privateKey: context.env.APP_PRIVATE_KEY,
        appId: context.env.APP_ID,
      },
    });
    const installationId = (
      await kernelOctokit.rest.apps.getRepoInstallation({
        owner: personalAgentOwner,
        repo: personalAgentRepo,
      })
    ).data.id;
    const repoOctokit = new customOctokit({
      auth: {
        privateKey: context.env.APP_PRIVATE_KEY,
        appId: context.env.APP_ID,
        installationId,
      },
    });
    const repo = (await repoOctokit.rest.repos.get({ owner: personalAgentOwner, repo: personalAgentRepo })).data;
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

    await repoOctokit.rest.actions.createWorkflowDispatch({
      owner: personalAgentOwner,
      repo: personalAgentRepo,
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
