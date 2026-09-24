## Partner discovery

The web app owns the partner picker and the navbar network selector. `lib/spot-config.ts` fetches
[Spot config.json](https://raw.githubusercontent.com/orbs-network/spot/master/config.json),
and `lib/spot-partners.ts` extracts partner/chain pairs for `useSpotPartners`.
Successful responses are cached for five minutes and concurrent requests are
shared; failed requests can be retried. This JSON is used only for the picker.
SDK client configuration and analytics use the order-sink `/config` response.

The navbar opens RainbowKit's built-in network modal, including chain logos.
Its trigger stays visible even when the partner supports only one network.
It appears after wallet connection. On Spot routes it lists only the selected
partner's supported networks that are configured in wagmi; other routes show all
configured networks. `PartnerWalletProvider` scopes the chain list while sharing
the original wallet store and connectors, so changing partners preserves the
connection. Loading, unavailable, and empty partner lists offer no networks.
Before a wallet connects, the form follows wagmi's selected network; afterwards
it follows the wallet chain.
Changing partners does not automatically switch the wallet. If the current chain
is unsupported, select a supported network from the navbar before creating an order.
The `partner` URL parameter now contains only the partner name. Older
`partner=name_chainId` links still select the partner, but their chain suffix is ignored.

Run the partner discovery and network-selection tests with `pnpm --filter web test`.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```


Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
