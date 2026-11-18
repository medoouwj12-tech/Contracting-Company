import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getNeonAuth } from "@/lib/neon/server";

export async function middleware(request: NextRequest) {
  const neonAuth = getNeonAuth();
  if (!neonAuth) return NextResponse.next();
  return neonAuth.middleware({ loginUrl: "/login" })(request);
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
