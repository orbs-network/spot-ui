"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ConnectButton,
  WalletButton,
  useAccountModal,
} from "@rainbow-me/rainbowkit";
import {
  ArrowLeftRightIcon,
  ChevronDownIcon,
  ReceiptTextIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { useActiveConnection } from "@/lib/hooks/use-active-connection";
import { useUtilaConnectRetry } from "@/lib/hooks/use-utila-connect-retry";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getNetwork, SPOT_VERSION } from "@orbs-network/spot-ui";
import { cn, makeEllipsisAddress } from "@/lib/utils";
import { useMemo } from "react";

const NAV_ITEMS = [
  { label: "Swap", path: "/", external: false },
  { label: "Predictions", path: "/predictions", external: false },
  {
    label: "Explorer",
    path: "https://orbs-explorer.vercel.app/",
    external: true,
  },
] as const;

const UTILA_SIDEBAR_WIDTH = 230;
const UTILA_MENU_ITEMS = [
  { href: "/", icon: ArrowLeftRightIcon, label: "Swap" },
  { href: "/history", icon: ReceiptTextIcon, label: "Order History" },
] as const;

const isUtilaRoute = (pathname: string) =>
  pathname === "/" || pathname === "/history";

const UtilaChainLogo = ({
  chain,
}: {
  chain?: { id: number; name: string; iconUrl?: string };
}) => {
  const logoUrl = chain ? (chain.iconUrl ?? getNetwork(chain.id)?.logoUrl) : "";
  const name = chain?.name ?? "Chain";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eef0ff] text-[10px] font-bold text-[#4564ff]",
        logoUrl && "bg-cover bg-center bg-no-repeat text-transparent",
      )}
      style={logoUrl ? { backgroundImage: `url(${logoUrl})` } : undefined}
    >
      {!logoUrl && name[0]}
    </span>
  );
};

