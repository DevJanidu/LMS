const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  subjectProgress,
  weeklyGoalPercent,
  timerElapsed,
  dailySeconds,
  streaks,
  localDay,
  zonedToUtc,
  weekStart,
  periodSeconds,
} = require("../.analytics-tests/analytics.cjs");
const topic = (status, archived = false) => ({ status, archived });
const session = (day, minutes = 10, extra = {}) => ({
  startedAt: `${day}T12:00:00Z`,
  endedAt: `${day}T12:${String(minutes).padStart(2, "0")}:00Z`,
  durationSeconds: minutes * 60,
  status: "valid",
  ...extra,
});
test("progress rounds thirds, handles empty and excludes archived topics", () => {
  assert.equal(subjectProgress([]), 0);
  assert.equal(
    subjectProgress([
      topic("completed"),
      topic("notStarted"),
      topic("inProgress"),
    ]),
    33,
  );
  assert.equal(
    subjectProgress([
      ...Array.from({ length: 7 }, () => topic("completed")),
      ...Array.from({ length: 3 }, () => topic("notStarted")),
    ]),
    70,
  );
  assert.equal(
    subjectProgress([topic("completed"), topic("notStarted", true)]),
    100,
  );
});
test("weekly goal is rounded, clamped and optional", () => {
  assert.equal(weeklyGoalPercent(510, 720), 71);
  assert.equal(weeklyGoalPercent(800, 720), 100);
  assert.equal(weeklyGoalPercent(60, 0), 0);
  assert.equal(weeklyGoalPercent(-5, 720), 0);
});
test("timer elapsed uses timestamps, pauses and accumulated pause time", () => {
  const timer = { startedAt: "2026-10-01T10:00:00Z", pausedTotalSeconds: 60 };
  assert.equal(timerElapsed(timer, Date.parse("2026-10-01T10:42:18Z")), 2478);
  assert.equal(
    timerElapsed(
      { ...timer, pausedAt: "2026-10-01T10:10:00Z" },
      Date.parse("2026-10-02T00:00:00Z"),
    ),
    540,
  );
  assert.equal(timerElapsed(timer, Date.parse("2026-10-01T09:00:00Z")), 0);
});
test("streak threshold sums sessions and lets an unstudied today finish", () => {
  const sessions = [
    session("2026-10-01"),
    session("2026-10-02", 5),
    session("2026-10-02", 5),
    session("2026-10-03"),
  ];
  assert.deepEqual(
    streaks(sessions, "UTC", Date.parse("2026-10-04T15:00:00Z")),
    { current: 3, longest: 3 },
  );
  assert.deepEqual(
    streaks(sessions, "UTC", Date.parse("2026-10-05T15:00:00Z")),
    { current: 0, longest: 3 },
  );
  assert.equal(
    streaks(sessions, "UTC", Date.parse("2026-10-04T15:00:00Z"), 10, 18)
      .longest,
    18,
  );
});
test("invalid and under-minute sessions do not count", () => {
  assert.deepEqual(
    dailySeconds(
      [
        session("2026-10-01", 0.5),
        session("2026-10-01", 10, { status: "discarded" }),
      ],
      "UTC",
    ),
    {},
  );
  assert.equal(
    streaks(
      [session("2026-10-01", 9)],
      "UTC",
      Date.parse("2026-10-01T15:00:00Z"),
    ).current,
    0,
  );
});
test("timezones and local midnight split a session correctly", () => {
  assert.equal(localDay("2026-10-01T20:00:00Z", "Asia/Colombo"), "2026-10-02");
  assert.equal(
    zonedToUtc("2026-10-02T00:00", "Asia/Colombo"),
    "2026-10-01T18:30:00.000Z",
  );
  const totals = dailySeconds(
    [
      {
        startedAt: "2026-10-01T18:20:00Z",
        endedAt: "2026-10-01T18:40:00Z",
        durationSeconds: 1200,
        status: "valid",
      },
    ],
    "Asia/Colombo",
  );
  assert.deepEqual(totals, { "2026-10-01": 600, "2026-10-02": 600 });
});
test("DST day boundaries and paused session allocation", () => {
  assert.equal(
    zonedToUtc("2026-03-09T00:00", "America/New_York"),
    "2026-03-09T04:00:00.000Z",
  );
  const totals = dailySeconds(
    [
      {
        startedAt: "2026-03-08T05:00:00Z",
        endedAt: "2026-03-09T04:00:00Z",
        durationSeconds: 3600,
        status: "valid",
      },
    ],
    "America/New_York",
  );
  assert.deepEqual(totals, { "2026-03-08": 3600 });
});
test("weekly period respects user's first weekday", () => {
  assert.equal(weekStart("2026-10-04", 1), "2026-09-28");
  assert.equal(weekStart("2026-10-04", 0), "2026-10-04");
  assert.equal(
    periodSeconds(
      [session("2026-10-01"), session("2026-10-04")],
      "UTC",
      "2026-10-01",
      "2026-10-03",
    ),
    600,
  );
});
