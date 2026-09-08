"use client";
import { Virtuoso } from "react-virtuoso";
import { useHistoryOrder, type Token } from "@orbs-network/spot-react";
import { useDateFormat } from "@/lib/hooks/common";
import { getExplorerUrl, makeEllipsisAddress } from "@/lib/utils";
import { FormatNumber } from "./format-number";
import { OrderDetails } from "./order-details";
import { SpotTokenLogo } from "./components";
import { useTranslations } from "@/lib/use-translations";
import { useOrdersPanelContext } from "./orders-context";
import { ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import { useCallback } from "react";
import { useConnection } from "wagmi";

type SelectedOrder = NonNullable<ReturnType<typeof useHistoryOrder>>;
type DerivedFill = SelectedOrder["fills"][number];
const VIRTUAL_LIST_STYLE = { height: "100%" } as const;
const getFillKey = (index: number, fill: DerivedFill) =>
  `${fill.txHash}:${index}`;

export const FillsButton = ({ count }: { count: number }) => {
  const t = useTranslations();
  const { onShowOrderFills } = useOrdersPanelContext();
  return (
    <div
      className="twap-orders__selected-order-fills-button"
      onClick={onShowOrderFills}
    >
      <p>
        {t("orderFills")}{" "}
        <span className="twap-orders__selected-order-fills-button-count">
          ({count})
        </span>
      </p>
      <ChevronDownIcon className="size-4" />
    </div>
  );
};

const FillsTokensDisplayToken = ({ token }: { token?: Token }) => {
  return (
    <div className="twap-orders__selected-order-fills-token">
      <SpotTokenLogo token={token} />
      <p className="twap-orders__selected-order-fills-token-symbol">
        {token?.symbol}
      </p>
    </div>
  );
};

const FillsTokensDisplay = ({
  inputToken,
  outputToken,
}: {
  inputToken?: Token;
  outputToken?: Token;
}) => {
  return (
    <div className="twap-orders__selected-order-fills-tokens">
      <FillsTokensDisplayToken token={inputToken} />
      <span className="twap-orders__selected-order-fills-token-separator">
        <ArrowRightIcon className="size-4" />
      </span>
      <FillsTokensDisplayToken token={outputToken} />
    </div>
  );
};

const FillItem = ({
  fill,
  index,
}: {
  fill: DerivedFill;
  index: number;
}) => {
  const dateUi = useDateFormat(fill.timestamp);
  const t = useTranslations();
  const { chainId } = useConnection();
  const explorerUrl = getExplorerUrl(chainId, fill.txHash);

  return (
    <OrderDetails className="twap-fills-view__item">
      <OrderDetails.DetailRow
        title={t("fillIndex")}
        className="twap-fills-view__item-index"
      >
        <p>{`#${index}`}</p>
      </OrderDetails.DetailRow>
      <OrderDetails.DetailRow
        title={t("fillTimestamp")}
        className="twap-fills-view__item-date"
      >
        {dateUi}
      </OrderDetails.DetailRow>
      <OrderDetails.DetailRow
        title={t("fillAmountOut")}
        className="twap-fills-view__item-amount-in"
      >
        <FormatNumber value={fill.inputAmount.ui} /> {fill.inputToken.symbol}
      </OrderDetails.DetailRow>
      <OrderDetails.DetailRow
        title={t("fillAmountReceived")}
        className="twap-fills-view__item-amount-out"
      >
        <FormatNumber value={fill.outputAmount.ui} /> {fill.outputToken.symbol}
      </OrderDetails.DetailRow>

      {fill.txHash && (
        <OrderDetails.DetailRow
          title={t("fillTransactionHash")}
          className="twap-fills-view__item-tx"
        >
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={fill.txHash}
          >
            {makeEllipsisAddress(fill.txHash)}
          </a>
        </OrderDetails.DetailRow>
      )}
    </OrderDetails>
  );
};

export const FillsView = ({ order }: { order: SelectedOrder }) => {
  const t = useTranslations();
  const fills = order.fills;
  const renderFill = useCallback(
    (index: number, fill: DerivedFill) => (
      <FillItem fill={fill} index={index + 1} />
    ),
    [],
  );

  return (
    <div className="twap-orders__selected-order-fills">
      <FillsTokensDisplay
        inputToken={order.inputToken}
        outputToken={order.outputToken}
      />

      {fills.length === 0 ? (
        <p className="twap-orders__selected-order-fills-empty">
          {t("noFills")}
        </p>
      ) : (
        <div className="twap-orders__selected-order-fills-list">
          <Virtuoso
            style={VIRTUAL_LIST_STYLE}
            data={fills}
            computeItemKey={getFillKey}
            itemContent={renderFill}
          />
        </div>
      )}
    </div>
  );
};
