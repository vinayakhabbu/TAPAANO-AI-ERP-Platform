import { createDiagnosticReporter, type DiagnosticEvent } from "@/lib/diagnostics";

let diagnosticSink: (event: DiagnosticEvent) => Promise<void> = async () => {};

export function configureClientDiagnostics(sink: typeof diagnosticSink) {
  diagnosticSink = sink;
}

export const reportClientError = createDiagnosticReporter({
  development: import.meta.env.DEV,
  release: import.meta.env.VITE_RELEASE_SHA,
  log: (...values) => console.error(...values),
  send: (event) => diagnosticSink(event),
});
