/*
 * The eve wire contract, asserted against a mocked NDJSON stream.
 *
 * Event shapes follow the installed package docs — the real agent deployment
 * is not needed (and may not exist yet):
 *   eve/docs/concepts/sessions-runs-and-streaming.md
 *   eve/docs/channels/eve.mdx
 *   eve/docs/guides/client/{messages,streaming}.mdx
 *   eve/dist/src/protocol/message.d.ts  (stream version 19)
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTEXT_PREFIX,
  EVE_INITIAL_STATE,
  GEO_FRESH_MS,
  VOICE_BUBBLE_LABEL,
  VOICE_TEXT_PART,
  buildContextLine,
  contextTimeZone,
  isContextPart,
  isFreshFix,
  isoWithOffset,
  parseNdjson,
  readUserMessage,
  reduceEve,
  stripContextLines,
  visibleMessages,
} from "../components/chat/eve-protocol.ts";

/** Hebrew labels, exactly as the live chat maps them. */
function label(toolName, input) {
  if (toolName === "read_guide") return `קורא את ${input?.file ?? ""}`;
  if (toolName === "get_day") return `בודק את יום ${input?.day ?? ""}`;
  if (toolName === "search_places") return `מחפש ״${input?.query ?? ""}״`;
  return "עובד על זה";
}

/** Folds a whole event list, exactly like the streaming consumer does. */
function play(events, initial = EVE_INITIAL_STATE) {
  return events.reduce((state, event) => reduceEve(state, event, label), initial);
}

const TURN = "turn_1";

/** One complete turn: user asks, agent calls a tool, agent answers. */
const FIRST_TURN = [
  { type: "session.started", data: { runtime: { modelId: "google/gemini-3-pro" } } },
  { type: "turn.started", data: { sequence: 1, turnId: TURN } },
  {
    type: "message.received",
    data: {
      message: "מה התוכנית ליום 5?",
      parts: [{ type: "text", text: "מה התוכנית ליום 5?" }],
      sequence: 2,
      turnId: TURN,
    },
  },
  { type: "step.started", data: { sequence: 3, stepIndex: 0, turnId: TURN } },
  {
    type: "message.completed",
    data: {
      finishReason: "tool-calls",
      message: "רגע, בודק את היומן…",
      sequence: 4,
      stepIndex: 0,
      turnId: TURN,
    },
  },
  {
    type: "actions.requested",
    data: {
      actions: [{ callId: "call_1", input: { day: 5 }, kind: "tool-call", toolName: "get_day" }],
      sequence: 5,
      stepIndex: 0,
      turnId: TURN,
    },
  },
  {
    type: "action.result",
    data: {
      result: { callId: "call_1", kind: "tool-result", output: "…", toolName: "get_day" },
      sequence: 6,
      stepIndex: 0,
      status: "completed",
      turnId: TURN,
    },
  },
  { type: "step.completed", data: { finishReason: "tool-calls", sequence: 7, stepIndex: 0, turnId: TURN } },
  {
    type: "message.appended",
    data: { messageDelta: "ביום 5 ", messageSoFar: "ביום 5 ", sequence: 8, stepIndex: 1, turnId: TURN },
  },
  {
    type: "message.appended",
    data: {
      messageDelta: "אתם ב־PokéPark.",
      messageSoFar: "ביום 5 אתם ב־PokéPark.",
      sequence: 9,
      stepIndex: 1,
      turnId: TURN,
    },
  },
  {
    type: "message.completed",
    data: {
      finishReason: "stop",
      message: "ביום 5 אתם ב־PokéPark.",
      sequence: 10,
      stepIndex: 1,
      turnId: TURN,
    },
  },
  { type: "turn.completed", data: { sequence: 11, turnId: TURN } },
  { type: "session.waiting", data: { continuationToken: "eve:token-1", wait: "next-user-message" } },
];

