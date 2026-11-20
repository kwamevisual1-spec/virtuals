import { getCurrentUser } from "@/lib/auth";
import { SiteHeader, type HeaderUser } from "./SiteHeader";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  const headerUser: HeaderUser | null = user
    ? {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        registrationStatus: user.registrationStatus,
        activePlan: user.activePlan,
        planStatus: user.planStatus,
        pendingPlan: user.pendingPlan,
        avatarInitial: user.avatarInitial,
        isAdmin: user.isAdmin,
        isAgent: user.isAgent,
      }
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader initialUser={headerUser} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
