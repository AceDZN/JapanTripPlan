/*
 * Status lines, asserted against the tools the agent actually has.
 *
 * The failure this guards against is not a crash: it is nine identical
 * "עובד על זה" rows stacked in the chat, which is what an uncovered tool looks
 * like to the family. So the coverage test reads the agent's own tool directory
 * (`trip-agent/agent/tools/*.ts`, where a file is the tool and `disableTool()`
 * means it is switched off) rather than a list copied by hand into this file.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { GENERIC_STATUS, toolStatusLabel } from "../components/chat/tool-labels.ts";

const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../trip-agent/agent/tools");

/** Tool names the eve framework supplies, which have no file in that directory. */
const FRAMEWORK_TOOLS = ["web_search", "web_fetch", "todo", "load_skill", "ask_question"];

/** Every tool the agent still exposes: its own enabled files, plus eve's. */
function agentToolNames() {
  const own = readdirSync(TOOLS_DIR)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => !readFileSync(join(TOOLS_DIR, file), "utf8").includes("disableTool"))
    .map((file) => file.replace(/\.ts$/, ""));

  assert.ok(own.length > 5, "the agent tool directory should not have gone empty");
  return [...own, ...FRAMEWORK_TOOLS];
}

test("every tool the agent can call has its own Hebrew status line", () => {
  const uncovered = agentToolNames().filter(
    (name) => toolStatusLabel(name, undefined) === GENERIC_STATUS,
  );

  assert.deepEqual(uncovered, [], "these tools would render as an anonymous spinner");
});

test("no two tools share a status line, so repeats mean a real repeat", () => {
  const seen = new Map();

  for (const name of agentToolNames()) {
    const label = toolStatusLabel(name, undefined);
    assert.equal(seen.has(label), false, `${name} reuses the line of ${seen.get(label)}`);
    seen.set(label, name);
  }
});

test("a call names what it is working on once its input has streamed", () => {
  assert.equal(toolStatusLabel("get_day", { day: 5 }), "בודק את יום 5");
  assert.equal(toolStatusLabel("read_guide", { file: "05-FOOD-GUIDE.md" }), "קורא את מדריך האוכל");
  assert.equal(toolStatusLabel("web_search", { query: "פוקימון סנטר" }), "מחפש ברשת ״פוקימון סנטר״");
  assert.equal(toolStatusLabel("search_places", { query: "ראמן" }), "מחפש ״ראמן״ בין המקומות");
  assert.equal(toolStatusLabel("money_report", { dayN: 12 }), "מסכם את ההוצאות של יום 12");
  assert.equal(toolStatusLabel("record_spend", { title: "גצ׳אפון" }), "רושם הוצאה: ״גצ׳אפון״");
  assert.equal(toolStatusLabel("mark_done", { item_text: "ויזה" }), "מסמן ״ויזה״ כבוצע");
  assert.equal(toolStatusLabel("mark_done", { item_text: "ויזה", done: false }), "פותח מחדש את ״ויזה״");
});

test("web_fetch names the site, not the whole url", () => {
  assert.equal(
    toolStatusLabel("web_fetch", { url: "https://www.pokemoncenter-online.com/shop/x?y=1" }),
    "קורא ב־pokemoncenter-online.com",
  );
  // A half-streamed or malformed url falls back rather than rendering garbage.
  assert.equal(toolStatusLabel("web_fetch", { url: "https://" }), "קורא דף באינטרנט");
  assert.equal(toolStatusLabel("web_fetch", {}), "קורא דף באינטרנט");
});

test("a long query is trimmed to one line", () => {
  const label = toolStatusLabel("web_search", {
    query: "איפה אפשר לקנות פיגורת פיקאצ׳ו מהדורה מוגבלת בטוקיו בזול",
  });

  assert.ok(label.length < 50, `status line too long to read: ${label}`);
  assert.ok(label.endsWith("…״"), "the trimmed query keeps its closing quote");
});

test("the camelCase transport maps onto the same lines as the snake_case one", () => {
  for (const [snake, camel] of [
    ["read_guide", "readGuide"],
    ["search_places", "searchPlaces"],
    ["nearby_places", "nearbyPlaces"],
    ["web_search", "webSearch"],
  ]) {
    assert.equal(toolStatusLabel(camel, undefined), toolStatusLabel(snake, undefined));
  }
});
