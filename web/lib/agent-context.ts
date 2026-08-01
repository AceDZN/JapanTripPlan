/**
 * Stamping the verified speaker onto an outgoing agent turn.
 *
 * Extracted from `app/api/agent/[...path]/route.ts` so the rewrite can be
 * tested directly: it decides which family member the agent believes it is
 * talking to, and a silent regression there would either misattribute someone's
 * wish or leak a private one.
 */

/**
 * The clause the agent reads to know who it is talking to.
 *
 * It rides inside the existing `[הקשר: …]` metadata part, which the agent
 * already treats as trusted app-supplied context and which the chat never
 * renders — so nothing about the conversation looks different to the family.
 *
 * A turn with no clause means "signed out, or not a family member". The agent's
 * instructions require it to refuse to attribute a wish, and to say nothing at
 * all about private wishes, in that case.
 */
const SPEAKER_CLAUSE = "משתמש";

/**
 * The clause carrying what the speaker is ALLOWED to do.
 *
 * Split from the speaker clause on purpose: the agent needs "who" for
 * attribution (whose wish is this) and "what rank" for authority (may this
 * person approve a change to the plan), and they are answered by different
 * questions. Keeping them separate means a prompt that reads one does not
 * accidentally depend on the format of the other.
 *
 * Values are the English `FamilyRole` literals — `owner`, `adult`, `kid` — and
 * deliberately NOT translated. The agent matches on them, and a role that
 * changes spelling between the allowlist and the prompt is a bug waiting to
 * happen.
 *
 * Critically, this is stripped from client input for the same reason the
 * speaker clause is: a browser that could write `תפקיד: owner` into its own
 * turn would hand itself approval rights.
 */
const ROLE_CLAUSE = "תפקיד";

/** `[` … `]` of the leading context part, if the client sent one. */
const CONTEXT_LINE = /^(\s*\[הקשר:)([^\]]*)(\])/;

/**
 * Rewrite the outgoing body so the first text part carries the verified
 * speaker.
 *
 * Any `משתמש:` the client put there itself is stripped first: the browser does
 * not get a vote on who it is. If the body is not the shape we expect, it is
 * forwarded untouched — a relay is a bad place to start rejecting payloads it
 * merely does not recognise.
 */
export function withVerifiedSpeaker(
  raw: string,
  member: { name: string; email: string; role?: string } | null,
): string {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return raw;
  }

  if (typeof payload !== "object" || payload === null) return raw;
  const message = (payload as { message?: unknown }).message;

  const stamp = (line: string): string => {
    const match = CONTEXT_LINE.exec(line);
    const inner = (match ? match[2] : "")
      .split(";")
      .map((clause) => clause.trim())
      .filter(
        (clause) =>
          clause.length > 0 &&
          !clause.startsWith(`${SPEAKER_CLAUSE}:`) &&
          !clause.startsWith(`${ROLE_CLAUSE}:`),
      );

    if (member) {
      inner.push(`${SPEAKER_CLAUSE}: ${member.name} <${member.email}>`);
      // Only ever from the server-resolved allowlist entry. A member without a
      // role is not given one by default — silence is safer than guessing, and
      // the agent treats a missing role as "cannot approve".
      if (member.role) inner.push(`${ROLE_CLAUSE}: ${member.role}`);
    }

    if (!match) {
      // Nothing to rewrite; only add a line when we actually know who this is.
      return member ? `[הקשר: ${inner.join("; ")}]\n${line}` : line;
    }

    // There WAS a context line, so it must be rebuilt from the filtered clauses
    // even when that leaves it empty. Returning the original here would forward
    // a client-supplied `משתמש:` untouched whenever nobody is signed in — which
    // is precisely the impersonation this function exists to prevent.
    const rebuilt = inner.length > 0 ? `[הקשר: ${inner.join("; ")}]` : "";
    return line.replace(CONTEXT_LINE, rebuilt).trimStart();
  };

  if (typeof message === "string") {
    (payload as { message: unknown }).message = stamp(message);
    return JSON.stringify(payload);
  }

  if (Array.isArray(message)) {
    const first = message.find(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text",
    );
    if (first) first.text = stamp(first.text);
    else if (member) {
      // No text part to rewrite (an image-only turn, say). `stamp("")` builds
      // the same clause list the text path would, so the role travels here too
      // rather than this branch quietly dropping it.
      message.unshift({ type: "text", text: stamp("").trim() });
    }
    return JSON.stringify(payload);
  }

  return raw;
}
