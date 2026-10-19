import { createYoga } from 'graphql-yoga';
import { createServer } from 'node:http';
import { schema } from './schema/index.ts';
import jwt from 'jsonwebtoken';
import { db } from './schema/builder.ts';
import { users } from './db/schema.ts';
import { eq } from 'drizzle-orm';



const yoga = createYoga({ schema,context: async ({ request }) => {
    const user = await extract_user(request.headers.get('authorization'));
    return { user };
  }, });
const server = createServer(yoga);

server.listen(4000, () => {
  console.info('Server is running on http://localhost:4000/graphql');
});


async function extract_user(auth_header: string | null) {
  if (!auth_header) return {};

  const token = auth_header.split(' ')[1];
  try{
  const theTokenVerified = jwt.verify(token, process.env.TOKEN_SECRET);
  if (typeof theTokenVerified === 'string') return {};

  return (await db.select().from(users).where(eq(users.id, theTokenVerified))).at(0)
  } catch {
    return {}}
}