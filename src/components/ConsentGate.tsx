"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Database, FileText, HeartHandshake, Loader2, Lock, LogOut, Server, ShieldCheck, UserCheck } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { legalConsentApi, useLegalConsent } from "@/lib/data/consents";
import { LEGAL_GATE_POINTS, LEGAL_PATHS } from "@/content/legal";
import { Portal } from "@/components/ui/Portal";

// Gói I — Quyền riêng tư: hộp thoại BẮT BUỘC xác nhận Điều khoản sử dụng + Chính sách bảo mật khi thành viên chưa từng xác nhận (kể cả tài khoản do
// người quản lý tạo / nhập Excel) hoặc khi LEGAL_VERSION đổi. Ghi 2 đồng ý (terms_of_use + privacy_notice_ack) đúng phiên bản qua
// POST /api/v1/consents/legal. Không đóng được (không có nút X, Esc, bấm ra ngoài); lối thoát duy nhất là Đăng xuất.
// AppShell chỉ gắn thành phần này ở nhánh ứng dụng bình thường ⇒ màn hình chặn bảo mật (mật khẩu tạm / 2FA) luôn hiện TRƯỚC.

const ICONS = [Database, ShieldCheck, Lock, Server, UserCheck, HeartHandshake];

export function ConsentGate() {
  const { session, logout } = useSession();
  const { showToast } = useApp();
  const enabled = !!session?.member;
  const { status, mutate } = useLegalConsent(enabled);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const open = enabled && !!status?.required;

  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
    // Giữ tiêu điểm bàn phím trong hộp thoại bắt buộc (Tab / Shift+Tab xoay vòng, không lọt xuống trang phía sau)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !dialogRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || active === titleRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!open || !status) return null;

  const updated = status.hadPrevious;
  const name = session?.member?.displayName || session?.member?.fullName || "bạn";

  const accept = async () => {
    setBusy(true);
    try {
      const r = await legalConsentApi.accept();
      await mutate(r, { revalidate: false });
      showToast("success", `Cảm ơn ${name}! Đã ghi nhận bạn đồng ý Điều khoản sử dụng và Chính sách bảo mật (phiên bản ${r.version}).`);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setLeaving(true);
    await logout();
  };

  return (
    <Portal>
      <div data-no-sheet data-no-guard data-consent-gate className="fixed inset-0 z-[1100] bg-gray-900/60 backdrop-blur-sm overflow-y-auto overscroll-contain p-0 sm:p-6 animate-in fade-in duration-150">
        <div className="flex min-h-full items-end sm:items-center justify-center">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-gate-title"
            aria-describedby="consent-gate-desc"
            className="w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-purple-100 flex flex-col max-h-[100dvh] sm:max-h-[90vh] overflow-hidden animate-sheetUp sm:animate-scaleIn"
          >
            <header className="relative p-5 sm:p-7 pb-4 sm:pb-5 border-b border-gray-100 bg-gradient-to-br from-purple-50 via-white to-white shrink-0">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] text-white flex items-center justify-center shadow-lg shadow-purple-300/50 shrink-0">
                  <ShieldCheck className="w-6 h-6" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-primary">
                    {updated ? `Văn bản đã cập nhật · phiên bản ${status.version}` : `Trước khi bắt đầu · phiên bản ${status.version}`}
                  </p>
                  <h2 ref={titleRef} tabIndex={-1} id="consent-gate-title" className="mt-0.5 text-lg sm:text-xl font-extrabold text-gray-900 leading-snug focus:outline-none">
                    {updated ? "Điều khoản & Chính sách bảo mật đã được cập nhật" : `Chào ${name}! Vui lòng xác nhận Điều khoản & Chính sách bảo mật`}
                  </h2>
                </div>
              </div>
              <p id="consent-gate-desc" className="mt-3 text-[13px] text-gray-600 leading-relaxed">
                {updated
                  ? `Nội dung đã thay đổi so với bản bạn đồng ý trước đây${status.previousVersion ? ` (${status.previousVersion})` : ""}. Hãy xem lại những điểm chính dưới đây và xác nhận để tiếp tục dùng ứng dụng.`
                  : "Để dùng ứng dụng của nhà, bạn cần đọc và đồng ý Điều khoản sử dụng và Chính sách bảo mật. Dưới đây là những điểm chính — nội dung đầy đủ ở hai liên kết bên dưới."}
              </p>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-7 space-y-4">
              <ul className="space-y-3">
                {LEGAL_GATE_POINTS.map((p, i) => {
                  const Icon = ICONS[i % ICONS.length];
                  return (
                    <li key={p.title} className="flex gap-3">
                      <span className="w-8 h-8 rounded-xl bg-purple-50 text-primary flex items-center justify-center shrink-0" aria-hidden>
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-gray-900">{p.title}</p>
                        <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{p.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {[
                  { href: LEGAL_PATHS.terms, title: "Điều khoản sử dụng", sub: "Tài khoản, quỹ chung, nội dung, trách nhiệm" },
                  { href: LEGAL_PATHS.privacy, title: "Chính sách bảo mật", sub: "Dữ liệu nào, dùng ra sao, quyền của bạn" },
                ].map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    rel="noopener"
                    className="group flex items-start gap-2.5 rounded-2xl border border-purple-100 bg-white hover:border-purple-300 hover:bg-purple-50/50 p-3 transition"
                  >
                    <FileText className="w-4 h-4 text-primary mt-0.5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-xs font-extrabold text-gray-900 group-hover:text-primary">
                        Đọc đầy đủ: {l.title} <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
                      </span>
                      <span className="block text-[11px] text-gray-500 mt-0.5">{l.sub}</span>
                    </span>
                  </a>
                ))}
              </div>

              <p className="text-[11px] text-gray-500 leading-relaxed rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                Bấm “Tôi đã đọc và đồng ý” là bạn xác nhận đã đọc hai văn bản trên (phiên bản {status.version}, cập nhật {status.updated}); hệ thống lưu thời điểm
                và thiết bị xác nhận làm bằng chứng. Các đồng ý không bắt buộc (hồ sơ Công giáo, chia sẻ điểm…) vẫn do bạn tự bật/tắt ở Cài đặt → Bảo mật; muốn
                xem, sửa hay xóa dữ liệu của mình thì vào Cài đặt → Hồ sơ cá nhân → “Quyền riêng tư &amp; dữ liệu của tôi”.
              </p>
            </div>

            <footer className="p-3 sm:p-4 px-4 sm:px-7 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-gray-100 shrink-0 flex flex-wrap-reverse items-center justify-between gap-2 bg-gray-50/70">
              <button
                type="button"
                onClick={signOut}
                disabled={busy || leaving}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-xs font-bold transition disabled:opacity-60"
              >
                {leaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />} Đăng xuất
              </button>
              <button
                type="button"
                onClick={accept}
                disabled={busy || leaving}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-6 py-3 rounded-xl bg-primary hover:bg-primary-container text-white text-sm font-bold shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {busy ? "Đang ghi nhận…" : "Tôi đã đọc và đồng ý"}
              </button>
            </footer>
          </section>
        </div>
      </div>
    </Portal>
  );
}
