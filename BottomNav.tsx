"use client";

import Link from "next/link";
import { Home, History, Gem, User as UserIcon, Trophy } from "lucide-react";

export type NavKey = "home" | "history" | "plans" | "profile";

/**
 * Shared bottom navigation. Every link carries the session token (?t=) so
 * navigation keeps working when the browser blocks cookies (previews).
 */
export function BottomNav({
  token = "",
  active,
}: {
  token?: string;
  active: NavKey;
}) {
  const t = token ? `?t=${encodeURIComponent(token)}` : "";
  const items: { key: NavKey; label: string; href: string; icon: React.ReactNode }[] = [
    { key: "home", label: "Home", href: `/dashboard${t}`, icon: <Home className="h-5 w-5" /> },
    { key: "history", label: "History", href: `/history${t}`, icon: <History className="h-5 w-5" /> },
    { key: "plans", label: "Plans", href: `/plans${t}`, icon: <Gem className="h-5 w-5" /> },
    { key: "profile", label: "Profile", href: `/profile${t}`, icon: <UserIcon className="h-5 w-5" /> },
    { key: "plans", label: "VIP", href: `/plans${t}`, icon: <Trophy className="h-5 w-5" /> },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-2">
        {items.map((it, i) => {
          const isActive = it.key === active && !(it.label === "VIP");
          return (
            <Link
              key={`${it.label}-${i}`}
              href={it.href}
              className={
                "flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold transition " +
                (isActive
                  ? "text-red-600"
                  : "text-slate-400 hover:text-slate-700")
              }
            >
              {it.icon}
              <span className="uppercase tracking-wider">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
