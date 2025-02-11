import { StaticDecode, Type as T } from "@sinclair/typebox";

export const personalAgentConfigSchema = T.Object(
  {
    GITHUB_PAT_ENCRYPTED: T.String(),
  },
  { default: {} }
);

export type PersonalAgentConfig = StaticDecode<typeof personalAgentConfigSchema>;
