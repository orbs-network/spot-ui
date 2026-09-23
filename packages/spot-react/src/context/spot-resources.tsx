import type { ReactNode } from "react";
import { useConfigureClient } from "./use-client";
import { useConfigureOrdersResource } from "../hooks/order-hooks";

/** Configure each provider's resources once, independently of mounted controls. */
export const SpotResources = ({ children }: { children: ReactNode }) => {
  useConfigureClient();
  useConfigureOrdersResource();
  return children;
};
