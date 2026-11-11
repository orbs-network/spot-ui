import { useCallback, useRef, useState } from "react";
import {
  ExecutionPhase,
  ExecutionStatus,
  useExecution,
  useOrderForm,
  useSubmitButton,
  type ParsedError,
} from "@orbs-network/spot-react";
import { AlertTriangleIcon } from "lucide-react";
import { getOrderTitle } from "@/lib/utils";
import { useTranslations } from "@/lib/use-translations";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { ReviewActions } from "../review-footer";
import { SubmitSwapButton } from "../submit-swap-button";
import { SubmitOrderPanel } from "./submit-order-panel";
import { useSpotFormContext } from "./spot-form-context";

const OrderSubmissionError = ({
  code,
  message,
  onClose,
}: {
  code: ParsedError["code"];
  message: string;
  onClose: () => void;
}) => (
  <div className="flex flex-col gap-4" role="alert">
    <div className="flex flex-col gap-2 bg-destructive/50 p-2 rounded-md">
      <div className="flex flex-row gap-2">
        <AlertTriangleIcon aria-hidden="true" className="size-4 text-foreground relative top-0.5" />
        <p className="text-sm text-foreground flex-1 font-medium whitespace-pre-wrap break-words max-h-48 overflow-auto">
          {message.split("\n")[0]} (code: {code})
        </p>
      </div>
    </div>
    <div className="w-full flex justify-center gap-2">
      <Button onClick={onClose}>Close</Button>
    </div>
  </div>
);

const OrderReview = ({
  onSubmitOrder,
  isPreparingOrder,
  orderTitle,
}: {
  onSubmitOrder: () => void;
  isPreparingOrder: boolean;
  orderTitle: string;
}) => {
  const { disabled: submitDisabled } = useSubmitButton();

  return (
    <SubmitOrderPanel
      orderTitle={orderTitle}
      reviewDetails={
        <ReviewActions onConfirm={onSubmitOrder} disabled={submitDisabled}
          isPreparing={isPreparingOrder} actionText="Create Order" />
      }
    />
  );
};

const OpenOrderReviewButton = ({ onClick }: { onClick: () => void }) => {
  const t = useTranslations();
  const { disabled, loading } = useSubmitButton();
  const { isExecuting, isUnconfirmed } = useExecution();
  const isExecutionAction = isExecuting || isUnconfirmed;
  let text = t("placeOrder");
  if (isUnconfirmed) text = "Check order status";
  else if (isExecuting) text = t("creatingOrder");
  else if (loading) text = t("fetchingQuote");

  return (
    <SubmitSwapButton
      onClick={onClick}
      disabled={disabled && !isUnconfirmed}
      isLoading={loading && !isUnconfirmed}
      forceAction={isExecutionAction}
      text={text}
    />
  );
};

export const SubmitOrderDialog = () => {
  const {
    submitOrder,
    status,
    startNewOrder,
    returnToOrderForm,
    error,
    isPreparingOrder,
    isExecuting,
    totalSteps,
    phase,
    isUnconfirmed,
    checkOrderStatus,
  } = useExecution();
  const { setInputAmount } = useSpotFormContext();
  const form = useOrderForm();
  const orderTitle = getOrderTitle(form.values.orderVariant);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const onOpen = useCallback(() => setIsOpen(true), []);
  const onStartNewOrder = useCallback(() => {
    if (!startNewOrder()) return;
    setInputAmount("");
    setIsOpen(false);
  }, [setInputAmount, startNewOrder]);
  const onClose = useCallback(() => {
    if (isExecuting) {
      if (!startNewOrder()) return;
      setInputAmount("");
      setIsOpen(false);
      return;
    }
    setIsOpen(false);
    if (status === ExecutionStatus.SUCCESS) {
      setInputAmount("");
      setTimeout(startNewOrder, 500);
    } else if (Boolean(status) && !isUnconfirmed) {
      setTimeout(returnToOrderForm, 500);
    }
  }, [
    isExecuting,
    isUnconfirmed,
    returnToOrderForm,
    setInputAmount,
    startNewOrder,
    status,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <OpenOrderReviewButton onClick={onOpen} />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
        onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}>
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1}>
            {isUnconfirmed ? "Order status unconfirmed" : error
              ? "Error Creating Order"
              : !status || (isPreparingOrder && !totalSteps)
                ? `${orderTitle} order`
                : " "}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Review the amounts and minimum received before signing your order.
          </DialogDescription>
        </DialogHeader>
        {phase === ExecutionPhase.SETTLING && <p role="status" className="sr-only">Checking the original order status.</p>}
        {isUnconfirmed ? (
          <div className="flex flex-col gap-4">
            <p role="status" className="text-sm text-muted-foreground">
              The original order may still have been accepted. Check its status before placing a replacement.
              You can create a separate order while the original remains available for status checks.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={checkOrderStatus}>Check order status</Button>
              <Button type="button" variant="outline" onClick={onStartNewOrder}>Create another order</Button>
            </div>
          </div>
        ) : error ? (
          <OrderSubmissionError
            code={error.code}
            message={error.message}
            onClose={onClose}
          />
        ) : (
          <OrderReview
            onSubmitOrder={submitOrder}
            isPreparingOrder={Boolean(isPreparingOrder)}
            orderTitle={orderTitle}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
