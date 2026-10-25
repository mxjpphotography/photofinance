import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/ui";
import { de } from "../lib/de";

const items = [
  { to: "/", label: de.nav.overview, end: true },
  { to: "/finanzen", label: de.nav.finance },
  { to: "/jobs", label: de.nav.jobs },
  { to: "/equipment", label: de.nav.equipment },
  { to: "/leihen", label: de.nav.rentals },
  { to: "/einstellungen", label: de.nav.settings },
] as const;

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${
    isActive ? "bg-brand text-white" : "text-neutral-700 hover:bg-neutral-100"
  }`;

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 items-center justify-center px-1 text-center text-[11px] font-medium leading-tight ${
    isActive ? "text-brand underline decoration-2 underline-offset-4" : "text-neutral-600"
  }`;

export function AppLayout() {
  const { fullName, signOut } = useAuth();

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      {/* Desktop and tablet: sidebar */}
      <aside className="hidden flex-col border-r border-neutral-200 bg-white p-4 md:flex">
        <div className="mb-6 px-3 text-lg font-semibold">{de.appName}</div>
        <nav aria-label="Hauptnavigation" className="flex flex-1 flex-col gap-1">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={"end" in i ? i.end : false} className={linkClass}>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 space-y-2 border-t border-neutral-200 pt-4">
          {fullName ? <p className="truncate px-3 text-sm text-neutral-600">{fullName}</p> : null}
          <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
            {de.common.signOut}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-16 md:pb-0">
        {/* Phone: slim top bar */}
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2 md:hidden">
          <span className="font-semibold">{de.appName}</span>
          <Button variant="secondary" className="min-h-10 px-3" onClick={() => void signOut()}>
            {de.common.signOut}
          </Button>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>

      {/* Phone: bottom tab bar */}
      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={"end" in i ? i.end : false} className={tabClass}>
            {i.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
