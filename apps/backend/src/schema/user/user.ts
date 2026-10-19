import { builder } from "../builder";

export const User = builder.drizzleObject("users", {
  name: "User",
  fields: (t) => ({
    id: t.exposeInt("id"),
    name: t.exposeString("name"),
  }),
});
