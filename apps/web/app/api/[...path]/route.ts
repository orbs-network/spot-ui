const GAMMA_API = "gamma-api.polymarket.com";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const apiPath = "/" + path.join("/");
  const { searchParams } = new URL(request.url);
  const query = searchParams.toString();
  const fullPath = apiPath + (query ? `?${query}` : "");

  const url = `https://${GAMMA_API}${fullPath}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });

    const data = await res.json();
    return Response.json(data, {
      status: res.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy error";
    return Response.json(
      { error: message },
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
