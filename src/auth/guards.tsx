import { Navigate, Outlet } from "react-router-dom";
import { de } from "../lib/de";
import { useAuth } from "./AuthProvider";

function FullScreenMessage({ text }: { text: string }) {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-neutral-600" role="status">
      {text}
    </div>
  );
}

/** Routes for anonymous visitors only (login, register). Signed-in users are sent on. */
export function PublicOnly() {
  const { loading, session } = useAuth();
  if (loading) return <FullScreenMessage text={de.common.loading} />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Requires a session but not approval (the pending / blocked screens). */
export function RequireSession() {
  const { loading, session } = useAuth();
  if (loading) return <FullScreenMessage text={de.common.loading} />;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Requires an approved account; everybody else is routed to the matching info screen. */
export function RequireApproved() {
  const { loading, session, status } = useAuth();
  if (loading) return <FullScreenMessage text={de.common.loading} />;
  if (!session) return <Navigate to="/login" replace />;
  if (status === "approved") return <Outlet />;
  if (status === "blocked") return <Navigate to="/gesperrt" replace />;
  return <Navigate to="/ausstehend" replace />;
}
