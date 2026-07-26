// Writing back to the canonical trip documents.
//
// JAPAN2026/*.md is the single source of truth for the whole trip: the webapp
// rebuilds its guide pages and AI context from those files at build time, and
// this agent rebuilds its own knowledge bundle (agent/data/content.ts) from them
// too. So the only correct way for the concierge to change the plan is to change
// the markdown in the repo — which is what this module does, through the GitHub
// Contents API (GET for the blob sha, PUT with the new content).
//
// IMPORTANT (staleness window): a committed edit only reaches this agent's own
// bundled content on the *next deployment*, which the git integration starts
// automatically but which takes a few minutes. Within the conversation that made
// the edit, the model must trust what it just wrote over what `read_guide` /
// `get_day` return — those still serve the pre-edit bundle.
//
// Commit messages are plain "Trip update: <summary>". Never add co-author or
// attribution trailers.

/** Directory in the repo that holds the canonical guides. */
export const GUIDES_DIR = "JAPAN2026";

/** Hebrew error shown when the agent has no GitHub credentials (the default in production until the user adds a PAT). */
export const MISSING_TOKEN_ERROR =
  "עריכת התוכנית לא מחוברת עדיין — חסר לסוכן טוקן GitHub, ולכן אי אפשר לשמור שינויים במסמכים. " +
  "אפשר להמשיך לקרוא, לתכנן ולהמליץ, אבל כדי שהעריכה תעבוד צריך להוסיף GITHUB_TOKEN " +
  "(הרשאת Contents: Read and write על המאגר AceDZN/JapanTripPlan) בהגדרות הפרויקט ב-Vercel ולפרוס מחדש. " +
  "עד אז אפשר לומר לי מה לשנות, ואני אנסח את השינוי המדויק כדי שמישהו יבצע אותו ידנית.";

export type GithubConfig = {
  token: string;
  /** "owner/repo" */
  repo: string;
  /** Branch the edits are committed to. */
  branch: string;
};

/**
 * Credentials for the write path. Returns null when GITHUB_TOKEN is absent —
 * the tools turn that into MISSING_TOKEN_ERROR rather than throwing, so the
 * model can explain the situation in Hebrew instead of failing the turn.
 */
export function githubConfig(): GithubConfig | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  return {
    token,
    repo: process.env.GITHUB_REPO ?? "AceDZN/JapanTripPlan",
    branch: process.env.GITHUB_BRANCH ?? "main",
  };
}

function headers(cfg: GithubConfig): Record<string, string> {
  return {
    authorization: `Bearer ${cfg.token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "japan-trip-agent",
  };
}

export type DocFile = {
  /** Path inside the repo, e.g. "JAPAN2026/09-DAILY-ITINERARY.md". */
  path: string;
  /** Blob sha — required by the Contents API to update the file. */
  sha: string;
  /** Decoded UTF-8 markdown. */
  content: string;
};

/** Read one canonical guide straight from the branch (never from the bundle). */
export async function readDoc(
  cfg: GithubConfig,
  file: string,
): Promise<{ ok: true; doc: DocFile } | { ok: false; error: string }> {
  const path = `${GUIDES_DIR}/${file}`;
  const url =
    `https://api.github.com/repos/${cfg.repo}/contents/${encodeURI(path)}` +
    `?ref=${encodeURIComponent(cfg.branch)}`;

  let response: Response;
  try {
    response = await fetch(url, { headers: headers(cfg) });
  } catch (cause) {
    return { ok: false, error: `לא הצלחתי להתחבר ל-GitHub כדי לקרוא את ${file} (${String(cause)}).` };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `GitHub סירב לקרוא את ${path} בענף ${cfg.branch} (${response.status} ${response.statusText}). ${await safeMessage(response)}`,
    };
  }

  const body = (await response.json()) as { sha?: string; content?: string; encoding?: string };
  if (!body.sha || typeof body.content !== "string") {
    return { ok: false, error: `תשובה לא צפויה מ-GitHub עבור ${path}.` };
  }

  return {
    ok: true,
    doc: {
      path,
      sha: body.sha,
      content: Buffer.from(body.content, "base64").toString("utf8"),
    },
  };
}

/** Commit new content for a guide. Message is exactly "Trip update: <summary>". */
export async function commitDoc(
  cfg: GithubConfig,
  input: { doc: DocFile; content: string; summary: string },
): Promise<{ ok: true; commitUrl: string; commitSha: string } | { ok: false; error: string }> {
  const url = `https://api.github.com/repos/${cfg.repo}/contents/${encodeURI(input.doc.path)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: { ...headers(cfg), "content-type": "application/json" },
      body: JSON.stringify({
        message: `Trip update: ${input.summary}`,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        sha: input.doc.sha,
        branch: cfg.branch,
      }),
    });
  } catch (cause) {
    return { ok: false, error: `לא הצלחתי לשלוח את השינוי ל-GitHub (${String(cause)}).` };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `GitHub דחה את השמירה של ${input.doc.path} (${response.status} ${response.statusText}). ${await safeMessage(response)}`,
    };
  }

  const body = (await response.json()) as { commit?: { sha?: string; html_url?: string } };
  return {
    ok: true,
    commitSha: body.commit?.sha ?? "",
    commitUrl: body.commit?.html_url ?? "",
  };
}

async function safeMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? "";
  } catch {
    return "";
  }
}

/** Number of times `needle` occurs in `haystack` (non-overlapping). */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return count;
    count += 1;
    from = index + needle.length;
  }
}

/** Told to the user after every successful edit. */
export const LIVE_IN_MINUTES_NOTE =
  "השינוי נשמר במסמכי הטיול. האתר והסוכן מתעדכנים אוטומטית תוך כמה דקות.";
