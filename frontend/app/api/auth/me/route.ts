import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/api";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const data = await response.json();
    if (!response.ok) {
      cookieStore.delete("auth_token");
      return NextResponse.json(
        { detail: data.detail || "Session expired" },
        { status: 401 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { detail: "Failed to connect to authentication service" },
      { status: 500 }
    );
  }
}

