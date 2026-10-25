import { Navigate, Route, Routes } from "react-router-dom";
import { PublicOnly, RequireApproved, RequireSession } from "./auth/guards";
import { NotAvailableYet } from "./components/ui";
import { AppLayout } from "./layout/AppLayout";
import { de } from "./lib/de";
import { isSupabaseConfigured } from "./lib/supabase";
import { ForgotPasswordPage, LoginPage, PendingPage, RegisterPage, SetNewPasswordPage } from "./pages/AuthPages";

function MissingConfig() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="max-w-md space-y-2 rounded-xl bg-white p-6 ring-1 ring-neutral-200" role="alert">
        <h1 className="text-lg font-semibold">{de.config.missingTitle}</h1>
        <p className="text-neutral-700">{de.config.missingText}</p>
      </div>
    </div>
  );
}

const placeholder = (title: string, text: string) => <NotAvailableYet title={title} text={text} />;
const later = `${de.common.notAvailableYet} ${de.common.notAvailableHint}`;

export default function App() {
  if (!isSupabaseConfigured) return <MissingConfig />;

  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registrieren" element={<RegisterPage />} />
        <Route path="/passwort-vergessen" element={<ForgotPasswordPage />} />
      </Route>

      {/* The recovery link signs the person in first, so this needs no guard of its own. */}
      <Route path="/passwort-neu" element={<SetNewPasswordPage />} />

      <Route element={<RequireSession />}>
        <Route path="/ausstehend" element={<PendingPage />} />
        <Route path="/gesperrt" element={<PendingPage />} />
      </Route>

      <Route element={<RequireApproved />}>
        <Route element={<AppLayout />}>
          <Route index element={placeholder(de.nav.overview, de.overview.intro)} />
          <Route path="finanzen" element={placeholder(de.nav.finance, later)} />
          <Route path="jobs" element={placeholder(de.nav.jobs, later)} />
          <Route path="equipment" element={placeholder(de.nav.equipment, later)} />
          <Route path="leihen" element={placeholder(de.nav.rentals, later)} />
          <Route path="einstellungen" element={placeholder(de.nav.settings, later)} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
