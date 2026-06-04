"use client";

import { usePathname } from "next/navigation";
import { UtilaForm } from "@/components/utila-form";
import { UtilaHistory } from "@/components/utila/history";

export function UtilaContent() {
  const pathname = usePathname();

  if (pathname === "/history") {
    return <UtilaHistory />;
  }

  return <UtilaForm />;
}
