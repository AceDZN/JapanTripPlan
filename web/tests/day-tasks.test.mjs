/*
 * Which preparation task shows up on which day page.
 *
 * The rule is easy to state and easy to break: a task appears on every trip day
 * its `[doFrom, due]` window covers, and on no day at all when its deadline
 * falls before the trip. The failure modes are both silent and both bad — a
 * task that never surfaces (nobody collects the tickets) or one that surfaces
 * on all seventeen days (everybody stops reading the panel) — so they get
 * asserted rather than eyeballed.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

/** Same loader as `route-chapters.test.mjs` — see the note there. */
function load(relative, rewrites = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  let js = transpileModule(source, {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, replacement] of Object.entries(rewrites)) {
    js = js.replaceAll(`"${specifier}"`, `"${replacement}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
}

const { taskWindow, taskCoversDate, tasksForDate, tripDaysForTask } = await import(
  load("../lib/trip-time.ts", { "@/lib/types": "data:text/javascript,export {}" })
);

const task = (id, extra = {}) => ({ id, group: "g", title: id, ...extra });

/** The real pickup task: possible from landing, needed before the 15:00 entry. */
const pickup = task("pixar-pickup", {
  doFrom: "2026-10-02",
  due: "2026-10-03",
  critical: true,
});
/** A same-day task — the teamLab QR codes, which only exist after midnight. */
const qr = task("teamlab-qr", { due: "2026-10-04", critical: true });
/** The great majority: a deadline months before anyone boards a plane. */
const preTrip = task("buy-usj", { due: "2026-08-20" });
/** No deadline at all — belongs on /prepare and nowhere else. */
const undated = task("pack-socks");

test("a window spans doFrom..due, and a bare due is a single day", () => {
  assert.deepEqual(taskWindow(pickup), ["2026-10-02", "2026-10-03"]);
  assert.deepEqual(taskWindow(qr), ["2026-10-04", "2026-10-04"]);
});

test("a task with no deadline has no window and lands on no day", () => {
  assert.equal(taskWindow(undated), null);
  assert.equal(taskCoversDate(undated, "2026-10-04"), false);
});

test("the pickup shows on both days of its window and neither side of it", () => {
  assert.equal(taskCoversDate(pickup, "2026-10-01"), false);
  assert.equal(taskCoversDate(pickup, "2026-10-02"), true);
  assert.equal(taskCoversDate(pickup, "2026-10-03"), true);
  assert.equal(taskCoversDate(pickup, "2026-10-04"), false);
});

test("a pre-trip deadline never reaches a day page", () => {
  for (const date of ["2026-10-01", "2026-10-02", "2026-10-17"]) {
    assert.equal(taskCoversDate(preTrip, date), false);
  }
});

test("doFrom later than due collapses to the deadline, not an empty window", () => {
  // A data error. Hiding a task somebody flagged as critical is the worst
  // available response to it, so the window collapses to the deadline instead.
  const broken = task("typo", { doFrom: "2026-10-09", due: "2026-10-03" });
  assert.deepEqual(taskWindow(broken), ["2026-10-03", "2026-10-03"]);
  assert.equal(taskCoversDate(broken, "2026-10-03"), true);
});

test("a day's tasks are ordered by which deadline runs out first", () => {
  const later = task("later", { doFrom: "2026-10-02", due: "2026-10-09" });
  const found = tasksForDate([later, pickup, qr, preTrip, undated], "2026-10-02");
  assert.deepEqual(
    found.map((item) => item.id),
    ["pixar-pickup", "later"],
  );
});

test("a day with nothing due gets an empty list, so the panel can hide", () => {
  assert.deepEqual(tasksForDate([pickup, qr, preTrip, undated], "2026-10-06"), []);
});

test("/prepare can name the days a dated task will appear on", () => {
  const days = [
    { day: 2, date: "2026-10-02" },
    { day: 3, date: "2026-10-03" },
    { day: 4, date: "2026-10-04" },
  ];
  assert.deepEqual(
    tripDaysForTask(days, pickup).map((d) => d.day),
    [2, 3],
  );
  assert.deepEqual(
    tripDaysForTask(days, qr).map((d) => d.day),
    [4],
  );
  assert.deepEqual(tripDaysForTask(days, preTrip), []);
});
