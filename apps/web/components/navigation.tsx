"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ConnectButton,
  useAccountModal,
  useConnectModal,
} from "@rainbow-me/rainbowkit";
import {
  ArrowLeftRightIcon,
  CheckIcon,
  ChevronDownIcon,
  LogOutIcon,
  PencilIcon,
  ReceiptTextIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useChainId,
  useChains,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { useActiveConnection } from "@/lib/hooks/use-active-connection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getNetwork, SPOT_VERSION } from "@orbs-network/spot-ui";
import { cn, makeEllipsisAddress } from "@/lib/utils";

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

const UtilaChainSelector = () => {
  const chains = useChains();
  const connectedChainId = useChainId();
  const switchChain = useSwitchChain();
  const {
    chainId: selectedChainId,
    queryChainId,
    setSelectedChainId,
    setSelectedChainIdAndClearCurrencies,
  } = useSwapParams();
  const [open, setOpen] = useState(false);
  const hasRestoredQueryChainRef = useRef(false);
  const supportedChains = chains;
  const isQueryChainSupported = supportedChains.some(
    (chain) => chain.id === queryChainId,
  );
  const validSelectedChainId = supportedChains.some(
    (chain) => chain.id === selectedChainId,
  )
    ? selectedChainId
    : connectedChainId;
  const selectedChain =
    supportedChains.find((chain) => chain.id === validSelectedChainId) ??
    supportedChains[0];

  useEffect(() => {
    if (!supportedChains.length) {
      return;
    }

    const connectedChainSupported = supportedChains.some(
      (chain) => chain.id === connectedChainId,
    );
    const fallbackChainId = connectedChainSupported
      ? connectedChainId
      : supportedChains[0]?.id;

    if (!queryChainId) {
      if (fallbackChainId) {
        setSelectedChainId(fallbackChainId, "replaceIn");
      }

      return;
    }

    if (!isQueryChainSupported) {
      if (fallbackChainId) {
        setSelectedChainIdAndClearCurrencies(fallbackChainId, "replaceIn");
      }

      return;
    }

    if (!hasRestoredQueryChainRef.current) {
      hasRestoredQueryChainRef.current = true;

      if (connectedChainId && connectedChainId !== queryChainId) {
        switchChain.mutate({ chainId: queryChainId });
      }
    }
  }, [
    connectedChainId,
    isQueryChainSupported,
    queryChainId,
    setSelectedChainId,
    setSelectedChainIdAndClearCurrencies,
    supportedChains,
    switchChain,
  ]);

  const onSelectChain = useCallback(
    (chainId: number) => {
      if (selectedChain?.id === chainId) {
        setOpen(false);
        return;
      }

      setSelectedChainIdAndClearCurrencies(chainId, "replaceIn");

      if (connectedChainId !== chainId) {
        switchChain.mutate({ chainId });
      }

      setOpen(false);
    },
    [
      connectedChainId,
      selectedChain?.id,
      setSelectedChainIdAndClearCurrencies,
      switchChain,
    ],
  );

  if (!supportedChains.length) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[7px] border border-[#e3e5eb] bg-white px-3 text-[13px] font-semibold text-[#3f4361] transition-colors hover:bg-[#f7f7f9]"
          type="button"
        >
          <UtilaChainLogo chain={selectedChain} />
          <span className="hidden max-w-[140px] truncate sm:inline">
            {selectedChain?.name ?? "Select chain"}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-4 text-[#70748d] transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[260px] rounded-[8px] border-[#dfe2ec] bg-white p-2 text-[#3f4361] shadow-[0_8px_24px_rgba(42,47,74,0.14)]"
        sideOffset={8}
      >
        <div className="flex flex-col gap-1">
          {supportedChains.map((chain) => {
            const selected = selectedChain?.id === chain.id;

            return (
              <button
                className={cn(
                  "flex h-10 cursor-pointer items-center gap-3 rounded-[7px] px-3 text-left text-[13px] font-semibold transition-colors hover:bg-[#f4f5ff]",
                  selected && "bg-[#f4f5ff]",
                )}
                key={chain.id}
                onClick={() => onSelectChain(chain.id)}
                type="button"
              >
                <UtilaChainLogo chain={chain} />
                <span className="min-w-0 flex-1 truncate">{chain.name}</span>
                {selected && <CheckIcon className="size-4 text-[#4564ff]" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const UtilaWalletButton = () => {
  const { address } = useActiveConnection();
  const connectedChainId = useChainId();
  const { openAccountModal } = useAccountModal();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const [menuOpen, setMenuOpen] = useState(false);
  const label = address
    ? makeEllipsisAddress(address, { start: 6, end: 4 })
    : "Connect wallet";
  const networkName = connectedChainId
    ? getNetwork(connectedChainId)?.name
    : undefined;
  const onLogout = useCallback(() => {
    disconnect();
    setMenuOpen(false);
  }, [disconnect]);

  if (!address) {
    return (
      <button
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[7px] border border-[#e3e5eb] bg-white px-3 text-[13px] font-semibold text-[#3f4361] transition-colors hover:bg-[#f7f7f9]"
        onClick={() => openConnectModal?.()}
        type="button"
      >
        <span className="max-w-[150px] truncate">{label}</span>
        <ChevronDownIcon className="size-4 text-[#70748d]" />
      </button>
    );
  }

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[7px] border border-[#e3e5eb] bg-white px-3 text-[13px] font-semibold text-[#3f4361] transition-colors hover:bg-[#f7f7f9]"
          type="button"
        >
          <span className="max-w-[150px] truncate">{label}</span>
          <ChevronDownIcon
            className={cn(
              "size-4 text-[#70748d] transition-transform",
              menuOpen && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[255px] rounded-[5px] border border-[#d8dbe6] bg-white p-0 text-[#20263d] shadow-[0_8px_24px_rgba(42,47,74,0.14)]"
        sideOffset={7}
      >
        <div className="flex flex-col">
          <div className="px-4 py-3">
            <div>
              <div className="min-w-0">
                <p className="text-[13px] font-normal text-[#747891]">
                  Wallet address
                </p>
                <p className="mt-1 truncate text-[14px] font-medium text-[#20263d]">
                  {makeEllipsisAddress(address, { start: 10, end: 6 })}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-[13px] font-normal text-[#747891]">Network</p>
              <p className="mt-1 truncate text-[14px] font-medium text-[#20263d]">
                {networkName || "-"}
              </p>
            </div>
          </div>
          <div className="border-t border-[#e5e7ee] py-1">
            <button
              className="flex h-10 w-full cursor-pointer items-center gap-2 px-4 text-left text-[14px] font-normal text-[#20263d] transition-colors hover:bg-[#f4f5ff]"
              onClick={() => {
                setMenuOpen(false);
                openAccountModal?.();
              }}
              type="button"
            >
              <PencilIcon className="size-4 text-[#747891]" />
              <span>Manage wallet</span>
            </button>
            <button
              className="flex h-10 w-full cursor-pointer items-center gap-2 px-4 text-left text-[14px] font-normal text-[#20263d] transition-colors hover:bg-[#f4f5ff]"
              onClick={onLogout}
              type="button"
            >
              <LogOutIcon className="size-4 text-[#747891]" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
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
      <button
        className="mt-5 flex h-8 cursor-pointer items-center rounded-[7px] bg-[#4a60ff] px-4 text-[14px] font-bold text-white transition-colors hover:bg-[#4058f7]"
        type="button"
      >
        <span className="min-w-0 flex-1 text-center">Transfer</span>
        <span className="mx-3 h-4 w-px bg-white/25" />
        <ChevronDownIcon className="size-4 shrink-0" />
      </button>
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
        <UtilaChainSelector />
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
