import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Supabase validates the single-use email link before redirecting here. Its
// client initializes the returned session; the URL never supplies a role/org.
export default function AccountSetup() {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || saved) return;
    if (password.length < 12 || password.length > 128 || password !== confirmation) {
      setError("Use 12–128 characters and enter the same password twice.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // Verify with Auth again at the sensitive action, not just cached state.
      const verified = await supabase.auth.getUser();
      if (verified.error || !verified.data.user?.email_confirmed_at || verified.data.user.id !== user?.id || !profile?.org_id) {
        setError("Your invitation session is unavailable. Open a fresh invitation link.");
        return;
      }
      const result = await supabase.auth.updateUser({ password });
      if (result.error) {
        setError("The password could not be saved. Try a stronger password or request a fresh invitation.");
        return;
      }
      setSaved(true);
      setPassword("");
      setConfirmation("");
      try {
        await signOut();
        navigate("/auth", { replace: true, state: { passwordSet: true } });
      } catch {
        setError("Your password was saved. Sign out before signing in with your new password.");
      }
    } catch {
      setError("Account setup could not be completed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-md space-y-5 rounded-xl border bg-card p-8">
        <h1 className="text-2xl font-semibold">Set up your TAPAANO account</h1>
        {loading ? <p role="status">Verifying your invitation…</p> : saved ? (
          <><p>Your password was saved.</p><Button disabled={busy} onClick={() => void signOut().then(() => navigate("/auth", { replace: true })).catch(() => setError("Sign-out could not be confirmed. Close this window and sign in again."))}>Return to sign in</Button></>
        ) : !user?.email_confirmed_at || !profile?.org_id ? (
          <><p>This invitation is missing, expired, or has already been used. Ask your administrator for a fresh invitation.</p><Link className="underline" to="/auth">Return to sign in</Link></>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p>Choose a password for <strong>{user.email}</strong>.</p>
            <div className="space-y-2"><Label htmlFor="setup-password">New password</Label><Input id="setup-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="setup-confirmation">Confirm password</Label><Input id="setup-confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>
            <p className="text-sm text-muted-foreground">Use at least 12 characters. You’ll sign in with this password after saving.</p>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
          </form>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </section>
    </main>
  );
}
