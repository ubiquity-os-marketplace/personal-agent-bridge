import { callPersonalAgent } from "./handlers/call-personal-agent";
import { Context } from "./types";

/**
 * The main plugin function. Split for easier testing.
 */
export async function runPlugin(context: Context) {
  const { logger, eventName } = context;

  if (eventName === "issue_comment.created") {
    return await callPersonalAgent(context);
  }

  logger.error(`Unsupported event: ${eventName}`);
}
