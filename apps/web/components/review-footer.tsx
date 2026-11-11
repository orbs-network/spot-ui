"use client";

import { useState, type ReactNode } from "react";
import { DISCLAIMER_URL } from "@orbs-network/spot-react";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

export const ReviewFooter = ({ details, children }: { details: ReactNode; children: ReactNode }) => (
  <div className="twap-create-order-bottom">
    <div className="twap-create-order-details">{details}</div>
    {children}
  </div>
);

export const ReviewActions = ({ onConfirm, disabled, isPreparing, actionText }: {
  onConfirm: () => void;
  disabled?: boolean;
  isPreparing?: boolean;
  actionText: string;
}) => {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(true);

  return (
    <>
      <div className="flex gap-2 justify-between">
        <p className="text-sm">
          Accept{" "}
          <a href={DISCLAIMER_URL} target="_blank" rel="noopener noreferrer" className="text-primary">
            Disclaimer
          </a>
        </p>
        <Switch aria-label="Accept disclaimer" checked={disclaimerAccepted} onCheckedChange={setDisclaimerAccepted} />
      </div>
      <Button type="button" disabled={!disclaimerAccepted || isPreparing || disabled} onClick={onConfirm}
        isLoading={isPreparing} aria-busy={isPreparing || undefined}
        aria-label={isPreparing ? "Checking allowance" : undefined}>
        {!isPreparing ? actionText : null}
      </Button>
    </>
  );
};
