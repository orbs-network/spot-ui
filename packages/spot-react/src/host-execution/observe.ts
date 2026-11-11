/** Observers report progress; their failures must never interrupt order execution. */
export const observe = (callback: () => unknown): void => {
  try {
    void Promise.resolve(callback()).catch(() => undefined);
  } catch {
    // Both synchronous throws and rejected observer promises are intentionally isolated.
  }
};
