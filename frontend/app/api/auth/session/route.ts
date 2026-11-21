import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ detail: "Token is required" }, { status: 400 });
    }

    const isHttps = request.url.startsWith("https:");
    const cookieStore = await cookies();
    cookieStore.set("auth_token", token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || "Failed to persist authentication session" },
      { status: 500 }
    );
  }
}
