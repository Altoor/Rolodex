import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `tsc` leaves the package's `#components/...` aliases in the compiled output.
 * Those aliases resolve to `src/`, which means a consumer that imports the
 * built package can end up with two copies of the same module (one under
 * `dist/`, one under `src/`). For React contexts that breaks the provider
 * lookup because each copy creates a different `createContext` object.
 *
 * Rewrite every alias in `dist/` to a relative import so the built package is
 * self-contained and consumers only ever load the `dist/` graph.
 */

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distRoot = path.join(packageRoot, "dist");

const ALIASES = {
  components: "components",
  lib: "lib",
  hooks: "hooks",
  pages: "pages",
};

const SPECIFIER_PATTERN = /(["'])#(components|lib|hooks|pages)\/([^"']+)\1/g;

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files;
}

function relativeSpecifier(fromFile, kind, target) {
  const absoluteTarget = path.join(distRoot, ALIASES[kind], target);
  const hasTarget =
    existsSync(absoluteTarget) ||
    existsSync(`${absoluteTarget}.js`) ||
    existsSync(`${absoluteTarget}.d.ts`);

  if (!hasTarget) {
    throw new Error(
      `Alias "#${kind}/${target}" in ${path.relative(packageRoot, fromFile)} has no dist target`,
    );
  }

  let relative = path
    .relative(path.dirname(fromFile), absoluteTarget)
    .split(path.sep)
    .join("/");

  if (!relative.startsWith(".")) relative = `./${relative}`;
  return relative;
}

async function main() {
  if (!existsSync(distRoot)) {
    throw new Error("dist/ does not exist; run tsc first");
  }

  const files = (await collectFiles(distRoot)).filter(
    (file) => file.endsWith(".js") || file.endsWith(".d.ts"),
  );

  let rewritten = 0;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const next = source.replace(
      SPECIFIER_PATTERN,
      (_match, quote, kind, target) =>
        `${quote}${relativeSpecifier(file, kind, target)}${quote}`,
    );

    if (next !== source) {
      await writeFile(file, next);
      rewritten += 1;
    }
  }

  console.log(
    `Rewrote dist aliases in ${rewritten} file${rewritten === 1 ? "" : "s"}.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
