import "dotenv/config";
import {
  syncFileTree,
  type HashMode,
  type SyncFileTreeOptions,
} from "@repo/tools/tools/file/services/sync";

interface Args {
  path?: string;
  apply: boolean;
  includeUnchanged: boolean;
  hash: HashMode;
  maxEntries?: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: true,
    includeUnchanged: false,
    hash: "auto",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--path": {
        const value = argv[index + 1];
        if (!value) throw new Error("--path requires a value");
        args.path = value;
        index += 1;
        break;
      }
      case "--apply":
        args.apply = true;
        break;
      case "--no-apply":
      case "--preview":
        args.apply = false;
        break;
      case "--include-unchanged":
        args.includeUnchanged = true;
        break;
      case "--hash": {
        const value = argv[index + 1];
        if (value !== "auto" && value !== "always" && value !== "never") {
          throw new Error("--hash must be auto, always, or never");
        }
        args.hash = value;
        index += 1;
        break;
      }
      case "--max-entries": {
        const value = argv[index + 1];
        if (!value || !Number.isFinite(Number(value))) {
          throw new Error("--max-entries requires a number");
        }
        args.maxEntries = Number(value);
        index += 1;
        break;
      }
      default:
        throw new Error(`unknown argument "${arg}"`);
    }
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const options: SyncFileTreeOptions = {
    path: args.path,
    apply: args.apply,
    includeUnchanged: args.includeUnchanged,
    hash: args.hash,
    maxEntries: args.maxEntries,
  };

  console.info(
    `Scanning files/ (apply=${args.apply}, includeUnchanged=${args.includeUnchanged}, hash=${args.hash})...`,
  );

  const report = await syncFileTree(options);

  console.info(JSON.stringify(report, null, 2));
  const { counts, warnings } = report;
  console.info(
    `Done: ${counts.added} added, ${counts.changed} changed, ${counts.moved} moved, ${counts.deleted} deleted, ${counts.unchanged} unchanged${warnings.length ? `, ${warnings.length} warning(s)` : ""}.`,
  );
}

void main().catch((err) => {
  console.error("File indexing failed:", err);
  process.exitCode = 1;
});
