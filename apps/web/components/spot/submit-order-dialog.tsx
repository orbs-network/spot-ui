import { useCallback, useState } from "react";
import {
  DISCLAIMER_URL,
  ExecutionStatus,
  useExecution,
  useOrderForm,
  useSubmitButton,
} from "@orbs-network/spot-react";
import { AlertTriangleIcon } from "lucide-react";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { getOrderTitle } from "@/lib/utils";
import { useTranslations } from "@/lib/use-translations";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Switch } from "../ui/switch";
import { SubmitSwapButton } from "../submit-swap-button";
import { SubmitOrderPanel } from "./submit-order-panel";
import { useSpotFormContext } from "./spot-form-context";

const OrderSubmissionError = ({
  code,
  onClose,
}: {
  code: number;
  onClose: () => void;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-2 bg-destructive/50 p-2 rounded-md">
      <div className="flex flex-row gap-2">
        <AlertTriangleIcon className="size-4 text-foreground relative top-0.5" />
        <p className="text-sm text-foreground flex-1 font-medium">
          Error code: {code}
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
              checked={disclaimerAccepted}
              onCheckedChange={setDisclaimerAccepted}
            />
          </div>
          <Button
            disabled={!disclaimerAccepted || isPreparingOrder}
            onClick={onSubmitOrder}
            isLoading={isPreparingOrder}
            aria-label={isPreparingOrder ? "Checking allowance" : undefined}
          >
            {!isPreparingOrder ? "Create Order" : null}
          </Button>
        </>
      }
    />
  );
};

const OpenOrderReviewButton = ({ onClick }: { onClick: () => void }) => {
  const t = useTranslations();
  const { partner } = useSwapParams();
  const { disabled, loading } = useSubmitButton();
  const chainId = partner?.split("_")[1];
  const partnerChainId = chainId ? Number(chainId) : undefined;

  return (
    <SubmitSwapButton
      onClick={onClick}
      disabled={disabled}
      isLoading={loading}
      text={loading ? t("fetchingQuote") : t("placeOrder")}
      chainId={partnerChainId}
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
  } = useExecution();
  const { setInputAmount } = useSpotFormContext();
  const orderTitle = getOrderTitle(useOrderForm().values.orderType);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {error
              ? "Error Creating Order"
              : !status || isPreparingOrder
                ? `${orderTitle} order`
                : " "}
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <OrderSubmissionError code={error.code} onClose={onClose} />
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
