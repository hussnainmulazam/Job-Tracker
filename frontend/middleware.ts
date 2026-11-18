import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  const { pathname } = request.nextUrl;

  // Legacy route redirections to new recruiter SaaS paths
  if (pathname === "/applications") {
    return NextResponse.redirect(new URL("/pipeline", request.url));
  }
  if (pathname === "/ai-tools") {
    return NextResponse.redirect(new URL("/screening", request.url));
  }
  if (pathname === "/cv") {
    return NextResponse.redirect(new URL("/pipeline", request.url));
  }

  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/register");

  const isProtectedPage =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/pipeline") ||
    pathname.startsWith("/openings") ||
    pathname.startsWith("/screening") ||
    pathname.startsWith("/compare") ||
    pathname.startsWith("/settings");

  // 1. Protect application routes: redirect unauthenticated users to /login
  if (isProtectedPage && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Prevent already authenticated users from accessing /login and /register
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 3. Redirect root / to /dashboard if logged in
  if (pathname === "/" && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/pipeline/:path*",
    "/openings/:path*",
    "/screening/:path*",
    "/compare/:path*",
    "/applications/:path*",
    "/ai-tools/:path*",
    "/cv/:path*",
    "/settings/:path*",
    "/login",
    "/register",
  ],
};
