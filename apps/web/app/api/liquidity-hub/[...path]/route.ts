const API_BY_CHAIN: Readonly<Record<number, string>> = {
  56: "https://bsc.hub.orbs.network",
  137: "https://polygon.hub.orbs.network",
  146: "https://sonic.hub.orbs.network",
  250: "https://ftm.hub.orbs.network",
  1101: "https://zkevm.hub.orbs.network",
  8453: "https://base.hub.orbs.network",
  42161: "https://arbi.hub.orbs.network",
  59144: "https://linea.hub.orbs.network",
  81457: "https://blast.hub.orbs.network",
};

const DEFAULT_API = "https://hub.orbs.network";

const isAllowedPath = (path: string[]): boolean =>
  (path.length === 1 && (path[0] === "quote" || path[0] === "swap-async")) ||
  (path.length === 3 &&
    path[0] === "swap" &&
    path[1] === "status" &&
    Boolean(path[2]));

const jsonError = (message: string, status: number): Response =>
  Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );

/**
 * Same-origin development proxy for Liquidity Hub's JSON POST endpoints.
 * The fixed hosts and endpoint allowlist keep this from becoming an open proxy.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  if (process.env.NODE_ENV !== "development") {
    return jsonError("Not found", 404);
  }

  const { path } = await params;
  if (!isAllowedPath(path)) {
    return jsonError("Unsupported Liquidity Hub endpoint", 404);
  }

  const requestUrl = new URL(request.url);
  const chainId = Number(requestUrl.searchParams.get("chainId"));
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    return jsonError("A valid chainId is required", 400);
  }

  const upstreamApi = API_BY_CHAIN[chainId] ?? DEFAULT_API;
  const upstreamPath = path.map(encodeURIComponent).join("/");
  const upstreamUrl = `${upstreamApi}/${upstreamPath}?${requestUrl.searchParams.toString()}`;

  try {
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        Accept: request.headers.get("accept") ?? "application/json",
        "Content-Type":
          request.headers.get("content-type") ?? "application/json",
      },
      body: await request.text(),
      cache: "no-store",
      signal: request.signal,
    });

    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy error";
    return jsonError(message, 502);
  }
}
