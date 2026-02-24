"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_ITEMS = [
  { label: "Swap", path: "/" },
  { label: "Predictions", path: "/predictions" },
] as const;

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-2 border-b border-border bg-background px-4 py-3">
      <div className="flex flex-1 items-center gap-2">
      {NAV_ITEMS.map(({ label, path }) => {
        const isActive =
          path === "/"
            ? pathname === "/"
            : pathname.startsWith(path);
        return (
          <Link
            key={path}
            href={path}
            className={`rounded-lg px-4 py-2 text-sm font-medium no-underline transition-colors ${
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
      </div>
      <ConnectButton showBalance={false} />
    </nav>
  );
}
