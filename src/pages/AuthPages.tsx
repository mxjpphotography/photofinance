import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Alert, Button, Card, Field } from "../components/ui";
import { de } from "../lib/de";
import { supabase } from "../lib/supabase";

/** Where the app lives, with trailing slash (the site root locally, /photofinance/ on GitHub Pages). */
const appUrl = window.location.origin + import.meta.env.BASE_URL;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-md space-y-4">
        <p className="text-center text-xl font-semibold">{de.appName}</p>
        <Card title={title}>{children}</Card>
      </div>
    </div>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(de.auth.invalidCredentials);
    // On success the auth listener updates the session and the guards redirect.
  }

  return (
    <AuthShell title={de.auth.loginTitle}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field id="email" type="email" label={de.auth.email} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field id="password" type="password" label={de.auth.password} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? de.common.loading : de.auth.submitLogin}
        </Button>
        <div className="flex flex-col gap-2 text-sm">
          <Link className="text-neutral-700 underline" to="/registrieren">{de.auth.toRegister}</Link>
          <Link className="text-neutral-700 underline" to="/passwort-vergessen">{de.auth.toForgot}</Link>
        </div>
      </form>
    </AuthShell>
  );
}

/**
 * Registration without a password: the person proves control of the e-mail
 * address through a one-time link. The account starts as "pending"; an
 * administrator approves it and the person then sets a password via the
 * "forgot password" flow. No password is ever sent by e-mail.
 */
export function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const next: { name?: string; email?: string } = {};
    // A real name has at least two parts (first and last name).
    if (fullName.trim().split(/\s+/).filter(Boolean).length < 2) next.name = de.auth.nameRequired;
    if (!emailPattern.test(email.trim())) next.email = de.auth.emailInvalid;
    setErrors(next);
    if (next.name || next.email) return;

    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, data: { full_name: fullName.trim() }, emailRedirectTo: appUrl },
    });
    setBusy(false);
    if (err) setError(de.common.error);
    else setSent(true);
  }

  return (
    <AuthShell title={de.auth.registerTitle}>
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success">{de.auth.registerSent}</Alert>
          <Link className="text-sm text-neutral-700 underline" to="/login">{de.auth.toLogin}</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <p className="text-sm text-neutral-700">{de.auth.registerHint}</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field id="name" label={de.auth.fullName} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.name} required />
          <Field id="email" type="email" label={de.auth.email} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? de.common.loading : de.auth.submitRegister}
          </Button>
          <Link className="block text-sm text-neutral-700 underline" to="/login">{de.auth.toLogin}</Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!emailPattern.test(email.trim())) {
      setError(de.auth.emailInvalid);
      return;
    }
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${appUrl}passwort-neu` });
    setBusy(false);
    // Same message whether or not the account exists (no account enumeration).
    setSent(true);
  }

  return (
    <AuthShell title={de.auth.forgotTitle}>
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success">{de.auth.forgotSent}</Alert>
          <Link className="text-sm text-neutral-700 underline" to="/login">{de.auth.toLogin}</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field id="email" type="email" label={de.auth.email} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? de.common.loading : de.auth.submitForgot}
          </Button>
          <Link className="block text-sm text-neutral-700 underline" to="/login">{de.auth.toLogin}</Link>
        </form>
      )}
    </AuthShell>
  );
}

/** Target of the password-setup / recovery link. The link itself signs the person in. */
export function SetNewPasswordPage() {
  const { loading, session } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError(de.auth.passwordTooShort);
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(de.common.error);
    else {
      setDone(true);
      setTimeout(() => navigate("/", { replace: true }), 1500);
    }
  }

  if (loading) return <AuthShell title={de.auth.resetTitle}><p role="status">{de.common.loading}</p></AuthShell>;
  if (!session) {
    return (
      <AuthShell title={de.auth.resetTitle}>
        <div className="space-y-4">
          <Alert tone="error">{de.common.error}</Alert>
          <Link className="text-sm text-neutral-700 underline" to="/passwort-vergessen">{de.auth.toForgot}</Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={de.auth.resetTitle}>
      {done ? (
        <Alert tone="success">{de.auth.resetDone}</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field id="new-password" type="password" label={de.auth.newPassword} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? de.common.loading : de.auth.submitReset}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function PendingPage() {
  const { status, refresh, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const blocked = status === "blocked";

  return (
    <AuthShell title={blocked ? de.auth.blockedTitle : de.auth.pendingTitle}>
      <div className="space-y-4">
        <Alert tone={blocked ? "error" : "info"}>{blocked ? de.auth.blockedText : de.auth.pendingText}</Alert>
        {!blocked ? (
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await refresh();
              setBusy(false);
            }}
          >
            {busy ? de.common.loading : de.auth.recheck}
          </Button>
        ) : null}
        <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
          {de.common.signOut}
        </Button>
      </div>
    </AuthShell>
  );
}
