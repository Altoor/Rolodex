import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { relations } from "./relations";

export const db: NodePgDatabase<typeof relations> = drizzle(
  process.env.DATABASE_URL!,
  { relations },
);
