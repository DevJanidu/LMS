const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getOccurrences } = require("../.analytics-tests/schedule.cjs");
const block = {
  id: "weekly",
  title: "Study",
  timezone: "Europe/London",
  startsAt: "2026-10-05T16:00:00Z",
  endsAt: "2026-10-05T17:00:00Z",
  repeat: "weekly",
  weekdays: [1, 3],
  exceptions: [],
};
test("weekly recurrence selects weekdays and preserves wall time through DST", () => {
  const result = getOccurrences([block], "2026-10-05", "2026-10-28");
  assert.equal(result.length, 8);
  assert.equal(result[0].startsAt, "2026-10-05T16:00:00.000Z");
  assert.equal(
    result.find((entry) => entry.date === "2026-10-26").startsAt,
    "2026-10-26T17:00:00.000Z",
  );
});
test("cancelling one occurrence leaves later weeks intact", () => {
  const result = getOccurrences(
    [{ ...block, exceptions: [{ date: "2026-10-07", cancelled: true }] }],
    "2026-10-05",
    "2026-10-14",
  );
  assert.deepEqual(
    result.map((entry) => entry.date),
    ["2026-10-05", "2026-10-12", "2026-10-14"],
  );
});
test("moved occurrence appears in its destination range and retains original identity", () => {
  const moved = {
    ...block,
    exceptions: [
      {
        date: "2026-10-05",
        cancelled: false,
        title: "Moved study",
        startsAt: "2026-11-05T10:00:00Z",
        endsAt: "2026-11-05T11:00:00Z",
      },
    ],
  };
  assert.ok(!getOccurrences([moved], "2026-10-05", "2026-10-05").length);
  const result = getOccurrences([moved], "2026-11-05", "2026-11-05");
  assert.equal(result[0].date, "2026-10-05");
  assert.equal(result[0].title, "Moved study");
});
test("future cutoff and selected weekdays exclude unwanted occurrences", () => {
  assert.equal(
    getOccurrences(
      [{ ...block, recurrenceUntil: "2026-10-06" }],
      "2026-10-05",
      "2026-10-20",
    ).length,
    1,
  );
  assert.equal(
    getOccurrences([{ ...block, weekdays: [3] }], "2026-10-05", "2026-10-05")
      .length,
    0,
  );
});
test("weekly blocks retain an overnight end date", () => {
  const overnight = {
    ...block,
    startsAt: "2026-10-05T22:00:00Z",
    endsAt: "2026-10-06T01:00:00Z",
  };
  const result = getOccurrences([overnight], "2026-10-12", "2026-10-12");
  assert.equal(result[0].startsAt, "2026-10-12T22:00:00.000Z");
  assert.equal(result[0].endsAt, "2026-10-13T01:00:00.000Z");
});
