import type { ReactNode } from "react";
import { SpotUiProvider } from "@/components/spot/spot-ui-provider";

export default function UtilaLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <SpotUiProvider>{children}</SpotUiProvider>;
}
