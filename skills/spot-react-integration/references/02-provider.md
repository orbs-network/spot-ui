# SpotProvider Setup

## Props

Wrap objects with `useMemo` and functions with `useCallback` so SpotProvider does not re-render unnecessarily. Only `components` is excluded (component references are stable).

```tsx
import { SpotProvider, Module, Partners, Components } from "@orbs-network/spot-react";
import { useMemo, useCallback } from "react";

const marketReferencePrice = useMemo(() => ({
  value: trade?.outAmount,
  isLoading,
  noLiquidity: Boolean(typedValue) && !isLoading && !trade?.outAmount,
}), [trade?.outAmount, isLoading, typedValue]);

const srcToken = useMemo(() => ({
  address: inputCurrency?.address,
  symbol: inputCurrency?.symbol,
  decimals: inputCurrency?.decimals,
  logoUrl: inputCurrency?.logoUrl,
}), [inputCurrency]);

const dstToken = useMemo(() => ({
  address: outputCurrency?.address,
  symbol: outputCurrency?.symbol,
  decimals: outputCurrency?.decimals,
  logoUrl: outputCurrency?.logoUrl,
}), [outputCurrency]);

const resetTypedInputAmount = useCallback(() => setInputAmount(""), []);
const refetchBalances = useCallback(() => { /* ... */ }, []);

const callbacks = useMemo(() => ({
  onOrderCreated: (order) => toast.success("Order created"),
  onSubmitOrderFailed: ({ message }) => toast.error(message),
  onWrapSuccess: ({ txHash }) => toast.success("Wrapped"),
  onApproveSuccess: ({ txHash }) => toast.success("Approved"),
  onOrderFilled: (order) => toast.success("Order filled"),
  onCancelOrderSuccess: () => toast.success("Cancelled"),
}), []);

<SpotProvider
  partner={Partners.Quick}
  module={module}
  priceProtection={3}
  minChunkSizeUsd={5}
  typedInputAmount={inputAmount}
  resetTypedInputAmount={resetTypedInputAmount}
  marketReferencePrice={marketReferencePrice}
  components={{ Button: TwapButton, Tooltip: TwapTooltip, TokenLogo: TwapTokenLogo, Spinner: <Spinner /> }}
  srcToken={srcToken}
  dstToken={dstToken}
  srcBalance={inputBalance}
  dstBalance={outputBalance}
  srcUsd1Token={inputUsd}
  dstUsd1Token={outputUsd}
  chainId={chainId}
  account={address}
  provider={walletClient?.transport}
  useToken={useTokenByAddress}
  refetchBalances={refetchBalances}
  fees={0.25}
  callbacks={callbacks}
/>
```

## Component Wrappers

Import types from spot-react and type your wrappers:

```tsx
import type { ButtonProps, TooltipProps, TokenLogoProps } from "@orbs-network/spot-react";

const TwapButton: React.FC<ButtonProps> = ({ children, onClick, disabled, loading, ...rest }) => (
  <Button onClick={onClick} disabled={disabled} isLoading={loading} {...rest}>
    {children}
  </Button>
);

const TwapTooltip: React.FC<TooltipProps> = ({ children, tooltipText }) => (
  <Tooltip content={tooltipText}>{children}</Tooltip>
);

const TwapTokenLogo: React.FC<TokenLogoProps> = ({ token, size, className }) => (
  <Avatar className={className}><AvatarImage src={token?.logoUrl} /></Avatar>
);

components={{
  Button: TwapButton,
  Tooltip: TwapTooltip,
  TokenLogo: TwapTokenLogo,
  Spinner: <Spinner />,
}}
```

**ButtonProps**: `children`, `onClick`, `disabled?`, `loading?`, `text?`, `style?`, plus HTML attributes
**TooltipProps**: `children?`, `tooltipText?`
**TokenLogoProps**: `token?` (Token), `size?`, `className?`

## useToken Hook

The `useToken` prop expects a hook that looks up token info **by address** and returns a `Token` with `address`, `symbol`, `decimals`, `logoUrl`. The token must include the address.

Many DEXes have a `useCurrency` hook where the currency interface does not include address. You must map it:

```tsx
import { Token } from "@orbs-network/spot-react";

const useTokenByAddress = (address?: string) => {
  const currency = useCurrency(address);

  return useMemo((): Token | undefined => {
    if (!address || !currency) return undefined;
    return {
      address,
      decimals: currency.decimals,
      symbol: currency.symbol,
      logoUrl: currency.logoUrl ?? currency.logoURI,
    };
  }, [address, currency]);
};
```

## Price Protection

- Default 3%, this is NOT slippage
- When Spot is active: hide DEX slippage setting, show only Price Protection
- Persist the same way DEX stores slippage (zustand/redux/localStorage)
