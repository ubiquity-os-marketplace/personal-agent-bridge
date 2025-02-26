import { StaticDecode, Type as T } from "@sinclair/typebox";
import { LOG_LEVEL } from "@ubiquity-os/ubiquity-os-logger";
import "dotenv/config";

export const envSchema = T.Object({
  LOG_LEVEL: T.Optional(T.Enum(LOG_LEVEL, { default: LOG_LEVEL.INFO })),
  KERNEL_PUBLIC_KEY: T.Optional(T.String()),
  APP_ID: T.String(),
  APP_PRIVATE_KEY: T.String(),
  X25519_PRIVATE_KEY: T.String(),
});

export type Env = StaticDecode<typeof envSchema>;
