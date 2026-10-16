import { createYoga } from 'graphql-yoga';
import { createServer } from 'node:http';
import * as dbSchema from './db/schema.ts';
import { buildSchema } from 'drizzle-graphql';
import { drizzle } from 'drizzle-orm/node-postgres';


const db = drizzle(process.env.DATABASE_URL!, {schema:dbSchema});
const { schema } = buildSchema(db);


const yoga = createYoga({ schema });
const server = createServer(yoga);

server.listen(4000, () => {
  console.info('Server is running on http://localhost:4000/graphql');
});
