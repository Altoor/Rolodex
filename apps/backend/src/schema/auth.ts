import { GraphQLError } from "graphql";

type AuthContext = { user?: { id?: number } | null };

export function requireUserId(ctx: AuthContext): number {
  const id = ctx.user?.id;

  if (!id) {
    throw new GraphQLError("Not logged in", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }

  return id;
}
