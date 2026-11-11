/** Build the server-side RPC-Man endpoint, including its optional API key. */
export function getRpcUrl(chainId: number | string): string {
  const { RPC_URL, RPC_KEY } = process.env;
  if (!RPC_URL) throw new Error("RPC_URL is not configured");

  const url = new URL(RPC_URL);
  url.searchParams.set("chainId", String(chainId));
  url.searchParams.set("appId", "twap-ui");
  if (RPC_KEY) url.searchParams.set("key", RPC_KEY);
  return url.toString();
}
