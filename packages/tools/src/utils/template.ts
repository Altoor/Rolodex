import { ToolInputError } from "../model/tool-error";
import { isPlainObject } from "./json";
import { readPath } from "./paths";

const TEMPLATE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const TEMPLATE_TEST_PATTERN = /\{\{\s*[^{}]+?\s*\}\}/;

/**
 * Replaces `{{path}}` placeholders with values from `source`, so tool config
 * values can embed earlier output such as `{{content}}` or `{{file.name}}`.
 * Missing paths are an error rather than silently becoming the literal
 * placeholder.
 */
export function interpolateTemplate(
  template: string,
  source: Record<string, unknown>,
): string {
  return template.replace(TEMPLATE_PATTERN, (_placeholder, rawPath: string) => {
    const path = rawPath.trim();
    const value = readPath(source, path);

    if (value === undefined) {
      throw new ToolInputError(
        `config references "{{${path}}}", but that path is not present in toolState`,
      );
    }

    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    return JSON.stringify(value);
  });
}

/** True when a config value contains a `{{path}}` template anywhere inside it. */
export function containsTemplate(value: unknown): boolean {
  if (typeof value === "string") return TEMPLATE_TEST_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsTemplate);
  if (isPlainObject(value)) return Object.values(value).some(containsTemplate);
  return false;
}

/** Resolves templates in every top-level config value, including nested objects and arrays. */
export function resolveConfigTemplates(
  config: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      containsTemplate(value) ? resolveTemplateValues(value, source) : value,
    ]),
  );
}

/** Resolves templates in every string inside a config value, including nested objects and arrays. */
export function resolveTemplateValues(
  value: unknown,
  source: Record<string, unknown>,
): unknown {
  if (typeof value === "string") return interpolateTemplate(value, source);
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValues(item, source));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveTemplateValues(item, source),
      ]),
    );
  }
  return value;
}
