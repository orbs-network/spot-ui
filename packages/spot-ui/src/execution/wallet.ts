import type {
  AllowanceRequest,
  ApprovalRequest,
  CancelOrderRequest,
  OrderSigningRequest,
} from "../client/types";

export type CancelOrderProps = CancelOrderRequest;

export type ApproveTokenProps = ApprovalRequest;

export type WalletInteractions = {
  cancelOrder: (props: CancelOrderProps) => Promise<`0x${string}`>;
  signOrder: (request: OrderSigningRequest) => Promise<`0x${string}`>;
  wrapNativeToken: (amount: string) => Promise<`0x${string}`>;
  approveToken: (props: ApproveTokenProps) => Promise<`0x${string}`>;
  getAllowance: (props: GetAllowanceProps) => Promise<string>;
};

export type GetAllowanceProps = AllowanceRequest;
