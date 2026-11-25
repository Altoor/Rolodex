import { beforeEach, describe, expect, it, vi } from "vitest";

const { update, returning } = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { update, returning };
});

vi.mock("@repo/db", () => ({
  db: { update },
  decisions: {},
  stepAttempts: { id: { name: "id" }, status: { name: "status" } },
  taskResults: {},
  tasks: {},
  userDecisionOptions: {},
}));

import { markAttemptCommitted } from "./attempts";

describe("markAttemptCommitted", () => {
  beforeEach(() => {
    update.mockClear();
    returning.mockReset();
  });

  it("reports a win only when a row actually transitions", async () => {
    returning.mockResolvedValueOnce([{ id: 1 }]);
    await expect(markAttemptCommitted(1)).resolves.toBe(true);

    returning.mockResolvedValueOnce([]);
    await expect(markAttemptCommitted(1)).resolves.toBe(false);
  });

  it("updates only rows that are not already committed", async () => {
    returning.mockResolvedValueOnce([]);
    await markAttemptCommitted(42);

    expect(update).toHaveBeenCalledTimes(1);
  });
});
