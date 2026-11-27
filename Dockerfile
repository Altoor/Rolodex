FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
COPY package.json ./
# Install the pnpm version pinned in package.json so the final images do not
# download anything from the network on every container start.
RUN npm install -g "$(node -p 'require("./package.json").packageManager')"

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @repo/queries build
RUN pnpm --filter @repo/ui build:components
RUN pnpm --filter @repo/ui build:styles
RUN pnpm --filter web build

FROM base AS backend
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 4000
CMD ["pnpm", "--filter", "backend", "start:docker"]

FROM base AS web
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3001
CMD ["pnpm", "--filter", "web", "start"]
