import { NATIVE_TOKEN_ADDRESSES } from "./evm-constants";
export function eqIgnoreCase(a: string, b: string) {
  return a == b || a.toLowerCase() == b.toLowerCase();
}

export const isNativeAddress = (address?: string) =>
  NATIVE_TOKEN_ADDRESSES.some((candidate) =>
    eqIgnoreCase(candidate, address || ""),
  );