test("rebuilds the transcript from a startIndex=0 replay", () => {
  const state = play(FIRST_TURN);
  const messages = visibleMessages(state.messages);

  assert.equal(messages.length, 2, "one user bubble, one assistant bubble");
  assert.equal(messages[0].role, "user");
  assert.equal(messages[0].text, "מה התוכנית ליום 5?");
  assert.equal(messages[1].role, "assistant");
  assert.equal(messages[1].text, "ביום 5 אתם ב־PokéPark.");
  assert.equal(messages[1].final, true);
  assert.equal(messages[1].streaming, false);
});

test("drops interim tool-call narration and keeps only the terminal answer", () => {
  // The interim `message.completed` carries finishReason "tool-calls" — the
  // only non-terminal assistant step in the harness.
  const upToNarration = play(FIRST_TURN.slice(0, 5));
  assert.equal(upToNarration.messages.at(-1).text, "", "narration is discarded");

  const settled = play(FIRST_TURN);
  assert.equal(
    settled.messages.at(-1).text,
    "ביום 5 אתם ב־PokéPark.",
    "narration must not be prepended to the answer",
  );
});

test("renders tool calls as Hebrew status lines and marks them done on the result", () => {
  const beforeResult = play(FIRST_TURN.slice(0, 6));
  const live = beforeResult.messages.at(-1).activity;
  assert.deepEqual(live, [{ id: "call_1", label: "בודק את יום 5", done: false }]);

  const afterResult = play(FIRST_TURN.slice(0, 7));
  assert.equal(afterResult.messages.at(-1).activity[0].done, true);
});

test("correlates incrementally streamed calls by call id instead of duplicating", () => {
  const events = [
    { type: "turn.started", data: { turnId: TURN } },
    {
      type: "actions.requested",
      data: { actions: [{ callId: "c1", kind: "tool-call", toolName: "search_places", input: {} }], turnId: TURN },
    },
    {
      type: "actions.requested",
      data: {
        actions: [{ callId: "c1", kind: "tool-call", toolName: "search_places", input: { query: "ראמן" } }],
        turnId: TURN,
      },
    },
    {
      type: "actions.requested",
      data: { actions: [{ callId: "c2", kind: "tool-call", toolName: "read_guide", input: { file: "מדריך" } }], turnId: TURN },
    },
  ];

  const activity = play(events).messages.at(-1).activity;
  assert.equal(activity.length, 2);
  assert.equal(activity[0].label, "מחפש ״ראמן״", "a later call refines its own label");
  assert.equal(activity[1].label, "קורא את מדריך");
});

test("captures the continuation token from session.waiting", () => {
  const first = play(FIRST_TURN);
  assert.equal(first.continuationToken, "eve:token-1");
  assert.equal(first.status, "waiting");

  const second = play(
    [{ type: "session.waiting", data: { continuationToken: "eve:token-2", wait: "next-user-message" } }],
    first,
  );
  assert.equal(second.continuationToken, "eve:token-2", "each turn rotates the token");
});

test("cursor counts every consumed event, which is the reconnect startIndex", () => {
  const state = play(FIRST_TURN);
  assert.equal(state.cursor, FIRST_TURN.length);

  // Reconnecting at the cursor must not replay anything already rendered.
  const resumed = play(
    [
      { type: "turn.started", data: { turnId: "turn_2" } },
      { type: "message.received", data: { message: "ותודה", parts: [{ type: "text", text: "ותודה" }], sequence: 20, turnId: "turn_2" } },
    ],
    state,
  );
  assert.equal(resumed.cursor, FIRST_TURN.length + 2);
  assert.equal(visibleMessages(resumed.messages).length, 3);
});

test("renders an audio attachment as a voice bubble", () => {
  const state = play([
    { type: "turn.started", data: { turnId: "turn_v" } },
    {
      type: "message.received",
      data: {
        message: VOICE_TEXT_PART,
        parts: [
          { type: "text", text: VOICE_TEXT_PART },
          { type: "file", mediaType: "audio/webm", filename: "voice.webm", size: 20480 },
        ],
        sequence: 2,
        turnId: "turn_v",
      },
    },
  ]);

  const bubble = state.messages[0];
  assert.equal(bubble.role, "user");
  assert.equal(bubble.audio, true);
  assert.equal(bubble.text, VOICE_BUBBLE_LABEL);
});

