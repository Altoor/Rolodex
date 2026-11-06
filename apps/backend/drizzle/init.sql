-- Enable pgvector on fresh development databases. Drizzle migrations also run
-- this statement, but drizzle-kit push does not execute migrations.
CREATE EXTENSION IF NOT EXISTS vector;
