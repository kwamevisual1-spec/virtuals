import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthScreen } from "@/components/AuthScreen";

export const metadata = { title: "Virtuals Pro — Smart Virtual Predictions" };
export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (user) {
    if (user.isAdmin) redirect("/admin");
    if (user.isAgent) redirect("/agent");
    if (user.registrationStatus !== "approved") {
      redirect("/onboarding");
    }
    redirect("/dashboard");
  }
  return (
    <main className="hero-red-bg min-h-[calc(100vh-80px)] py-8 sm:py-12">
      <Suspense fallback={null}>
        <AuthScreen defaultTab="signup" />
      </Suspense>
    </main>
  );
}
