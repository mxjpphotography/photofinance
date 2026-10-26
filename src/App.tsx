import { Navigate, Route, Routes } from "react-router-dom";
import { PublicOnly, RequireApproved, RequireSession } from "./auth/guards";
import { AppLayout } from "./layout/AppLayout";
import { de } from "./lib/de";
import { isSupabaseConfigured } from "./lib/supabase";
import { ForgotPasswordPage, LoginPage, PendingPage, RegisterPage, SetNewPasswordPage } from "./pages/AuthPages";
import EquipmentPage from "./pages/EquipmentPage";
import FinancePage from "./pages/FinancePage";
import JobsPage from "./pages/JobsPage";
import OverviewPage from "./pages/OverviewPage";
import RentalsPage from "./pages/RentalsPage";
import SettingsPage from "./pages/SettingsPage";

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
          <Route index element={<OverviewPage />} />
          <Route path="finanzen" element={<FinancePage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="equipment" element={<EquipmentPage />} />
          <Route path="leihen" element={<RentalsPage />} />
          <Route path="einstellungen" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
