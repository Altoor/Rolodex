// builder.ts
import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../db";
import { User } from "./user";
import { drizzle } from "drizzle-orm/node-postgres";
import { DateTimeResolver } from "graphql-scalars";
import { relations } from "../db";

export interface PothosTypes {
  DrizzleRelations: typeof schema.relations;
  Context: { user: typeof User };
  Scalars: {
    DateTime: {
      Output: Date;
      Input: Date;
    };
  };
}

export const db = drizzle(process.env.DATABASE_URL!, { relations });

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
