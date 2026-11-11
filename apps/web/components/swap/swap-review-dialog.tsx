"use client";

import { useRef, type ReactNode } from "react";
import { SwapFlow, SwapStatus, type Step } from "@orbs-network/swap-ui";
import { formatUnits } from "viem";
import type { SwapQuote } from "@orbs-network/spot-react";
import type { SwapReviewContext, useDirectSwapExecution } from "@/lib/hooks/use-direct-swap-execution";
import { formatDecimals, getExplorerAddressUrl, getExplorerUrl, getWrappedNativeCurrency, makeEllipsisAddress } from "@/lib/utils";
import { useTranslations } from "@/lib/use-translations";
import { ReviewActions, ReviewFooter } from "../review-footer";
import { Button } from "../ui/button";
import { CurrencyLogo } from "../ui/currency-logo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Spinner } from "../ui/spinner";
import { FormatNumber } from "../spot/format-number";
import { OrderDetails } from "../spot/order-details";
import styles from "../review-flow.module.css";

type Execution = ReturnType<typeof useDirectSwapExecution>;
type ReviewPreview = SwapReviewContext & { quote?: SwapQuote };

const getStep = (execution: Execution, review: ReviewPreview): Step => {
  if (execution.phase === "wrapping") return { title: `Wrap ${review.inputToken.symbol}`, footerText: "Proceed in wallet" };
  if (execution.phase === "approving") return { title: `Approve ${review.quote?.request.inToken.toLowerCase() === review.inputToken.address.toLowerCase() ? review.inputToken.symbol : `wrapped ${review.inputToken.symbol}`}`, footerText: "Proceed in wallet" };
  if (execution.phase === "signing") return execution.hostExecution?.preparedOrder
    ? { title: "Sign swap order", footerText: "Proceed in wallet" }
    : { title: "Updating swap quote", footerText: "Fetching the final quote…" };
  if (execution.phase === "settling") return { title: "Checking order status", footerText: "Checking the latest order status…" };
  return { title: "Checking swap", footerText: "Checking allowance and the protected quote…" };
};

export const SwapReviewDialog = ({ open, onOpenChange, review, execution, canConfirm, reviewNotice, onConfirm, onReviewAgain }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review?: ReviewPreview;
  execution: Execution;
  canConfirm: boolean;
  reviewNotice?: ReactNode;
  onConfirm: () => void;
  onReviewAgain: () => void;
}) => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const t = useTranslations();
  const shown = execution.review ?? review;
  if (!shown) return null;
  const quote = execution.hostExecution?.preparedOrder?.quote ?? review?.quote;
  const minimum = quote
    ? formatUnits(BigInt(quote.minimumAmountOut), shown.outputToken.decimals)
    : undefined;
  const output = execution.phase === "success" && execution.order
    ? formatUnits(BigInt(execution.order.dstAmountFilled), shown.outputToken.decimals)
    : quote ? formatUnits(BigInt(quote.netAmountOut), shown.outputToken.decimals) : undefined;
  const inputDisplay = formatDecimals(shown.inputAmountUi, 2, shown.inputToken.decimals);
  const outputDisplay = output === undefined ? "—" : formatDecimals(output, 2, shown.outputToken.decimals);
  // Preparation also runs between wallet steps; only the initial check stays on review.
  const isInitialPreparation = execution.phase === "preparing" && execution.steps.length === 0;
  const isPriceChanged = execution.phase === "price-changed";
  const isSubmitted = execution.isActive && !isInitialPreparation;
  const status = isSubmitted ? SwapStatus.LOADING
    : execution.phase === "success" ? SwapStatus.SUCCESS
    : execution.phase === "failed" || execution.phase === "unconfirmed" ? SwapStatus.FAILED : undefined;
  const reviewContent = (
    <>
      <SwapFlow.Main
        fromTitle="From" toTitle="To"
        inUsd={quote?.inputAmountUsd ? <FormatNumber value={quote.inputAmountUsd} prefix="$" decimalScale={2} /> : undefined}
        outUsd={quote?.netAmountOutUsd ? <FormatNumber value={quote.netAmountOutUsd} prefix="$" decimalScale={2} /> : undefined}
      />
      {!isSubmitted && <ReviewFooter details={<>
        <OrderDetails.MinOutputAmount
          outputToken={shown.outputToken}
          minOutputAmount={minimum}
          label={t("minReceived")}
          tooltip={t("minDstAmountTooltip")}
        />
        <OrderDetails.DetailRow title={t("recipient")}>
          <a href={getExplorerAddressUrl(shown.client.chainId, shown.account)} target="_blank" rel="noopener noreferrer">{makeEllipsisAddress(shown.account)}</a>
        </OrderDetails.DetailRow>
      </>}>
        {!isInitialPreparation && (reviewNotice ?? (!canConfirm && <p role="status" className="text-sm text-muted-foreground">
          {quote ? "The wallet or swap changed. Close this dialog and review the current swap."
            : "A current quote is unavailable. Close this dialog and try again."}
        </p>))}
        <ReviewActions onConfirm={onConfirm} disabled={!canConfirm} isPreparing={isInitialPreparation}
          actionText={isPriceChanged ? "Accept new price" : "Confirm Swap"} />
      </ReviewFooter>}
    </>
  );
  const failedContent = (
    <div className="flex flex-col gap-4">
      <SwapFlow.Failed error={<p role="alert" className="text-sm break-words">{execution.error?.message}</p>} />
      {execution.wrapTxHash && <p className="text-sm text-muted-foreground">
        A wrap is already confirmed. Select {getWrappedNativeCurrency(shown.client.chainId)?.symbol || "the wrapped token"} and review its balance before trying again.
      </p>}
      {execution.phase === "unconfirmed" ? (
        <>
          <p className="text-sm text-muted-foreground">Check the original order before starting another swap.</p>
          <Button type="button" onClick={() => void execution.checkOrderStatus()}>Check order status</Button>
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
          className={styles.flow}
          inAmount={inputDisplay} outAmount={outputDisplay}
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
