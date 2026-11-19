import { getNeonAuth } from "@/lib/neon/server";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function getManagerToken(request: Request, authBaseUrl: string) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const response = await fetch(`${authBaseUrl.replace(/\/$/, "")}/token`, {
    headers: { cookie, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const result = (await response.json()) as { token?: string };
  return result.token ?? null;
}

async function callDataApi(url: string, token: string, rpc: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${url.replace(/\/$/, "")}/rpc/${rpc}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = payload as { message?: string; details?: string } | null;
    throw new Error(failure?.message ?? failure?.details ?? `Database request failed (${response.status})`);
  }
  return payload;
}

export async function POST(request: Request) {
  const auth = getNeonAuth();
  const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
  const dataApiUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (!auth || !authBaseUrl || !dataApiUrl) return jsonError("إعداد Neon غير مكتمل على هذا النشر.", 503);

  try {
    const { data } = await auth.getSession();
    if (!data?.user) return jsonError("سجّل الدخول أولاً.", 401);
    const token = await getManagerToken(request, authBaseUrl);
    if (!token) return jsonError("انتهت الجلسة. سجّل الدخول مرة أخرى.", 401);

    // Authorization is checked in Postgres before an Auth identity is created.
    const canManage = await callDataApi(dataApiUrl, token, "can_manage_users", {});
    if (canManage !== true) return jsonError("حسابك لا يملك صلاحية إضافة الموظفين.", 403);

    const input = await request.json() as {
      name?: unknown; email?: unknown; password?: unknown; roleId?: unknown;
      phoneVisible?: unknown; priceVisible?: unknown;
    };
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";
    const roleId = typeof input.roleId === "string" ? input.roleId : "";
    if (name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10 || !roleId) {
      return jsonError("راجع الاسم والبريد وكلمة المرور (10 أحرف على الأقل) والدور.", 400);
    }

    const signup = await fetch(`${authBaseUrl.replace(/\/$/, "")}/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(request.headers.get("origin") ? { Origin: request.headers.get("origin")! } : {}) },
      body: JSON.stringify({ name, email, password }),
      cache: "no-store",
    });
    const signupBody = await signup.json().catch(() => null) as { user?: { id?: string }; message?: string; error?: string } | null;
    if (!signup.ok || !signupBody?.user?.id) {
      const message = signupBody?.message ?? signupBody?.error ?? "تعذر إنشاء حساب الدخول. تحقق من إعداد السماح بإنشاء الحسابات في Neon Auth.";
      return jsonError(message, signup.status === 429 ? 429 : 400);
    }

    try {
      const profileInput = {
        p_auth_user_id: signupBody.user.id,
        p_name: name,
        p_email: email,
        p_role_id: roleId,
        p_phone_visible: input.phoneVisible === true,
        p_price_visible: input.priceVisible === true,
      };
      let linked = false;
      for (let attempt = 0; attempt < 5 && !linked; attempt += 1) {
        try {
          await callDataApi(dataApiUrl, token, "create_employee_profile", profileInput);
          linked = true;
        } catch (error) {
          const pendingSync = error instanceof Error && error.message.includes("Neon Auth user was not found yet");
          if (!pendingSync || attempt === 4) throw error;
          await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
    } catch (error) {
      // The account is still a valid viewer if a concurrent Neon Auth sync
      // delays profile linking; explain that it can be retried after refresh.
      const message = error instanceof Error ? error.message : "تعذر ربط حساب الدخول بملف الموظف.";
      return jsonError(`تم إنشاء حساب الدخول، لكن لم يكتمل ربط ملف الموظف: ${message}`, 502);
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إضافة الموظف.";
    return jsonError(message, 400);
  }
}
