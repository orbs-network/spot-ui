import { useCallback, useState } from "react";
import {
  DISCLAIMER_URL,
  ExecutionPhase,
  ExecutionStatus,
  Module,
  useExecution,
  useOrderForm,
  useSubmitButton,
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
import { Switch } from "../ui/switch";
import { SubmitSwapButton } from "../submit-swap-button";
import { SubmitOrderPanel } from "./submit-order-panel";
import { useSpotFormContext } from "./spot-form-context";

const OrderSubmissionError = ({
  code,
  message,
  onClose,
}: {
  code: number;
  message: string;
  onClose: () => void;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-2 bg-destructive/50 p-2 rounded-md">
      <div className="flex flex-row gap-2">
        <AlertTriangleIcon className="size-4 text-foreground relative top-0.5" />
        <p className="text-sm text-foreground flex-1 font-medium whitespace-pre-wrap break-words max-h-48 overflow-auto">
          {message.split("\n")[0]} (code: {code})
        </p>
      </div>
    </div>
    <div className="w-full flex justify-center">
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
  const isSwap = useOrderForm().module === Module.SWAP;
  const { disabled: submitDisabled } = useSubmitButton();
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(true);

  return (
    <SubmitOrderPanel
      orderTitle={orderTitle}
      reviewDetails={
        <>
          <div className="flex gap-2 justify-between">
            <p className="text-sm">
              Accept{" "}
              <a
                href={DISCLAIMER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary"
              >
                Disclaimer
              </a>
            </p>
            <Switch
              aria-label="Accept disclaimer"
              checked={disclaimerAccepted}
              onCheckedChange={setDisclaimerAccepted}
            />
          </div>
          <Button
            disabled={!disclaimerAccepted || isPreparingOrder || submitDisabled}
            onClick={onSubmitOrder}
            isLoading={isPreparingOrder}
            aria-label={isPreparingOrder ? "Checking allowance" : undefined}
          >
            {!isPreparingOrder ? (isSwap ? "Confirm Swap" : "Create Order") : null}
          </Button>
        </>
      }
    />
  );
};

const OpenOrderReviewButton = ({ onClick }: { onClick: () => void }) => {
  const t = useTranslations();
  const { disabled, loading } = useSubmitButton();
  const { isExecuting } = useExecution();
  const isSwap = useOrderForm().module === Module.SWAP;

  return (
    <SubmitSwapButton
      onClick={onClick}
      disabled={disabled}
      isLoading={loading}
      text={isSwap && isExecuting ? "Executing swap…" : loading ? t("fetchingQuote") : isSwap ? "Review Swap" : t("placeOrder")}
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
    phase,
  } = useExecution();
  const { setInputAmount } = useSpotFormContext();
  const form = useOrderForm();
  const isSwap = form.module === Module.SWAP;
  const orderTitle = isSwap ? "Swap" : getOrderTitle(form.values.orderType);
  const [isOpen, setIsOpen] = useState(false);
  const onOpen = useCallback(() => setIsOpen(true), []);
  const onClose = useCallback(() => {
    if (isExecuting) return;
    setIsOpen(false);
    if (status === ExecutionStatus.SUCCESS) {
      setInputAmount("");
      setTimeout(startNewOrder, 500);
    } else if (Boolean(status)) {
      setTimeout(returnToOrderForm, 500);
    }
  }, [
    isExecuting,
    returnToOrderForm,
    setInputAmount,
    startNewOrder,
    status,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <OpenOrderReviewButton onClick={onOpen} />
      <DialogContent showCloseButton={!isExecuting}>
        <DialogHeader>
          <DialogTitle>
            {error
              ? (isSwap ? "Swap not completed" : "Error Creating Order")
              : !status || isPreparingOrder
                ? (isSwap ? "Review Swap" : `${orderTitle} order`)
                : isSwap ? (isExecuting ? "Executing swap" : "Swap") : " "}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Review the amounts and minimum received before signing your order.
          </DialogDescription>
        </DialogHeader>
        {phase === ExecutionPhase.SETTLING && <p role="status" className="sr-only">Waiting for your swap to fill.</p>}
        {error ? (
          <OrderSubmissionError code={error.code} message={error.message} onClose={onClose} />
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
