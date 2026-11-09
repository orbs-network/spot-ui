"use client";

import { useRef, useState } from "react";
import { SwapFlow, SwapStatus, type Step } from "@orbs-network/swap-ui";
import { DISCLAIMER_URL } from "@orbs-network/spot-react";
import { formatUnits } from "viem";
import type { SwapReview, useDirectSwapExecution } from "@/lib/hooks/use-direct-swap-execution";
import { getExplorerUrl } from "@/lib/utils";
import { Button } from "../ui/button";
import { CurrencyLogo } from "../ui/currency-logo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Switch } from "../ui/switch";
import { Spinner } from "../ui/spinner";
import { FormatNumber } from "../spot/format-number";

type Execution = ReturnType<typeof useDirectSwapExecution>;

const getStep = (execution: Execution, review: SwapReview): Step => {
  if (execution.phase === "wrapping") return { title: `Wrap ${review.inputToken.symbol}`, footerText: "Proceed in wallet" };
  if (execution.phase === "approving") return { title: `Approve ${review.quote.request.inToken.toLowerCase() === review.inputToken.address.toLowerCase() ? review.inputToken.symbol : `wrapped ${review.inputToken.symbol}`}`, footerText: "Proceed in wallet" };
  if (execution.phase === "signing") return { title: "Sign swap order", footerText: "Proceed in wallet" };
  if (execution.phase === "settling") return { title: "Submitting and executing swap", footerText: "Checking your order until the swap fills…" };
  return { title: "Checking swap", footerText: "Checking allowance and the protected quote…" };
};

export const SwapReviewDialog = ({ open, onOpenChange, review, execution, canConfirm, onConfirm, onReviewAgain }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review?: SwapReview;
  execution: Execution;
  canConfirm: boolean;
  onConfirm: () => void;
  onReviewAgain: () => void;
}) => {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(true);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const shown = execution.review ?? review;
  if (!shown) return null;
  const minimum = formatUnits(BigInt(shown.quote.minimumAmountOut), shown.outputToken.decimals);
  const output = execution.phase === "success" && execution.order
    ? formatUnits(BigInt(execution.order.dstAmountFilled), shown.outputToken.decimals)
    : shown.outputAmountUi;
  const status = execution.isActive ? SwapStatus.LOADING
    : execution.phase === "success" ? SwapStatus.SUCCESS
    : execution.phase === "failed" || execution.phase === "unconfirmed" ? SwapStatus.FAILED : undefined;
  const reviewContent = (
    <>
      <SwapFlow.Main
        fromTitle="From" toTitle="To"
        inUsd={shown.quote.inputAmountUsd ? <FormatNumber value={shown.quote.inputAmountUsd} prefix="$" decimalScale={2} /> : undefined}
        outUsd={shown.quote.netAmountOutUsd ? <FormatNumber value={shown.quote.netAmountOutUsd} prefix="$" decimalScale={2} /> : undefined}
      />
      <div className="flex flex-col gap-4">
        <dl className="flex justify-between gap-4 text-sm">
          <dt className="text-muted-foreground">Minimum received</dt>
          <dd className="text-right tabular-nums"><FormatNumber value={minimum} decimalScale={6} /> {shown.outputToken.symbol}</dd>
        </dl>
        <div className="flex items-center justify-between gap-4 text-sm">
          <label htmlFor="swap-disclaimer">Accept <a href={DISCLAIMER_URL} target="_blank" rel="noopener noreferrer" className="text-primary">disclaimer</a></label>
          <Switch id="swap-disclaimer" checked={disclaimerAccepted} onCheckedChange={setDisclaimerAccepted} />
        </div>
        {!canConfirm && <p role="status" className="text-sm text-muted-foreground">The wallet or swap changed. Close this dialog and review the current swap.</p>}
        <Button type="button" onClick={onConfirm} disabled={!canConfirm || !disclaimerAccepted}>Confirm Swap</Button>
      </div>
    </>
  );
  const failedContent = (
    <div className="flex flex-col gap-4">
      <SwapFlow.Failed error={<p role="alert" className="text-sm break-words">{execution.error?.message}</p>} />
      {execution.phase === "unconfirmed" ? (
        <>
          <p className="text-sm text-muted-foreground">Check the original order before starting another swap.</p>
          <Button type="button" onClick={() => void execution.resume()}>Check order status</Button>
        </>
      ) : (
        <Button type="button" onClick={onReviewAgain} disabled={!canConfirm}>Review again</Button>
      )}
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!execution.isActive} className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
        onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}>
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1}>{execution.phase === "unconfirmed" ? "Swap status unconfirmed" : execution.phase === "success" ? "Swap completed" : execution.isActive ? "Executing swap" : "Review Swap"}</DialogTitle>
          <DialogDescription className="sr-only">Review the amounts and minimum received before signing your swap order.</DialogDescription>
        </DialogHeader>
        {execution.isActive && <p role="status" className="sr-only">{getStep(execution, shown).title}</p>}
        <SwapFlow
          inAmount={shown.inputAmountUi} outAmount={output}
          inToken={shown.inputToken} outToken={shown.outputToken}
          swapStatus={status} currentStep={getStep(execution, shown)}
          totalSteps={execution.steps.length || undefined} currentStepIndex={execution.stepIndex}
          components={{
            SrcTokenLogo: <CurrencyLogo currency={shown.inputToken} />,
            DstTokenLogo: <CurrencyLogo currency={shown.outputToken} />,
            Loader: <Spinner className="size-18" />,
            Main: reviewContent,
            Failed: failedContent,
            Success: <SwapFlow.Success title="Swap completed" footerLink={getExplorerUrl(shown.client.chainId, execution.order?.txHash)} footerText={execution.order?.txHash ? "View transaction" : undefined} />,
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
