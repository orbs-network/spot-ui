"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SPOT_VERSION } from "@orbs-network/spot-ui";

const NAV_ITEMS = [
  { label: "Swap", path: "/", external: false },
  { label: "Predictions", path: "/predictions", external: false },
  { label: "Explorer", path: "https://orbs-explorer.vercel.app/", external: true },
] as const;

export function Navigation() {
  const pathname = usePathname();
  const { envMode, setEnvMode } = useSwapParams();

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
     {Number(SPOT_VERSION) >= 2 && <Select value={envMode} onValueChange={(v) => setEnvMode(v)}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="prod">Prod</SelectItem>
          <SelectItem value="dev">Dev</SelectItem>
        </SelectContent>
      </Select>}
      <ConnectButton showBalance={false} />
    </nav>
  );
}
