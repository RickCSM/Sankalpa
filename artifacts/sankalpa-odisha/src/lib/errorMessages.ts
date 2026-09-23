/**
 * Turns any caught error (API client error, raw fetch failure, or a plain
 * Error) into clear, user-friendly text suitable for display.
 *
 * Rules:
 * - Never expose technical content: no `HTTP <status> <statusText>:` prefixes,
 *   no internal codes (e.g. PASSWORD_CHANGE_REQUIRED), no status jargon
 *   (Forbidden / Unauthorized / Internal Server Error), no stack traces.
 * - Prefer a genuinely useful server message (validation summary, specific
 *   business-rule message) when one is present, stripped of any prefix.
 * - Otherwise fall back to a friendly message based on the HTTP status, then
 *   to a network message, then to the caller-supplied fallback.
 */

const HTTP_PREFIX_RE = /^HTTP\s+\d+\s+[^:]*:\s*/i;

/** Friendly text for known internal codes the server may put in `error`. */
const CODE_MESSAGES: Record<string, string> = {
  PASSWORD_CHANGE_REQUIRED: "Please change your password to continue.",
};

/** Friendly defaults per HTTP status. */
const STATUS_MESSAGES: Record<number, string> = {
  400: "Some of the information entered isn't valid. Please review and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have permission to perform this action.",
  404: "We couldn't find what you were looking for.",
  408: "The request took too long. Please check your connection and try again.",
  409: "This action conflicts with the current state. Please refresh and try again.",
  413: "The file is too large. Please upload a smaller one.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "Something went wrong on our end. Please try again.",
  502: "The server is temporarily unreachable. Please try again in a moment.",
  503: "The service is temporarily unavailable. Please retry in a moment.",
  504: "The server took too long to respond. Please try again.",
};

/**
 * Generic status phrases that carry no real information — if the server only
 * echoed one of these, prefer our friendlier status-based default instead.
 */
const GENERIC_PHRASES = new Set([
  "error",
  "bad request",
  "unauthorized",
  "forbidden",
  "not found",
  "conflict",
  "internal server error",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
  "request failed",
]);

function stripHttpPrefix(text: string): string {
  return text.replace(HTTP_PREFIX_RE, "").trim();
}

/** True when the text looks like a JS/stack-trace dump rather than a sentence. */
function looksLikeStackTrace(text: string): boolean {
  return (
    /\n\s*at\s+\S/.test(text) ||
    /\n\s*at .+:\d+:\d+/.test(text) ||
    /^[\w$.]*(?:Error|Exception):\s.*\n/.test(text)
  );
}

/** Lower-cased, trimmed, punctuation/whitespace-normalised for jargon matching. */
function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readStringField(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const value = (obj as Record<string, unknown>)[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function getStatus(error: unknown): number | undefined {
  const e = error as { status?: unknown; response?: { status?: unknown } } | null;
  const status = e?.status ?? e?.response?.status;
  return typeof status === "number" ? status : undefined;
}

function getServerData(error: unknown): unknown {
  const e = error as { data?: unknown; response?: { data?: unknown } } | null;
  return e?.data ?? e?.response?.data ?? null;
}

/** True when an error looks like a connectivity failure (no server response). */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === "string"
        ? ((error as { message: string }).message)
        : "";
  return /failed to fetch|network ?error|load failed|connection|fetch failed/i.test(
    message,
  );
}

/** Looks like an ALL_CAPS_SNAKE internal code rather than a sentence. */
function looksLikeCode(text: string): boolean {
  return /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(text);
}

function getServerMessage(error: unknown): string | undefined {
  const data = getServerData(error);
  if (typeof data === "string") {
    const cleaned = stripHttpPrefix(data.trim());
    return cleaned === "" ? undefined : cleaned;
  }
  return (
    readStringField(data, "error") ??
    readStringField(data, "message") ??
    readStringField(data, "detail") ??
    readStringField(data, "error_description") ??
    readStringField(data, "title")
  );
}

export function getFriendlyErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const status = getStatus(error);

  let serverMessage = getServerMessage(error);
  if (serverMessage) {
    serverMessage = stripHttpPrefix(serverMessage);
    if (looksLikeCode(serverMessage)) {
      const mapped = CODE_MESSAGES[serverMessage];
      if (mapped) return mapped;
      serverMessage = undefined; // never show a raw code
    }
  }
  if (serverMessage && looksLikeStackTrace(serverMessage)) {
    serverMessage = undefined; // never show a stack trace
  }
  if (serverMessage && GENERIC_PHRASES.has(normalizeForCompare(serverMessage))) {
    serverMessage = undefined;
  }
  if (serverMessage) return serverMessage;

  if (status !== undefined) {
    if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
    if (status >= 500) return STATUS_MESSAGES[500];
    if (status >= 400) return STATUS_MESSAGES[400];
  }

  if (isNetworkError(error)) {
    return "Couldn't reach the server. Please check your connection and try again.";
  }

  return fallback;
}
