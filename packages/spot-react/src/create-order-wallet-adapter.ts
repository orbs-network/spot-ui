import { SpotError, type OrderWalletInteractions } from "@orbs-network/spot-ui";

/** Host scope checks and native retry policy stay outside the SDK execution contract. */
export const createOrderWalletAdapter = ({
  wallet, guard, hasConfirmedWrap,
  onWrapConfirmed, onApproveConfirmed,
  queueWrapTransaction = action => action(),
}: {
  wallet: OrderWalletInteractions;
  guard: () => void;
  hasConfirmedWrap: boolean;
  onWrapConfirmed: (hash: `0x${string}`, amountRaw: string) => void;
  onApproveConfirmed: (hash: `0x${string}`) => void;
  queueWrapTransaction?: <T>(action: () => Promise<T>) => Promise<T>;
}): OrderWalletInteractions => {
  const shouldWrap = wallet.shouldWrap.bind(wallet);
  const shouldApprove = wallet.shouldApprove.bind(wallet);
  const wrapNativeToken = wallet.wrapNativeToken.bind(wallet);
  const approveToken = wallet.approveToken.bind(wallet);
  const signOrder = wallet.signOrder.bind(wallet);
  const checked = async <T,>(action: () => T | Promise<T>): Promise<T> => {
    guard();
    const result = await action();
    guard();
    return result;
  };
  return {
    shouldWrap: async () => {
      const required = await checked(shouldWrap);
      if (typeof required !== "boolean") throw new SpotError("INVALID_ARGUMENT", "walletInteractions.shouldWrap must return a boolean");
      if (required && hasConfirmedWrap) {
        throw new SpotError("WRAP_FAILED", "A previous wrap is confirmed. Select the wrapped token and review its balance before trying again.");
      }
      return required;
    },
    shouldApprove: async request => {
      const required = await checked(() => shouldApprove(request));
      if (typeof required !== "boolean") throw new SpotError("INVALID_ARGUMENT", "walletInteractions.shouldApprove must return a boolean");
      return required;
    },
    wrapNativeToken: amountRaw => queueWrapTransaction(async () => {
      guard();
      const amount = amountRaw;
      if (BigInt(amount) <= BigInt(0)) throw new SpotError("WRAP_FAILED", "Wrapping is unnecessary; check shouldWrap before requesting a transaction.");
      const hash = await wrapNativeToken(amount);
      if (!hash) throw new SpotError("WRAP_FAILED", "The required wrap returned no confirmed transaction hash.");
      onWrapConfirmed(hash, amount);
      guard();
      return hash;
    }),
    approveToken: async request => {
      guard();
      const hash = await approveToken(request);
      if (!hash) throw new SpotError("APPROVAL_FAILED", "The required approval returned no confirmed transaction hash.");
      onApproveConfirmed(hash);
      guard();
      return hash;
    },
    signOrder: request => checked(() => signOrder(request)),
  };
};
