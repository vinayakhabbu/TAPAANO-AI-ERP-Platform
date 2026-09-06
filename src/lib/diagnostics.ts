export type DiagnosticCode = "render_failed" | "profile_failed" | "session_failed" | "authentication_failed" | "read_failed" | "write_failed";
export type DiagnosticEvent = { code: DiagnosticCode; release: string };
const codes: Record<string, DiagnosticCode> = {
  "Application render failed": "render_failed",
  "Profile initialization failed": "profile_failed",
  "Session initialization failed": "session_failed",
  "Authentication failed": "authentication_failed",
  "Data read failed": "read_failed",
  "Data write failed": "write_failed",
};

export function createDiagnosticReporter(options: {
  development: boolean;
  release?: string;
  now?: () => number;
  log: (...values: unknown[]) => void;
  send: (event: DiagnosticEvent) => Promise<void>;
}) {
  const lastSent = new Map<DiagnosticCode, number>();
  const release = /^[a-f0-9]{40}$/.test(options.release ?? "") ? options.release : "unversioned";
  return (message: string, error?: unknown) => {
    const code = codes[message];
    if (options.development) options.log(message, error);
    else options.log("TAPAANO client error", code ?? "unknown_error");
    if (!code) return; // Never persist arbitrary messages, URLs, tokens, or error payloads.
    const now = (options.now ?? Date.now)();
    if (now - (lastSent.get(code) ?? -Infinity) < 60_000) return;
    lastSent.set(code, now);
    void Promise.resolve().then(() => options.send({ code, release })).catch(() => {
      options.log("TAPAANO diagnostic persistence unavailable");
    });
  };
}
