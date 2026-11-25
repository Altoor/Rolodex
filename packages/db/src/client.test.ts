import { describe, expect, it } from "vitest";
import { assertTableWritable } from "./client";

const writable = new Set(["todos", "fileEntries"]);

describe("assertTableWritable", () => {
  it("allows the trial workspace tables", () => {
    expect(() => assertTableWritable("todos", writable)).not.toThrow();
    expect(() => assertTableWritable("fileEntries", writable)).not.toThrow();
  });

  it("fails closed for any other table", () => {
    expect(() => assertTableWritable("users", writable)).toThrow(
      /cannot write to table "users"/,
    );
    expect(() => assertTableWritable("tasks", writable)).toThrow(
      /add it to TRIAL_TABLES/,
    );
  });

  it("treats an unknown table name as not writable", () => {
    expect(() => assertTableWritable("", writable)).toThrow(/"unknown"/);
  });
});
