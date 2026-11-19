import { createClient as createNeonClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";

const authUrl = process.env.NEXT_PUBLIC_NEON_AUTH_URL;
const dataApiUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;

export function hasNeonConfig() {
  return Boolean(authUrl && dataApiUrl);
}

export function createClient() {
  if (!authUrl || !dataApiUrl) {
    throw new Error("Neon is not configured. Add NEXT_PUBLIC_NEON_AUTH_URL and NEXT_PUBLIC_NEON_DATA_API_URL.");
  }

  const client = createNeonClient({
    auth: { url: authUrl, adapter: SupabaseAuthAdapter() },
    dataApi: { url: dataApiUrl },
  });

  // Neon Auth keeps an opaque session token in the browser, while the Data API
  // only accepts a signed JWT carrying the user identity (sub). Exchange the
  // session cookie for a fresh JWT on every request instead of forwarding the
  // session token, so auth.user_id() and the RLS policies can resolve the user.
  client.auth.getJWTToken = async () => {
    try {
      const response = await fetch(`${authUrl}/token`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { token?: string };
      return payload.token ?? null;
    } catch {
      return null;
    }
  };

  return client;
}
