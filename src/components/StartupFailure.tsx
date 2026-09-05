type StartupFailureProps = { configuration?: boolean };

export function StartupFailure({ configuration = false }: StartupFailureProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-lg rounded-xl border border-border bg-card p-8 shadow-lg">
        <p className="text-sm font-medium text-destructive">Application unavailable</p>
        <h1 className="mt-2 text-2xl font-semibold">TAPAANO could not start safely.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {configuration
            ? "The public application configuration is missing or invalid. Contact your administrator."
            : "The application bundle could not be loaded. Reload the page or contact your administrator."}
        </p>
      </section>
    </main>
  );
}
