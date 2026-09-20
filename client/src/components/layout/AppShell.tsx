import { NavLink, Outlet, useNavigate } from "react-router";
import { ShieldCheck, LayoutGrid, Key, Webhook, Settings, LogOut } from "lucide-react";
import { useCurrentUser, useLogout } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Domains", icon: LayoutGrid },
  { to: "/api-keys", label: "API keys", icon: Key },
  { to: "/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/account", label: "Account", icon: Settings },
];

export function AppShell() {
  const { data } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  // Clearing the query cache alone doesn't unmount the protected route, so go
  // to the login screen explicitly once the server has revoked the session.
  const handleLogout = () => logout.mutate(undefined, { onSuccess: () => navigate("/login", { replace: true }) });

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="flex w-60 flex-col border-r border-paper-border bg-ink text-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <ShieldCheck className="h-5 w-5 text-signal" />
          <span className="font-semibold">MailGuard</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-ink-surface hover:text-white",
                  isActive && "bg-ink-surface text-white",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-border px-5 py-4">
          <p className="truncate text-xs text-ink-muted">{data?.user.email}</p>
          <button
            onClick={handleLogout}
            className="mt-2 flex items-center gap-2 text-sm text-ink-muted hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
