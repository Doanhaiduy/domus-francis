import "server-only";
import { normalizeRoute } from "../ops";

// Báo cáo vi phạm Content-Security-Policy (chế độ CHỈ BÁO — middleware gửi Content-Security-Policy-Report-Only) ⇒ chuẩn hóa để
// ghi vào nhật ký lỗi đã gộp (error_events, nguồn "csp"). Mục đích: biết trang thật đang tải gì từ đâu TRƯỚC khi bật chặn thật.
// Không lưu URL đầy đủ (có thể chứa tham số riêng tư): chỉ nguồn bị chặn rút gọn (origin / "inline" / "eval" / "data:"…) và đường dẫn
// trang đã bỏ tham số + gộp id/slug.

export interface CspViolation {
  /** Chỉ thị bị vi phạm (vd. "img-src", "script-src-elem") */
  directive: string;
  /** Nguồn bị chặn đã rút gọn */
  blocked: string;
  /** Đường dẫn trang (đã gộp id/slug) — null nếu không đọc được */
  route: string | null;
  /** Nguồn mã gây vi phạm (origin) — null khi chính là trang */
  source: string | null;
  disposition: "report" | "enforce" | null;
}

type Obj = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Lược đồ của tiện ích trình duyệt / trang nội bộ trình duyệt — không phải lỗi của ứng dụng. */
const NOISE_SCHEME = /^(chrome|chrome-extension|moz-extension|safari-extension|safari-web-extension|ms-browser-extension|edge|about|webkit-masked-url|resource|android-webview-video-poster):/i;

/** "https://res.cloudinary.com/x/y.jpg?a=1" ⇒ "https://res.cloudinary.com"; "inline" / "eval" giữ nguyên; data:/blob: ⇒ "data:"/"blob:". */
export function shortSource(uri: string): string {
  const u = uri.trim();
  if (!u) return "(trống)";
  if (/^(inline|eval|wasm-eval|self|trusted-types-policy|trusted-types-sink)$/i.test(u)) return u.toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u)?.[1]?.toLowerCase();
  if (scheme && !["http", "https", "ws", "wss"].includes(scheme)) return `${scheme}:`;
  try {
    return new URL(u).origin;
  } catch {
    return u.slice(0, 80);
  }
}

/** Nguồn mã (origin) chỉ giữ khi KHÁC trang chứa nó — nguồn là chính trang thì không thêm thông tin gì. */
function sourceOf(sourceFile: string, documentUrl: string): string | null {
  if (!sourceFile) return null;
  const src = shortSource(sourceFile);
  try {
    if (documentUrl && new URL(documentUrl).origin === src) return null;
  } catch {
    /* tài liệu không phải URL */
  }
  return src;
}

/** Đường dẫn trang của báo cáo: bỏ tham số, gộp slug bài viết và id ⇒ một dòng nhật ký cho cùng một loại trang. */
export function cspRoute(documentUrl: string): string | null {
  try {
    const p = new URL(documentUrl).pathname;
    return normalizeRoute(p.replace(/^\/tin-tuc\/(?!rss\.xml$)[^/]+/, "/tin-tuc/:slug"));
  } catch {
    return null;
  }
}

function fromLegacy(r: Obj): CspViolation | null {
  const directive = (s(r["effective-directive"]) || s(r["violated-directive"]).split(/\s+/)[0]).toLowerCase();
  if (!directive) return null;
  const doc = s(r["document-uri"]);
  const disp = s(r.disposition);
  return {
    directive,
    blocked: shortSource(s(r["blocked-uri"])),
    route: doc ? cspRoute(doc) : null,
    source: sourceOf(s(r["source-file"]), doc),
    disposition: disp === "enforce" || disp === "report" ? disp : null,
  };
}

function fromReportingApi(r: Obj): CspViolation | null {
  if (s(r.type) && s(r.type) !== "csp-violation") return null;
  const b = isObj(r.body) ? r.body : null;
  if (!b) return null;
  const directive = s(b.effectiveDirective).toLowerCase();
  if (!directive) return null;
  const doc = s(b.documentURL) || s(r.url);
  const disp = s(b.disposition);
  return {
    directive,
    blocked: shortSource(s(b.blockedURL)),
    route: doc ? cspRoute(doc) : null,
    source: sourceOf(s(b.sourceFile), doc),
    disposition: disp === "enforce" || disp === "report" ? disp : null,
  };
}

/** Đọc thân báo cáo: application/csp-report ({"csp-report": {...}}) hoặc application/reports+json ([{type, body}, …]). */
export function parseCspReports(body: unknown): CspViolation[] {
  const list = Array.isArray(body) ? body : [body];
  const out: CspViolation[] = [];
  for (const item of list.slice(0, 20)) {
    if (!isObj(item)) continue;
    const v = isObj(item["csp-report"]) ? fromLegacy(item["csp-report"]) : fromReportingApi(item);
    if (v) out.push(v);
  }
  return out;
}

/** Vi phạm do tiện ích trình duyệt / trang nội bộ của trình duyệt gây ra ⇒ bỏ qua. */
export function isNoiseViolation(v: CspViolation): boolean {
  return NOISE_SCHEME.test(v.blocked) || (!!v.source && NOISE_SCHEME.test(v.source));
}

/** Thông điệp ghi nhật ký (gộp theo chỉ thị + nguồn bị chặn + trang). */
export function cspMessage(v: CspViolation): string {
  const from = v.source && v.source !== v.blocked && !/^(inline|eval)$/.test(v.blocked) ? ` (mã từ ${v.source})` : "";
  return `CSP ${v.disposition === "enforce" ? "đã chặn" : "báo"} ${v.directive}: ${v.blocked}${from}`;
}
