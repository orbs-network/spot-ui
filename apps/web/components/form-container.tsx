/* eslint-disable @next/next/no-img-element */
import React from "react";
import { SettingsModal } from "./settings-modal";
import { Button } from "./ui/button";
import Link from "next/link";

import { FORM_TABS, SPOT_TABS } from "@/lib/consts";
import { useSelectedFormTab } from "@/lib/hooks/use-tabs";
import { SpotOrders } from "./spot/spot-form";
import { PartnerSelector } from "./spot/partner-selector";
import { useSearchParams } from "next/navigation";

const PoweredBy = () => {
  return (
    <a
      href="https://www.orbs.com/"
      target="_blank"
      rel="noopener noreferrer"
      className="text-[15px] flex flex-row gap-2 items-center justify-center font-medium mt-3"
    >
      Powered by Orbs{" "}
      <img
        src="https://raw.githubusercontent.com/orbs-network/twap-ui/master/logo/orbslogo.svg"
        alt="Powered by"
        width={24}
        height={24}
      />
    </a>
  );
};

const Tabs = () => {
  const selectedTab = useSelectedFormTab();
  const searchParams = useSearchParams();
  return (
    <div className="flex flex-row gap-2">
      {FORM_TABS.map((tab) => {
        const selected = selectedTab?.value === tab.value;
        const href = SPOT_TABS.includes(tab.value)
          ? `${tab.path}?${searchParams.toString()}`
          : tab.path;
        return (
          <Link href={href} key={tab.value}>
            <Button
              variant={selected ? "secondary" : "outline"}
              className="w-full"
            >
              {tab.label}
            </Button>
          </Link>
        );
      })}
    </div>
  );
};

export function FormContainer({
  children,
  sideContent,
}: {
  children: React.ReactNode;
  sideContent?: React.ReactNode;
}) {
  const selectedTab = useSelectedFormTab();

  const form = (
    <div className="flex min-w-0 flex-col gap-4">
      <PartnerSelector />

      <Tabs />
      <div className="flex w-full flex-col gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-row items-center justify-between gap-2">
          <h2 className="text-2xl font-bold">{selectedTab?.fullLabel}</h2>
          <div className="ml-auto flex flex-row gap-2">
            <SettingsModal />
            <SpotOrders />
          </div>
        </div>
        {children}
      </div>
      <PoweredBy />
    </div>
  );

  if (sideContent) {
    return (
      <div className="mx-auto mt-10 mb-[100px] grid w-full max-w-[1400px] grid-cols-1 items-start gap-4 px-4 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="min-w-0">{sideContent}</div>
        {form}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-md w-full mx-auto mt-10 mb-[100px]">
      {form}
    </div>
  );
}
