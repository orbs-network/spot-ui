import type { ReactNode } from "react";
import { useConfigureClient } from "../client/use-configure-client";
import { useConfigureOrdersResource } from "../history/resource-hooks";

/** Configure each provider's resources once, independently of mounted controls. */
export const SpotResources = ({ children }: { children: ReactNode }) => {
  useConfigureClient();
  useConfigureOrdersResource();
  return children;
};
