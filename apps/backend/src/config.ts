export const TOKEN_SECRET: string =
  process.env.TOKEN_SECRET ??
  (() => {
    throw new Error("TOKEN_SECRET environment variable is required");
  })();
