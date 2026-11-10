// builder.ts
import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { getTableConfig } from "drizzle-orm/pg-core";
import { db, relations } from "@repo/db";
import * as schema from "@repo/db";
import { DateTimeResolver, GraphQLJSON, GraphQLLong } from "graphql-scalars";

export interface PothosTypes {
  DrizzleRelations: typeof schema.relations;
  Context: { user: typeof schema.users.$inferSelect | null };
  Scalars: {
    DateTime: {
      Input: Date;
      Output: Date;
    };
    JSON: {
      Input: Record<string, any>;
      Output: Record<string, any>;
    };
    Long: {
      Input: BigInt;
      Output: BigInt;
    };
  };
}

export { db };

export const builder = new SchemaBuilder<PothosTypes>({
  plugins: [DrizzlePlugin],
  drizzle: {
    client: () => db,
    getTableConfig,
    relations,
    filterConnectionTotalCount: true,
  },
});

builder.queryType({
  fields: (t) => ({
    hello: t.string({
      resolve: () => "hello, world!",
    }),
  }),
});
builder.addScalarType("DateTime", DateTimeResolver);
builder.addScalarType("JSON", GraphQLJSON, {});
builder.addScalarType("Long", GraphQLLong, {});
