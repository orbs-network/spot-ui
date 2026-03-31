"use client";
import { Virtuoso } from "react-virtuoso";
import {
  useAmountUi,
  useDateFormat,
  useExplorerLink,
  makeEllipsisAddress,
  type SelectedOrder,
  type Token,
  type OrderFill,
} from "@orbs-network/spot-react";
import { FormatNumber } from "./format-number";
import { OrderDetails } from "./order-details";
import { SpotTokenLogo } from "./components";
import { useTranslations } from "@/lib/use-translations";
import { useOrdersPanelContext } from "./orders-context";
import { ArrowRightIcon, ChevronDownIcon } from "lucide-react";

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
  srcToken,
  dstToken,
}: {
  srcToken?: Token;
  dstToken?: Token;
}) => {
  return (
    <div className="twap-orders__selected-order-fills-tokens">
      <FillsTokensDisplayToken token={srcToken} />
      <span className="twap-orders__selected-order-fills-token-separator">
        <ArrowRightIcon className="size-4" />
      </span>
      <FillsTokensDisplayToken token={dstToken} />
    </div>
  );
};

const FillItem = ({
  fill,
  index,
  srcToken,
  dstToken,
}: {
  fill: OrderFill;
  index: number;
  srcToken?: Token;
  dstToken?: Token;
}) => {
  const inAmountUi = useAmountUi(srcToken?.decimals, fill.inAmount);
  const outAmountUi = useAmountUi(dstToken?.decimals, fill.outAmount);
  const dateUi = useDateFormat(fill.timestamp);
  const txUrl = useExplorerLink(fill.txHash);
  const t = useTranslations();

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
        <FormatNumber value={inAmountUi} /> {srcToken?.symbol ?? ""}
      </OrderDetails.DetailRow>
      <OrderDetails.DetailRow
        title={t("fillAmountReceived")}
        className="twap-fills-view__item-amount-out"
      >
        <FormatNumber value={outAmountUi} /> {dstToken?.symbol ?? ""}
      </OrderDetails.DetailRow>

      {fill.txHash && (
        <OrderDetails.DetailRow
          title={t("fillTransactionHash")}
          className="twap-fills-view__item-tx"
        >
          <a
            href={txUrl}
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

export const FillsView = ({
  order,
}: {
  order: SelectedOrder;
}) => {
  const t = useTranslations();
  const fills = order.original?.fills ?? [];

  return (
    <div className="twap-orders__selected-order-fills">
      <FillsTokensDisplay srcToken={order.srcToken} dstToken={order.dstToken} />

      {fills.length === 0 ? (
        <p className="twap-orders__selected-order-fills-empty">
          {t("noFills")}
        </p>
      ) : (
        <div className="twap-orders__selected-order-fills-list">
          <Virtuoso
            style={{ height: "100%" }}
            totalCount={fills.length}
            itemContent={(index) => {
              const fill = fills[index];
              if (!fill) return null;
              return (
                <FillItem
                  fill={fill}
                  index={index + 1}
                  srcToken={order.srcToken}
                  dstToken={order.dstToken}
                />
              );
            }}
          />
        </div>
      )}
    </div>
  );
};
