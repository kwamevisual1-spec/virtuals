import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { RecoveryRedirect } from "@/components/RecoveryRedirect";

export const metadata: Metadata = {
  title: "InstantVirtuals — AI Football Intelligence",
  description:
    "InstantVirtuals combines intelligent screenshot analysis and premium virtual football insights in one secure experience.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#080D1B] text-white antialiased">
        <RecoveryRedirect />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