test("keeps message.received above the assistant bubble of the same turn", () => {
  const state = play(FIRST_TURN.slice(0, 6));
  assert.equal(state.messages[0].role, "user", "turn.started must not open a bubble early");
  assert.equal(state.messages[1].role, "assistant");
});

test("settles the turn on cancel without reporting a failure", () => {
  const cancelled = play([
    ...FIRST_TURN.slice(0, 9),
    { type: "turn.cancelled", data: { sequence: 20, turnId: TURN } },
    { type: "session.waiting", data: { continuationToken: "eve:token-x", wait: "next-user-message" } },
  ]);

  assert.equal(cancelled.error, null, "cancellation is not a failure");
  assert.equal(cancelled.status, "waiting");
  assert.equal(cancelled.messages.every((message) => !message.streaming), true);
  assert.equal(cancelled.continuationToken, "eve:token-x");
});

test("surfaces turn and session failures in Hebrew", () => {
  const failed = play([
    { type: "turn.started", data: { turnId: "t" } },
    { type: "turn.failed", data: { code: "rate_limit", message: "429 rate limit exceeded", turnId: "t" } },
  ]);

  assert.equal(failed.status, "failed");
  assert.match(failed.error, /יותר מדי בקשות/);
});

test("shows an input request as answerable assistant text", () => {
  const asked = play([
    { type: "turn.started", data: { turnId: "t" } },
    {
      type: "input.requested",
      data: {
        requests: [{ requestId: "r1", prompt: "לאיזה יום להוסיף את זה?", action: { callId: "c", kind: "tool-call", toolName: "get_day", input: {} } }],
        turnId: "t",
      },
    },
  ]);

  assert.match(asked.messages.at(-1).text, /לאיזה יום/);
});

test("parses NDJSON across chunk boundaries and skips malformed lines", () => {
  const wire = FIRST_TURN.map((event) => JSON.stringify(event)).join("\n") + "\n";

  // Feed the bytes in awkward slices, the way a network stream arrives.
  let buffer = "";
  const collected = [];
  for (let at = 0; at < wire.length; at += 37) {
    buffer += wire.slice(at, at + 37);
    const { events, rest } = parseNdjson(buffer);
    buffer = rest;
    collected.push(...events);
  }

  assert.equal(collected.length, FIRST_TURN.length);
  assert.deepEqual(collected.map((event) => event.type), FIRST_TURN.map((event) => event.type));

  const { events } = parseNdjson('{"type":"turn.started"}\n{ broken\n\n{"type":"turn.completed"}\n');
  assert.deepEqual(events.map((event) => event.type), ["turn.started", "turn.completed"]);
});

/* ========================================================================== */
/* Location + time context                                                     */
/* ========================================================================== */

/** Mid-trip: 2026-10-05, 14:32:10 Tokyo time. */
const DURING_TRIP = new Date("2026-10-05T05:32:10.000Z");
/** Long before the trip. */
const BEFORE_TRIP = new Date("2026-07-26T09:00:00.000Z");

const TOKYO_FIX = { lat: 35.6585805, lng: 139.7454329, accuracy: 18.4, at: Date.now() };

test("stamps the context line in Tokyo time during the trip", () => {
  assert.equal(contextTimeZone(DURING_TRIP), "Asia/Tokyo");
  assert.equal(
    buildContextLine({ now: DURING_TRIP }),
    "[הקשר: 2026-10-05T14:32:10+09:00]",
    "time clause is always present, location clause is not",
  );
});

test("falls back to the device zone outside the trip window", () => {
  assert.equal(contextTimeZone(BEFORE_TRIP), undefined, "no Tokyo clock before the trip");

  // The device offset is whatever this machine runs on, so assert the shape
  // plus a zone the test can pin down exactly.
  assert.match(buildContextLine({ now: BEFORE_TRIP }), /^\[הקשר: [\d-]{10}T[\d:]{8}[+-]\d{2}:\d{2}\]$/);
  assert.equal(isoWithOffset(BEFORE_TRIP, "America/New_York"), "2026-07-26T05:00:00-04:00");
  assert.equal(isoWithOffset(DURING_TRIP, "Asia/Tokyo"), "2026-10-05T14:32:10+09:00");
});

