"use client";
// Client gọi API /api/v1 — gửi kèm X-CSRF-Token, tự làm mới phiên khi gặp 401 rồi thử lại một lần,
// đọc lỗi RFC 9457 (problem+json) thành ApiClientError với thông điệp tiếng Việt từ server.

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public errors?: { field: string; message: string }[]
  ) {
    super(message);
  }
}

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const names = ["__Host-luuxa_csrf", "luuxa_csrf"];
  for (const part of document.cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (names.includes(k)) return decodeURIComponent(v.join("="));
  }
  return "";
}

let refreshing: Promise<boolean> | null = null;
async function refreshOnce(): Promise<boolean> {
  refreshing ??= fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

async function parseError(res: Response): Promise<ApiClientError> {
  let body: { detail?: string; code?: string; errors?: { field: string; message: string }[] } = {};
  try {
    body = await res.json();
  } catch {
    /* không phải JSON */
  }
  return new ApiClientError(res.status, body.code ?? `HTTP_${res.status}`, body.detail ?? `Lỗi ${res.status}`, body.errors);
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** FormData cho upload tệp */
  form?: FormData;
  signal?: AbortSignal;
}

export async function apiFetch<T = unknown>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const method = (opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET")).toUpperCase();
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET") headers["x-csrf-token"] = csrfToken();
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(path.startsWith("/") ? path : `/api/v1/${path}`, {
    method,
    headers,
    body,
    credentials: "same-origin",
    signal: opts.signal,
    cache: "no-store",
  });
  if (res.status === 401 && !retried && !path.includes("/auth/")) {
    if (await refreshOnce()) return apiFetch<T>(path, opts, true);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/dang-nhap")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/dang-nhap?next=${next}`;
    }
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("json") ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  get: <T,>(p: string) => apiFetch<T>(p),
  post: <T,>(p: string, body?: unknown) => apiFetch<T>(p, { method: "POST", body: body ?? {} }),
  put: <T,>(p: string, body?: unknown) => apiFetch<T>(p, { method: "PUT", body: body ?? {} }),
  patch: <T,>(p: string, body?: unknown) => apiFetch<T>(p, { method: "PATCH", body: body ?? {} }),
  del: <T,>(p: string, body?: unknown) => apiFetch<T>(p, { method: "DELETE", body }),
  upload: <T,>(p: string, form: FormData) => apiFetch<T>(p, { method: "POST", form }),
};

/** Fetcher cho SWR: key là đường dẫn API. */
export const swrFetcher = <T,>(key: string) => apiFetch<T>(key);

/** Thông điệp lỗi hiển thị cho người dùng. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error) return e.message;
  return "Đã có lỗi xảy ra.";
}

/** URL ảnh/tệp lưu trên máy chủ local (kiểm quyền theo RLS ở /api/v1/files/:id). */
export function fileUrl(fileId: string | null | undefined, variant?: "thumb" | "medium"): string | null {
  if (!fileId) return null;
  return `/api/v1/files/${fileId}${variant ? `?v=${variant}` : ""}`;
}

/** Chạy tác vụ nền (bỏ qua kết quả/lỗi) để không chặn luồng giao diện. */
export const inBackground = (p: Promise<unknown>): Promise<void> =>
  Promise.resolve(p).then(
    () => {},
    () => {},
  );