const UtilaChainDisplay = () => {
  const { address: connectedAddress, chainId: connectedChainId } =
    useActiveConnection();
  const connectedChain = useMemo(() => {
    return connectedChainId ? getNetwork(connectedChainId) : undefined;
  }, [connectedChainId]);

  if (!connectedAddress || !connectedChain) {
    return null;
  }

  return (
    <div className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-[#e3e5eb] bg-white px-3 text-[13px] font-semibold text-[#3f4361]">
      <UtilaChainLogo chain={connectedChain} />
      <span className="hidden max-w-[140px] truncate sm:inline">
        {connectedChain.name}
      </span>
    </div>
  );
};

const UtilaWalletButton = () => {
  const { address } = useActiveConnection();
  const { openAccountModal } = useAccountModal();
  const { retryingConnect, startConnectRetry } = useUtilaConnectRetry();
  const label = address
    ? makeEllipsisAddress(address, { start: 6, end: 4 })
    : "Connect wallet";

  if (!address) {
    return (
      <WalletButton.Custom wallet="utila">
        {({ connect, mounted }) => (
          <button
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[7px] border border-[#e3e5eb] bg-white px-3 text-[13px] font-semibold text-[#3f4361] transition-colors hover:bg-[#f7f7f9] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!mounted}
            onClick={() => {
              startConnectRetry(connect);
            }}
            type="button"
          >
            <span className="max-w-[150px] truncate">
              {retryingConnect ? "Connecting..." : label}
            </span>
            <ChevronDownIcon className="size-4 text-[#70748d]" />
          </button>
        )}
      </WalletButton.Custom>
    );
  }

  return (
    <button
      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[7px] border border-[#e3e5eb] bg-white px-3 text-[13px] font-semibold text-[#3f4361] transition-colors hover:bg-[#f7f7f9]"
      onClick={() => openAccountModal?.()}
      type="button"
    >
      <span className="max-w-[150px] truncate">{label}</span>
      <ChevronDownIcon className="size-4 text-[#70748d]" />
    </button>
  );
};

const UtilaLogo = () => {
  return (
    <div className="flex h-11 items-center gap-2 px-2 text-white">
      <svg
        aria-hidden="true"
        className="size-7 shrink-0"
        fill="none"
        viewBox="0 0 32 24"
      >
        <path
          d="M13.3 6.2 10.8 3.8a6.2 6.2 0 0 0-8.7 8.8l2.4 2.4a6.2 6.2 0 0 0 8.8 0l1.6-1.6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        <path
          d="m18.7 17.8 2.5 2.4a6.2 6.2 0 0 0 8.7-8.8l-2.4-2.4a6.2 6.2 0 0 0-8.8 0l-1.6 1.6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
      </svg>
      <span className="text-[24px] font-medium tracking-normal">utila</span>
    </div>
  );
};

const UtilaSidebarItem = ({
  href,
  icon: Icon,
  label,
  pathname,
}: {
  href?: string;
  icon: LucideIcon;
  label: string;
  pathname: string;
}) => {
  const active =
    href === "/" ? pathname === "/" : Boolean(href && pathname === href);
  const className = cn(
    "flex h-[35px] items-center gap-3 rounded-[7px] px-4 text-[14px] font-medium tracking-normal transition-colors",
    active
      ? "bg-[#4b506f] text-white"
      : href
        ? "cursor-pointer text-[#c6cada] hover:bg-white/8 hover:text-white"
        : "text-[#c6cada]",
  );
  if (href) {
    return (
      <Link className={className} href={href}>
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  return (
    <div className={className}>
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
};

const UtilaSidebar = ({ pathname }: { pathname: string }) => {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-50 flex w-[230px] flex-col bg-[#111638] px-4 py-7 text-[#c6cada] shadow-[12px_0_24px_rgba(17,22,56,0.12)]"
      style={{ width: UTILA_SIDEBAR_WIDTH }}
    >
      <UtilaLogo />
      <div className="mt-4 flex flex-col gap-1">
        {UTILA_MENU_ITEMS.map((item) => (
          <UtilaSidebarItem
            href={item.href}
            icon={item.icon}
            key={item.label}
            label={item.label}
            pathname={pathname}
          />
        ))}
      </div>
    </aside>
  );
};

const UtilaNavigation = ({ pathname }: { pathname: string }) => {
  return (
    <>
      <UtilaSidebar pathname={pathname} />
      <nav
        className="sticky top-0 z-40 ml-[230px] flex h-16 items-center justify-end gap-3 border-b border-[#e7e8eb] bg-white px-6 text-[#3f4361]"
        style={{ marginLeft: UTILA_SIDEBAR_WIDTH }}
      >
        <UtilaChainDisplay />
        <UtilaWalletButton />
      </nav>
    </>
  );
};

const MainNavigation = ({ pathname }: { pathname: string }) => {
  const { envMode, setEnvMode } = useSwapParams();

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 flex items-center gap-2 border-b px-4 py-3",
        "border-border bg-background",
      )}
    >
      <div className="flex flex-1 items-center gap-2">
        {NAV_ITEMS.map(({ label, path, external }) => {
          const isActive =
            !external &&
            (path === "/" ? pathname === "/" : pathname.startsWith(path));
          const className = cn(
            "rounded-lg px-4 py-2 text-sm font-medium no-underline transition-colors",
            isActive
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          );
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
      {Number(SPOT_VERSION) >= 2 && (
        <Select value={envMode} onValueChange={(v) => setEnvMode(v)}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="prod">Prod</SelectItem>
            <SelectItem value="dev">Dev</SelectItem>
          </SelectContent>
        </Select>
      )}
      <ConnectButton showBalance={false} />
    </nav>
  );
};

export function Navigation() {
  const pathname = usePathname();
  const isUtila = isUtilaRoute(pathname);

  if (isUtila) {
    return <UtilaNavigation pathname={pathname} />;
  }

  return <MainNavigation pathname={pathname} />;
}
