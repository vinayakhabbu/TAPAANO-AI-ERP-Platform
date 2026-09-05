import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "@/lib/clientDiagnostics";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError("Application render failed", { error, componentStack: info.componentStack });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <section className="w-full max-w-lg rounded-xl border border-border bg-card p-8 shadow-lg">
          <p className="text-sm font-medium text-destructive">Application unavailable</p>
          <h1 className="mt-2 text-2xl font-semibold">TAPAANO could not load safely.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            No operation was submitted. Reload the application; if the problem continues, contact your administrator.
          </p>
          <button
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload
          </button>
        </section>
      </main>
    );
  }
}
