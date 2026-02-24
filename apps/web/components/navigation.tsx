"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_ITEMS = [
  { label: "Swap", path: "/", external: false },
  { label: "Predictions", path: "/predictions", external: false },
  { label: "Explorer", path: "https://orbs-explorer.vercel.app/", external: true },
] as const;

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-2 border-b border-border bg-background px-4 py-3">
      <div className="flex flex-1 items-center gap-2">
      {NAV_ITEMS.map(({ label, path, external }) => {
        const isActive =
          !external &&
          (path === "/" ? pathname === "/" : pathname.startsWith(path));
        const className = `rounded-lg px-4 py-2 text-sm font-medium no-underline transition-colors ${
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
      <ConnectButton showBalance={false} />
    </nav>
  );
}
