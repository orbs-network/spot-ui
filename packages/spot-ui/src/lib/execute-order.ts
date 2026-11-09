import type { AllowanceRequest, ApprovalRequest, OrderSigningRequest } from "./client";

/** Framework-neutral wallet adapter implemented by the host application. */
export interface OrderWalletInteractions {
  /** Decide whether the selected input needs native wrapping. False skips wrapping; errors stop execution. */
  shouldWrap(): boolean | Promise<boolean>;
  /** Wrap native input in base units and resolve with the hash after a successful receipt. */
  wrapNativeToken(amountRaw: string): Promise<`0x${string}`>;
  /** Approve the requested raw ERC-20 amount and resolve after a successful receipt. */
  approveToken(request: ApprovalRequest): Promise<`0x${string}`>;
  /** Read the connected account's current allowance as an integer string in token base units. */
  getAllowance(request: AllowanceRequest): Promise<string>;
  /** Read the connected account's ERC-20 balance in base units. Required to verify a completed wrap before retrying. */
  getTokenBalance?(request: { tokenAddress: string }): Promise<string>;
  /** Sign the supplied EIP-712 data and return the original wallet signature unchanged. */
  signOrder(request: OrderSigningRequest): Promise<`0x${string}`>;
}
