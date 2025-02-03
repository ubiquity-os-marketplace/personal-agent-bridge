declare global {
  namespace NodeJS {
    interface ProcessEnv {
      X25519_PRIVATE_KEY: string;
    }
  }
}

export {};
