import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const chainId = request.nextUrl.searchParams.get("chainId");

  if (!chainId) {
    return NextResponse.json(
      { error: "chainId is required" },
      { status: 400 },
    );
  }

  const body = await request.text();

  const response = await fetch(
    `${process.env.RPC_URL}?chainId=${chainId}&appId=twap-ui`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
  );

  const data = await response.text();
  return new NextResponse(data, {
    headers: { "Content-Type": "application/json" },
  });
}
