/*
 * The wording on an approval card.
 *
 * This is the one moment the family is asked to *decide* something, and eve's
 * own prompt for it is `Approve tool call: edit_plan_doc` — English, and about
 * a function rather than an act. Every gated tool therefore needs copy that
 * names what will happen and shows the specifics of this particular call; a
 * card that falls through to the generic branch is asking someone to approve
 * something they cannot see.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { approvalCopy, guideTitles } from "../components/chat/tool-labels.ts";

/**
 * Guide titles as `api.trip.listGuides` returns them.
 *
 * The card used to read these from a map hand-written in `tool-labels.ts`,
 * which had drifted from Convex in eleven of twelve entries — so the family
 * was being asked to approve an edit to a document under a name the app no
 * longer used anywhere else. They are passed in now, and this is that list.
 */
const TITLES = guideTitles([
  { file: "09-DAILY-ITINERARY.md", title: "המסלול היומי" },
  { file: "11-PRE-TRIP-CHECKLIST.md", title: "הכנות לטיול" },
]);

/** Every tool carrying `approval: always()` in trip-agent/agent/tools. */
const GATED = ["edit_plan_doc", "edit_content", "set_image", "mark_done", "record_spend", "set_price"];

test("every gated tool has its own Hebrew title", () => {
  const titles = new Set();

  for (const tool of GATED) {
    const { title } = approvalCopy(tool, {});
    assert.doesNotMatch(title, /[a-z_]{4,}/, `${tool} fell through to the generic branch`);
    assert.match(title, /[֐-׿]/, `${tool} must read as Hebrew`);
    titles.add(title);
  }

  assert.equal(titles.size, GATED.length, "two tools sharing a title would hide which one is running");
});

test("an edit shows the summary and both sides of the change", () => {
  const copy = approvalCopy(
    "edit_plan_doc",
    {
      file: "11-PRE-TRIP-CHECKLIST.md",
      summary: "להוסיף מתאמי תקע",
      old_string: "- [ ] מטענים",
      new_string: "- [ ] מטענים\n- [ ] 3 מתאמי תקע",
    },
    TITLES,
  );

  assert.match(copy.title, /הכנות לטיול/, "the guide is named as a person would name it");
  const rows = Object.fromEntries(copy.details.map((detail) => [detail.label, detail.value]));
  assert.equal(rows["השינוי"], "להוסיף מתאמי תקע");
  assert.match(rows["במקום"], /מטענים/);
  assert.match(rows["יהיה"], /מתאמי תקע/);
  assert.match(copy.confirm, /אישור/, "the tool only files a suggestion — the button must not promise more");
});

test("an empty replacement reads as a deletion rather than a blank row", () => {
  const copy = approvalCopy("edit_plan_doc", {
    file: "09-DAILY-ITINERARY.md",
    summary: "להוריד את הסעיף",
    old_string: "14:30 מוזיאון נינטנדו",
    new_string: "",
  });

  const after = copy.details.find((detail) => detail.label === "יהיה");
  assert.match(after.value, /יימחק/);
});

test("the camelCase transport maps onto the same copy as the snake_case one", () => {
  assert.deepEqual(
    approvalCopy("mark_done", { item_text: "להזמין כרטיסים ל-teamLab" }),
    approvalCopy("markDone", { itemText: "להזמין כרטיסים ל-teamLab" }),
  );
});

test("reopening a checklist item is not described as ticking it", () => {
  const reopen = approvalCopy("mark_done", { item_text: "דרכונים", done: false });
  assert.match(reopen.title, /לפתוח מחדש/);
  assert.doesNotMatch(reopen.confirm, /בוצע/);
});

test("a spend shows the amount in the currency it was charged in", () => {
  const copy = approvalCopy("record_spend", {
    title: "כרטיסים ל-teamLab",
    amount: 3800,
    currency: "JPY",
    dayN: 6,
  });

  const rows = Object.fromEntries(copy.details.map((detail) => [detail.label, detail.value]));
  assert.match(rows["סכום"], /3,800/, "an unformatted number is how a 38000 slips past a reader");
  assert.match(rows["סכום"], /JPY/);
  assert.equal(rows["יום"], "יום 6");
});

test("a budget range renders as a range, and a single figure as one figure", () => {
  const range = approvalCopy("set_price", { target: "envelope", slug: "food", minYen: 4000, maxYen: 7000 });
  assert.match(range.details.find((detail) => detail.label === "סכום").value, /4,000–7,000/);

  const single = approvalCopy("set_price", { target: "day", dayN: 3, blockTitle: "ארוחת ערב", maxYen: 5000 });
  assert.equal(single.details.find((detail) => detail.label === "סכום").value, "5,000 ¥");
});

test("a long edit is clipped but still long enough to recognise", () => {
  const long = "א".repeat(400);
  const copy = approvalCopy("edit_plan_doc", { file: "00-OVERVIEW.md", new_string: long });
  const after = copy.details.find((detail) => detail.label === "יהיה").value;

  assert.ok(after.length < long.length, "a 400-character row would swallow the buttons");
  assert.ok(after.length > 100, "clipped past recognition is the same as showing nothing");
  assert.match(after, /…$/);
});

test("an unknown gated tool still names itself rather than rendering blank", () => {
  const copy = approvalCopy("some_future_tool", {});
  assert.match(copy.title, /some_future_tool/);
  assert.match(copy.confirm, /אישור/);
});

test("a legacy session budget gate is presented as continuing the conversation", () => {
  const copy = approvalCopy("session_limit_continuation", {
    kind: "input",
    limit: 2_000_000,
    usedTokens: 2_073_057,
  });

  assert.equal(copy.title, "השיחה ארוכה — להמשיך מאותה נקודה?");
  assert.equal(copy.confirm, "להמשיך בשיחה");
  assert.deepEqual(copy.details, []);
});

test("a content edit never claims more than it will do", () => {
  const factual = approvalCopy("edit_content", {
    table: "places",
    op: "patch",
    key: "fushimi-inari-taisha",
    fields: { openingHours: "24 שעות", lastEntry: "16:00" },
    rationale: "מהאתר הרשמי",
  });

  const rows = Object.fromEntries(factual.details.map((d) => [d.label, d.value]));
  assert.equal(rows["מקום"], "fushimi-inari-taisha");
  assert.match(rows["שדות"], /openingHours/);
  assert.match(rows["למה"], /הרשמי/);
  // The card must not promise the edit lands, because half of one may not.
  assert.match(rows["מה יקרה"], /אלכס/);

  const creation = approvalCopy("edit_content", { table: "places", op: "create", key: "new-ramen" });
  const createRows = Object.fromEntries(creation.details.map((d) => [d.label, d.value]));
  assert.match(createRows["מה יקרה"], /תמיד/, "create is never applied straight away");
});

test("a picture names its source and says the change is immediate", () => {
  const copy = approvalCopy("set_image", {
    table: "places",
    key: "fushimi-inari-taisha",
    slot: "gallery",
    url: "https://upload.wikimedia.org/wikipedia/commons/2/2c/Torii.jpg",
    alt: "שביל הטוריאים האדומים",
  });

  const rows = Object.fromEntries(copy.details.map((d) => [d.label, d.value]));
  assert.equal(rows["מקור"], "upload.wikimedia.org", "the host, not an unreadable CDN URL");
  assert.match(rows["מה רואים"], /טוריאים/);
  // A picture is a FACT, so unlike a plan change it does not mention Alex.
  assert.match(rows["מה יקרה"], /מיד/);
  assert.doesNotMatch(rows["מה יקרה"], /אלכס/);
});
