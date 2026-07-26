/**
 * Turns an AI SDK / AI Gateway failure into something we can act on.
 *
 * `generateSpeech` and friends retry internally, so what surfaces is usually a
 * `RetryError` wrapping the last `APICallError`. The useful fields (status,
 * response body, `retry-after`) live on that inner error, so unwrap first.
 */

type MaybeApiError = {
  statusCode?: number;
  status?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  lastError?: unknown;
  message?: string;
  name?: string;
};

/** Walks `RetryError.lastError` chains down to the error that actually failed. */
function rootCause(error: unknown): MaybeApiError {
  let current = error as MaybeApiError;
  for (let depth = 0; depth < 5; depth += 1) {
    const inner = current?.lastError as MaybeApiError | undefined;
    if (!inner || inner === current) break;
    current = inner;
  }
  return current ?? {};
}

export type GatewayFailure = {
  /** Upstream HTTP status, when the provider reported one. */
  status?: number;
  /** Seconds the caller should wait, when the upstream said so. */
  retryAfter?: number;
  kind: "rate-limit" | "credit" | "auth" | "unknown";
  /** Single-line summary safe to write to the server log. */
  summary: string;
};

export function describeGatewayError(error: unknown): GatewayFailure {
  const cause = rootCause(error);
  const status = cause.statusCode ?? cause.status;
  const body = typeof cause.responseBody === "string" ? cause.responseBody.slice(0, 400) : "";
  const message = cause.message ?? String(error);
  const haystack = `${status ?? ""} ${message} ${body}`;

  const retryAfterHeader = cause.responseHeaders?.["retry-after"];
  const parsedRetryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : Number.NaN;

  let kind: GatewayFailure["kind"] = "unknown";
  if (status === 429 || /rate.?limit|too many requests/i.test(haystack)) kind = "rate-limit";
  else if (/quota|credit|payment|insufficient|billing/i.test(haystack)) kind = "credit";
  else if (status === 401 || status === 403 || /unauthor|forbidden|api key|invalid token/i.test(haystack)) {
    kind = "auth";
  }

  return {
    status,
    retryAfter: Number.isFinite(parsedRetryAfter) ? parsedRetryAfter : undefined,
    kind,
    summary: `${cause.name ?? "Error"} kind=${kind} status=${status ?? "?"} message=${message} body=${body}`,
  };
}
