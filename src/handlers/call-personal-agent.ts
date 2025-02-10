import { Octokit } from "@octokit/rest";
import { getPersonalAgentConfig } from "../helpers/config";
import { decrypt, parseDecryptedPrivateKey } from "../helpers/keys";
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
    const personalAgentConfig = await getPersonalAgentConfig(context, personalAgentOwner);

    if (!personalAgentConfig.config) {
      throw logger.error(`No personal agent config found on ${personalAgentOwner}/personal-agent`);
    }

    const { privateKey, allowedOrganizationId, allowedRepositoryId } = parseDecryptedPrivateKey(
      await decrypt(personalAgentConfig.config.GITHUB_PAT_ENCRYPTED, context.env.X25519_PRIVATE_KEY)
    );

    const paOctokit = new Octokit({
      auth: privateKey,
    });

    const repo = (await paOctokit.rest.repos.get({ owner: personalAgentOwner, repo: "personal-agent" })).data;
    if (allowedOrganizationId !== repo.owner.id || (allowedRepositoryId && allowedRepositoryId !== repo.id)) {
      throw logger.error(`Personal agent PAT does not allow running on ${repo.owner.login}/${repo.name}`);
    }
    const defaultBranch = repo.default_branch;

    await paOctokit.rest.actions.createWorkflowDispatch({
      owner: personalAgentOwner,
      repo: "personal-agent",
      workflow_id: "compute.yml",
      ref: defaultBranch,
      inputs: {
        stateId: crypto.randomUUID(),
        eventName: context.eventName,
        eventPayload: JSON.stringify(context.payload),
        settings: JSON.stringify(context.config),
        authToken: privateKey,
        command: "null",
        ref: defaultBranch,
        signature: "no-signature",
      },
    });
  } catch (error) {
    throw logger.error(`Error dispatching workflow: ${error}`, { error: error instanceof Error ? error : undefined });
  }

  logger.ok(`Successfully sent the command to ${personalAgentOwner}/personal-agent`);
  logger.verbose(`Exiting callPersonalAgent`);
}
