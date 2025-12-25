import { OrderPreview } from "./order-preview";
import { OrdersList } from "./orders-list";
import { useSpotStore } from "../../store";

export const Orders = () => {
  const selectedOrderID = useSpotStore((s) => s.state.selectedOrderID);
  const isPreviewOrder = selectedOrderID !== undefined;
  return <div className={`twap-orders ${selectedOrderID !== undefined ? "twap-orders__show-selected" : ""}`}>{isPreviewOrder ? <OrderPreview /> : <OrdersList />}</div>;
};
