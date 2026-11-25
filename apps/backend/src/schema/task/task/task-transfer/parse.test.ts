import { describe, expect, it } from "vitest";
import { parseImportFile, remapSwitchConfig } from "./parse";
import { FORMAT, VERSION } from "./types";

function file(tasks: unknown[], decisions: unknown[] = []) {
  return { format: FORMAT, version: VERSION, exportedAt: "", decisions, tasks };
}

function task(id: number, overrides: Record<string, unknown> = {}) {
  return { id, name: `Task ${id}`, type: "tool", toolKey: "file", ...overrides };
}

describe("parseImportFile", () => {
  it("parses a minimal tasks file", () => {
    const parsed = parseImportFile(file([task(1)]));
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0]?.fallbackTaskId).toBeNull();
  });

  it("rejects the wrong format marker", () => {
    expect(() => parseImportFile({ ...file([]), format: "other" })).toThrow(
      /Not a Rolodex tasks file/,
    );
  });

  it("rejects an unsupported version", () => {
    expect(() => parseImportFile({ ...file([]), version: 99 })).toThrow(
      /Unsupported tasks file version/,
    );
  });

  it("rejects duplicate task ids", () => {
    expect(() => parseImportFile(file([task(1), task(1)]))).toThrow(
      /duplicate task ids/,
    );
  });
});

describe("remapSwitchConfig", () => {
  it("remaps switch cases and the default target", () => {
    const config = {
      cases: [
        { match: "a", nextTaskId: 1 },
        { match: "b", nextTaskId: 2 },
      ],
      defaultTaskId: 3,
    };
    const mapped = remapSwitchConfig(config, (id) => id + 100);

    expect(mapped).toEqual({
      cases: [
        { match: "a", nextTaskId: 101 },
        { match: "b", nextTaskId: 102 },
      ],
      defaultTaskId: 103,
    });
  });

  it("clears a switch target that has no mapping", () => {
    const mapped = remapSwitchConfig(
      { cases: [{ match: "a", nextTaskId: 1 }], defaultTaskId: 9 },
      () => null,
    ) as { cases: { nextTaskId: number | null }[]; defaultTaskId: number | null };

    expect(mapped.cases[0]?.nextTaskId).toBeNull();
    expect(mapped.defaultTaskId).toBeNull();
  });

  it("returns the original object when nothing changes", () => {
    const config = { cases: [{ match: "a", nextTaskId: 1 }] };
    expect(remapSwitchConfig(config, (id) => id)).toBe(config);
  });
});