test("appends the location clause with five decimals and rounded accuracy", () => {
  assert.equal(
    buildContextLine({ now: DURING_TRIP, location: TOKYO_FIX }),
    "[הקשר: 2026-10-05T14:32:10+09:00; מיקום: 35.65858,139.74543 דיוק 18מ׳]",
  );
});

test("omits the location clause when sharing is off or the fix is missing", () => {
  // `useGeoContext` resolves to `null` when the toggle is off, denied, or the
  // lookup timed out — all four collapse to the same wire shape.
  for (const location of [null, undefined]) {
    const line = buildContextLine({ now: DURING_TRIP, location });
    assert.equal(line.includes("מיקום"), false);
    assert.equal(line, "[הקשר: 2026-10-05T14:32:10+09:00]");
  }
});

test("reuses a cached fix for five minutes and no longer", () => {
  const now = 1_800_000_000_000;
  assert.equal(isFreshFix({ ...TOKYO_FIX, at: now - 1_000 }, now), true);
  assert.equal(isFreshFix({ ...TOKYO_FIX, at: now - (GEO_FRESH_MS - 1) }, now), true);
  assert.equal(isFreshFix({ ...TOKYO_FIX, at: now - GEO_FRESH_MS }, now), false);
  assert.equal(isFreshFix(null, now), false);
});

test("recognises and peels the context prefix", () => {
  const line = buildContextLine({ now: DURING_TRIP, location: TOKYO_FIX });

  assert.equal(isContextPart(line), true);
  assert.equal(isContextPart(`  ${line}`), true, "leading whitespace still counts");
  assert.equal(isContextPart("מה יש לאכול פה?"), false);
  assert.equal(isContextPart(`שאלה על ${CONTEXT_PREFIX} משהו`), false, "only a prefix, not a substring");

  // The AI SDK fallback carries the line inside the message text.
  assert.equal(stripContextLines(`${line}\nמה יש לאכול פה?`), "מה יש לאכול פה?");
  // The flattened `message.received` summary may join parts inline.
  assert.equal(stripContextLines(`${line} מה יש לאכול פה?`), "מה יש לאכול פה?");
  assert.equal(stripContextLines("מה יש לאכול פה?"), "מה יש לאכול פה?");
});

test("never renders the context part in a replayed user bubble", () => {
  const line = buildContextLine({ now: DURING_TRIP, location: TOKYO_FIX });

  // Exactly what the send path puts on the wire: context part, then the words.
  const state = play([
    { type: "turn.started", data: { turnId: "turn_ctx" } },
    {
      type: "message.received",
      data: {
        message: `${line} מה יש לאכול פה?`,
        parts: [
          { type: "text", text: line },
          { type: "text", text: "מה יש לאכול פה?" },
        ],
        sequence: 2,
        turnId: "turn_ctx",
      },
    },
  ]);

  const bubble = state.messages[0];
  assert.equal(bubble.text, "מה יש לאכול פה?");
  assert.equal(bubble.text.includes("הקשר"), false);
  assert.equal(bubble.text.includes("35.65858"), false, "coordinates never reach the UI");
});

test("a voice turn keeps its 🎤 bubble even with a context part attached", () => {
  const line = buildContextLine({ now: DURING_TRIP, location: TOKYO_FIX });

  const { text, audio } = readUserMessage({
    message: `${line} ${VOICE_TEXT_PART}`,
    parts: [
      { type: "text", text: line },
      { type: "text", text: VOICE_TEXT_PART },
      { type: "file", mediaType: "audio/webm", filename: "voice.webm", size: 20480 },
    ],
  });

  assert.equal(audio, true);
  assert.equal(text, VOICE_BUBBLE_LABEL);
});

test("hides the context part when only the flattened summary survived", () => {
  const line = buildContextLine({ now: DURING_TRIP });
  const { text } = readUserMessage({ message: `${line}\nמה התוכנית להיום?` });
  assert.equal(text, "מה התוכנית להיום?");
});
