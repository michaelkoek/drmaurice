import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/** Pages anyone may open; everything else needs a signed-in student. */
const PUBLIC = ["/login", "/registreren"];

export async function proxy(request: NextRequest) {
  // browser tests run against an in-memory backend without a database; never on Vercel
  if (process.env.NEXT_PUBLIC_E2E === "1" && process.env.VERCEL !== "1") return NextResponse.next();
  // Cookie presence only, for redirects. The API routes validate the session itself.
  const signedIn = !!getSessionCookie(request);
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p + "/"));

  if (!signedIn && !isPublic && !path.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
