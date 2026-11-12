// builder.ts
import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { getTableConfig } from "drizzle-orm/pg-core";
import { db, relations } from "@repo/db";
import * as schema from "@repo/db";
import { DateTimeResolver, GraphQLJSON, GraphQLLong } from "graphql-scalars";
import { GraphQLError, GraphQLScalarType } from "graphql";

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
    File: {
      Input: File;
      Output: File;
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

// The WHATWG File object supplied by Yoga's multipart parser. GraphQL never
// serializes it, so only variables are accepted as input.
const FileScalar = new GraphQLScalarType({
  name: "File",
  description:
    "A file uploaded with a GraphQL multipart request. Provide it as a variable.",
  serialize() {
    throw new GraphQLError("File is an input-only scalar");
  },
  parseValue(value) {
    return value;
  },
  parseLiteral() {
    throw new GraphQLError("File must be provided as a variable");
  },
});

builder.addScalarType("File", FileScalar, {});
