# Turborepo Tailwind CSS starter

This Turborepo starter is maintained by the Turborepo core team.

## Using this example

Run the following command:

```sh
npx create-turbo@latest -e with-tailwind
```

## Files workspace

Files live in a shared `files/` directory at the repository root. Set
`FILES_ROOT` to an absolute path to use a different location; the backend
creates it on startup. Uploads and tool-created entries are indexed in the
`fileEntries` table, and the web app at `/files` browses that index.

### Indexing

Run a manual sync at any time:

```sh
pnpm files:index
pnpm files:index --path invoices --preview
pnpm files:index --include-unchanged --hash always
```

The same engine powers the **Refresh** button and the `scan_files` tool. Scans
skip `.tmp/`, `.gitkeep`, common system files, and symlinks. They abort above
5,000 disk entries (`--max-entries`), and `hash: "auto"` skips hashing files
larger than 100 MB.

Embeddings are best-effort metadata. If Ollama is unavailable the file
operation still succeeds; repair missing vectors later with:

```sh
pnpm files:backfill-embeddings
```

### Upload limits

- `POST /files/upload` streams one file per request (default limit 10 GiB,
  configurable with `MAX_STREAM_UPLOAD_BYTES`) and requires a bearer token.
  This is the primary upload path.
- GraphQL `uploadFiles` is the small-file fallback: 25 MB total request,
  25 MB per file, 20 files per request.
- Text previews are capped at 5 MB; larger files are download-only.

### Security

- Every file GraphQL query/mutation requires authentication.
- Downloads use short-lived signed view tokens (5 minutes), not bare paths.
- Paths are normalized to POSIX and checked against `FILES_ROOT`; real-path
  checks reject symlink escapes. Unexpected errors are logged server-side and
  returned without absolute paths.
- Browser auth tokens expire after 7 days by default
  (`AUTH_TOKEN_TTL_SECONDS`).

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `docs`: a [Next.js](https://nextjs.org/) app with [Tailwind CSS](https://tailwindcss.com/)
- `web`: another [Next.js](https://nextjs.org/) app with [Tailwind CSS](https://tailwindcss.com/)
- `ui`: a stub React component library with [Tailwind CSS](https://tailwindcss.com/) shared by both `web` and `docs` applications
- `@repo/tailwind-config`: shared Tailwind CSS theme and PostCSS configuration
- `@repo/eslint-config`: `eslint` flat configurations (includes `@next/eslint-plugin-next` and `eslint-config-prettier`)
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Building packages/ui

This example is set up to produce compiled styles for `ui` components into the `dist` directory. The component `.tsx` files are consumed by the Next.js apps directly using `transpilePackages` in `next.config.ts`. This was chosen for several reasons:

- Make sharing one theme from `packages/tailwind-config/shared-styles.css` to apps and packages as easy as possible.
- Make package compilation simple by only depending on the Next.js Compiler and `tailwindcss`.
- Ensure Tailwind classes do not overwrite each other. The `ui` package uses a `ui-` prefix for its classes via `@import "tailwindcss" prefix(ui);` in [packages/ui/src/styles.css](packages/ui/src/styles.css).
- Maintain clear package export boundaries.

Another option is to consume `packages/ui` directly from source without building. Tailwind CSS v4 automatically detects class names in your source files, but it does not scan other packages in `node_modules`. If you use this option, add [`@source` directives](https://tailwindcss.com/docs/functions-and-directives#source-directive) to the CSS entry point in your apps so Tailwind can find the class names used in the `ui` package:

```css
@import "tailwindcss";
@import "@repo/tailwind-config";

@source "../../../packages/ui/src";
```

If you choose this strategy, you can remove the `tailwindcss` dependency and the `build:styles` script from the `ui` package.

### Utilities

This Turborepo has some additional tools already setup for you:

- [Tailwind CSS](https://tailwindcss.com/) for styles
- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting
