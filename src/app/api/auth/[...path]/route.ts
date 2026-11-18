import { getNeonAuth } from "@/lib/neon/server";

type AuthRouteContext = { params: Promise<{ path: string[] }> };
type AuthMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

async function handleAuth(method: AuthMethod, request: Request, context: AuthRouteContext) {
  const auth = getNeonAuth();
  if (!auth) {
    return Response.json({ error: "Neon Auth is not configured on this deployment." }, { status: 503 });
  }
  const handler = auth.handler();
  return handler[method](request, context);
}

export const GET = (request: Request, context: AuthRouteContext) => handleAuth("GET", request, context);
export const POST = (request: Request, context: AuthRouteContext) => handleAuth("POST", request, context);
export const PUT = (request: Request, context: AuthRouteContext) => handleAuth("PUT", request, context);
export const DELETE = (request: Request, context: AuthRouteContext) => handleAuth("DELETE", request, context);
export const PATCH = (request: Request, context: AuthRouteContext) => handleAuth("PATCH", request, context);
