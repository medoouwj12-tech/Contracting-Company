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

  return createNeonClient({
    auth: { url: authUrl, adapter: SupabaseAuthAdapter() },
    dataApi: { url: dataApiUrl },
  });
}
