import path from "node:path";

/**
 * `create_file` only writes plaintext, and type detection is extension-based.
 * Names without a usable extension get `.md` so a request like "create a file
 * called ALPH" produces "ALPH.md" instead of failing as an unknown file type.
 */
export function withMarkdownFallback(name: string): string {
  const extension = path.extname(name);
  if (extension && extension !== ".") return name;
  return `${name.replace(/\.+$/, "")}.md`;
}
