export const isTxRejected = (error: unknown): boolean => {
  const candidates: unknown[] = [error];
  if (typeof error === "object" && error !== null) {
    candidates.push(Reflect.get(error, "error"), Reflect.get(error, "cause"));
  }

  return candidates.some((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      return typeof candidate === "string" && isUserRejectionMessage(candidate);
    }

    const code = Reflect.get(candidate, "code");
    if (
      code === 4001 ||
      code === "4001" ||
      code === "ACTION_REJECTED" ||
      code === "USER_REJECTED" ||
      code === "USER_DENIED"
    ) {
      return true;
    }

    const message = Reflect.get(candidate, "message");
    return typeof message === "string" && isUserRejectionMessage(message);
  });
};

const isUserRejectionMessage = (message: string): boolean =>
  /\buser\b.{0,80}\b(?:rejected|denied|cancelled|canceled)\b/i.test(message) ||
  /\brequest\b\s+(?:was\s+)?\b(?:rejected|denied|cancelled|canceled)\b/i.test(
    message,
  ) ||
  /\b(?:rejected|denied|cancelled|canceled)\b.{0,80}\bby\s+(?:the\s+)?user\b/i.test(
    message,
  );
