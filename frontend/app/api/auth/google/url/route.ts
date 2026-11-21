import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";

export async function GET() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/google/url`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { detail: data.detail || "Failed to retrieve Google Auth URL" },
        { status: response.status }
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
