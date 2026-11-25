import { describe, expect, it } from "vitest";
import { isTaskVisible, taskNotFound } from "./task-visibility";

const shared = { isDraft: false, draftOwnerId: null };
const ownDraft = { isDraft: true, draftOwnerId: 7 };
const foreignDraft = { isDraft: true, draftOwnerId: 8 };

describe("isTaskVisible", () => {
  it("lets every signed-in user see saved tasks", () => {
    expect(isTaskVisible(shared, 1)).toBe(true);
    expect(isTaskVisible(shared, 7)).toBe(true);
  });

  it("keeps assisted drafts private to their owner", () => {
    expect(isTaskVisible(ownDraft, 7)).toBe(true);
    expect(isTaskVisible(foreignDraft, 7)).toBe(false);
  });

  it("does not expose an ownerless draft", () => {
    expect(isTaskVisible({ isDraft: true, draftOwnerId: null }, 7)).toBe(false);
  });
});

describe("taskNotFound", () => {
  it("uses the same not-found shape for hidden and missing tasks", () => {
    const error = taskNotFound();
    expect(error.message).toBe("Task not found");
    expect(error.extensions).toMatchObject({ code: "BAD_USER_INPUT" });
  });
});
