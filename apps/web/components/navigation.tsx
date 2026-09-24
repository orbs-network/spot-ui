"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletControls } from "./wallet-controls";

const NAV_ITEMS = [
  { label: "Swap", path: "/", external: false },
  { label: "Predictions", path: "/predictions", external: false },
  {
    label: "Explorer",
    path: "https://orbs-explorer.vercel.app/",
    external: true,
  },
  { label: "Utila", path: "https://utila-spot.vercel.app", external: true },
] as const;

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {NAV_ITEMS.map(({ label, path, external }) => {
          const isActive =
            !external &&
            (path === "/" ? pathname === "/" : pathname.startsWith(path));
          const className = `rounded-lg px-2 py-2 sm:px-4 text-sm font-medium no-underline transition-colors ${
            isActive
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`;
          return external ? (
            <a
              key={path}
              href={path}
              target="_blank"
              rel="noopener noreferrer"
              className={className}
            >
              {label}
            </a>
          ) : (
            <Link key={path} href={path} className={className}>
              {label}
            </Link>
          );
        })}
      </div>
      <div className="flex w-full items-start justify-end gap-2 sm:w-auto">
        <WalletControls />
      </div>
    </nav>
  );
}
