import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { SessionData, sessionOptions } from "@/lib/session";

const publicPaths = ["/login", "/setup", "/api/auth"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Feedly OAuth2 callback: redirect_uri is http://localhost:3000
  // so Feedly redirects to "/" with code & state params.
  // Forward these to /setup where the frontend handles the token exchange.
  if (pathname === "/" && request.nextUrl.searchParams.has("code") && request.nextUrl.searchParams.has("state")) {
    const setupUrl = new URL("/setup", request.url);
    setupUrl.search = request.nextUrl.search;
    return NextResponse.redirect(setupUrl);
  }

  // Allow public paths and static assets
  if (
    publicPaths.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Check session
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  if (!session.userId) {
    // API routes get 401, pages get redirected
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
