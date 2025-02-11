import { TransformDecodeCheckError, Value, ValueError } from "@sinclair/typebox/value";
import YAML, { YAMLError } from "yaml";
import { Context } from "../types";
import { personalAgentConfigSchema } from "../types/personal-agent-config";

export const CONFIG_FULL_PATH = ".github/personal-agent.config.yml";
export const REPOSITORY_NAME = "personal-agent";

export async function getPersonalAgentConfig(context: Context, owner: string) {
  const rawData = await download({
    context,
    repository: REPOSITORY_NAME,
    owner,
  });
  const { yaml, errors } = parseYaml(rawData);
  const config: { GITHUB_PAT_ENCRYPTED: string } | null = yaml;
  if (config) {
    try {
      return { config: Value.Decode(personalAgentConfigSchema, Value.Default(personalAgentConfigSchema, config)), errors, rawData };
    } catch (error) {
      console.error(`Error decoding personal agent configuration for ${owner}/${REPOSITORY_NAME}, will ignore.`, error);
      return { config: null, errors: [error instanceof TransformDecodeCheckError ? error.error : error] as ValueError[], rawData };
    }
  }
  return { config: null, errors, rawData };
}

async function download({ context, repository, owner }: { context: Context; repository: string; owner: string }): Promise<string | null> {
  if (!repository || !owner) throw new Error("Repo or owner is not defined");
  try {
    const { data } = await context.octokit.rest.repos.getContent({
      owner,
      repo: repository,
      path: CONFIG_FULL_PATH,
      mediaType: { format: "raw" },
    });
    return data as unknown as string; // this will be a string if media format is raw
  } catch (err) {
    console.error(err);
    return null;
  }
}

export function parseYaml(data: null | string) {
  try {
    if (data) {
      const parsedData = YAML.parse(data);
      return { yaml: parsedData ?? null, errors: null };
    }
  } catch (error) {
    console.error("Error parsing YAML", error);
    return { errors: [error] as YAMLError[], yaml: null };
  }
  return { yaml: null, errors: null };
}
