import { describe, expect, it } from "vitest";
import { formatCurrentTimeContext, withCurrentTime } from "./current-time";

const winter = new Date("2026-01-15T12:34:56Z");
const summer = new Date("2026-07-15T12:34:56Z");

describe("formatCurrentTimeContext", () => {
  it("uses the configured time zone and its winter offset", () => {
    const context = formatCurrentTimeContext(winter, "Europe/Copenhagen");

    expect(context).toContain("2026-01-15T13:34:56+01:00");
    expect(context).toContain("Thursday");
    expect(context).toContain("Europe/Copenhagen");
  });

  it("applies daylight saving to the offset", () => {
    expect(formatCurrentTimeContext(summer, "Europe/Copenhagen")).toContain(
      "2026-07-15T14:34:56+02:00",
    );
  });

  it("formats UTC with a zero offset", () => {
    expect(formatCurrentTimeContext(winter, "UTC")).toContain(
      "2026-01-15T12:34:56+00:00",
    );
  });

  it("rejects an invalid IANA time zone", () => {
    expect(() => formatCurrentTimeContext(winter, "Not/AZone")).toThrow(
      '"timeZone" is not a valid IANA time zone: Not/AZone',
    );
  });
});

describe("withCurrentTime", () => {
  it("appends the time context to an existing system prompt", () => {
    expect(withCurrentTime("Be brief.", "UTC", winter)).toBe(
      "Be brief.\n\n" +
        "Current date and time: 2026-01-15T12:34:56+00:00 (Thursday)\n" +
        "Time zone: UTC\n" +
        'Use this as the current date and time when resolving relative dates such as "tomorrow" or "before Saturday".',
    );
  });

  it("uses the time context alone when there is no system prompt", () => {
    expect(withCurrentTime(undefined, "UTC", winter)).toContain(
      "Current date and time:",
    );
  });
});
