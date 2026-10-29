import type { ParsedError } from "./types";

type ExecutionErrorMetadata = Omit<ParsedError, "message">;

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const message = Reflect.get(error, "message");
    if (typeof message === "string") return message;
  }
  return "Unknown error";
};

export const getErrorCode = (error: unknown): ParsedError["code"] => {
  if (typeof error !== "object" || error === null) return 0;
  const code = Reflect.get(error, "code");
  if (typeof code === "number" && Number.isFinite(code)) return code;
  if (typeof code === "string" && code.trim()) {
    if (/^-?\d+$/.test(code)) {
      const numericCode = Number(code);
      return Number.isFinite(numericCode) ? numericCode : 0;
    }
    return code;
  }
  return 0;
};

const getErrorMetadata = (error: unknown): Partial<ExecutionErrorMetadata> => {
  if (typeof error !== "object" || error === null) return {};
  const metadata: Partial<ExecutionErrorMetadata> = { code: getErrorCode(error) };
  const reason = Reflect.get(error, "reason");
  if (reason === "cancelled" || reason === "expired" || reason === "unconfirmed" || reason === "aborted") {
    metadata.reason = reason;
  }
  const orderId = Reflect.get(error, "orderId");
  if (typeof orderId === "string") metadata.orderId = orderId;
  const status = Reflect.get(error, "status");
  if (typeof status === "number" && Number.isFinite(status)) metadata.status = status;
  const serviceCode = Reflect.get(error, "serviceCode");
  if (typeof serviceCode === "string" || (typeof serviceCode === "number" && Number.isFinite(serviceCode))) {
    metadata.serviceCode = serviceCode;
  }
  return metadata;
};

export const normalizeError = (error: unknown): Error => {
  if (error instanceof Error) return error;
  return Object.assign(new Error(getErrorMessage(error)), getErrorMetadata(error), { cause: error });
};

export const parseExecutionError = (error: unknown): ParsedError => {
  const input = getErrorMessage(error);
  const codeMatch = input.match(/,\s*code\s*:\s*(-?\d+)/i);
  const legacyCode = codeMatch ? Number(codeMatch[1]) : 0;
  const message = input
    .replace(/^error\s*:/i, "")
    .replace(/,\s*code\s*:\s*-?\d+/i, "")
    .trim();

  return {
    ...getErrorMetadata(error),
    message: message || "Unknown error",
    code: getErrorCode(error) || (Number.isFinite(legacyCode) ? legacyCode : 0),
  };
};
