import "server-only";

/** Nhãn thiết bị hiển thị: "Trình duyệt · Hệ điều hành" suy từ User-Agent (dùng cho danh sách phiên, cảnh báo thiết bị mới, thiết bị tin cậy). */
export function deviceLabel(ua: string | null): string | null {
  if (!ua) return null;
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Thiết bị";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Trình duyệt";
  return `${br} · ${os}`;
}
