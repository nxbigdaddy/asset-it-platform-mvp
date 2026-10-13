const TOKEN_KEY = "gdzc_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: YOUR_SECRET | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** 仅鉴权；勿带 application/json，否则无 body 的 GET/DELETE 会触发 Fastify 空 JSON 校验错误 */
function authHeaders(): HeadersInit {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function jsonHeaders(): HeadersInit {
  return {
    ...authHeaders(),
    "Content-Type": "application/json",
  };
}

async function handleUnauthorized(): Promise<void> {
  setToken(null);
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

async function fetchOrExplain(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init);
  } catch {
    throw new Error(
      "无法连接后端服务。请确认已启动 API（默认端口 3000），开发环境请使用 npm run dev 同时启动前后端。",
    );
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetchOrExplain(`${path}`, { headers: authHeaders() });
  if (r.status === 401) {
    await handleUnauthorized();
    throw new Error("未登录或会话已过期");
  }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetchOrExplain(`${path}`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (r.status === 401) {
    await handleUnauthorized();
    throw new Error("未登录或会话已过期");
  }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const r = await fetchOrExplain(`${path}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (r.status === 401) {
    await handleUnauthorized();
    throw new Error("未登录或会话已过期");
  }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const r = await fetchOrExplain(`${path}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (r.status === 401) {
    await handleUnauthorized();
    throw new Error("未登录或会话已过期");
  }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const r = await fetchOrExplain(`${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (r.status === 401) {
    await handleUnauthorized();
    throw new Error("未登录或会话已过期");
  }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
}

/** multipart：由调用方 append 字段（首文件可由后端 req.file() 接收） */
export async function apiPostFormData<T>(path: string, formData: FormData): Promise<T> {
  const t = getToken();
  const r = await fetchOrExplain(`${path}`, {
    method: "POST",
    headers: t ? { Authorization: `Bearer ${t}` } : {},
    body: formData,
  });
  if (r.status === 401) {
    await handleUnauthorized();
    throw new Error("未登录或会话已过期");
  }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export async function downloadAuthorizedFile(apiPath: string, filename: string): Promise<void> {
  const t = getToken();
  const r = await fetchOrExplain(apiPath, {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  });
  if (r.status === 401) {
    await handleUnauthorized();
    throw new Error("未登录或会话已过期");
  }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function loginRequest(username: string, password: YOUR_PASSWORD): Promise<{
  token: YOUR_SECRET;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    role: string;
    orgScopeJson: string | null;
  };
}> {
  const r = await fetchOrExplain("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) {
    let msg = await r.text();
    try {
      const j = JSON.parse(msg) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg || "登录失败");
  }
  return r.json() as Promise<{
    token: YOUR_SECRET;
    user: {
      id: string;
      username: string;
      displayName: string | null;
      role: string;
      orgScopeJson: string | null;
    };
  }>;
}
