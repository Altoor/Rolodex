import { GraphQLError } from "graphql";

type AuthContext = { user?: { id?: number } | null };
type AuthenticatedUser = NonNullable<AuthContext["user"]> & { id: number };
type AuthErrorCode = "UNAUTHENTICATED" | "BAD_USER_INPUT";

export function requireUser(
  ctx: AuthContext,
  code: AuthErrorCode = "UNAUTHENTICATED",
): AuthenticatedUser {
  const user = ctx.user;

  if (!user?.id) {
    throw new GraphQLError("Not logged in", {
      extensions: { code },
    });
  }

  return user as AuthenticatedUser;
}

export function requireUserId(ctx: AuthContext): number {
  return requireUser(ctx).id;
}
