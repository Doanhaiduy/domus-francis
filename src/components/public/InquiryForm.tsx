"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import { CustomInput, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";

// Form "Đăng ký tìm hiểu / xin vào ở" cho người ngoài (không cần tài khoản). Gọi API công khai bằng fetch thuần (không dùng
// api client của ứng dụng vì không có phiên/CSRF). Chống spam: ô ẩn "website", thời gian điền, CAPTCHA Turnstile tùy chọn.

const YEARS = [
  { value: "", label: "— Chọn —" },
  { value: "Học sinh lớp 12", label: "Học sinh lớp 12 (sắp vào đại học)" },
  { value: "Sinh viên năm 1", label: "Sinh viên năm 1" },
  { value: "Sinh viên năm 2", label: "Sinh viên năm 2" },
  { value: "Sinh viên năm 3", label: "Sinh viên năm 3" },
  { value: "Sinh viên năm 4 trở lên", label: "Sinh viên năm 4 trở lên" },
  { value: "Khác", label: "Khác" },
];

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

export function InquiryForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const [f, setF] = useState({ fullName: "", phone: "", email: "", school: "", yearOfStudy: "", parish: "", preferredVisit: "", message: "", website: "" });
  const [token, setToken] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const captchaEl = useRef<HTMLDivElement>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  // Cloudflare Turnstile (chỉ khi có khóa site)
  useEffect(() => {
    if (!turnstileSiteKey || !captchaEl.current) return;
    let widget: string | undefined;
    const mount = () => {
      if (window.turnstile && captchaEl.current && !widget) widget = window.turnstile.render(captchaEl.current, { sitekey: turnstileSiteKey, callback: (t: string) => setToken(t), "expired-callback": () => setToken(undefined) });
    };
    if (window.turnstile) mount();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = mount;
      document.head.appendChild(s);
    }
    return () => {
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, [turnstileSiteKey]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.fullName.trim().length < 2) return setError("Vui lòng nhập họ tên.");
    if (!f.phone.trim() && !f.email.trim()) return setError("Vui lòng để lại số điện thoại hoặc email để chúng tôi liên hệ.");
    if (turnstileSiteKey && !token) return setError("Vui lòng xác nhận bạn là người thật (ô kiểm bên dưới).");
    setBusy(true);
    try {
      const res = await fetch("/api/v1/public/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...f, email: f.email.trim() || null, phone: f.phone.trim() || null, startedAt: startedAt.current, turnstileToken: token }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || "Không gửi được. Vui lòng thử lại hoặc gọi hotline.");
      }
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center space-y-3" role="status">
        <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
        <h3 className="text-xl font-extrabold text-emerald-900">Cảm ơn bạn!</h3>
        <p className="text-sm text-emerald-900/80 leading-relaxed">Chúng tôi đã nhận thông tin và sẽ liên hệ với bạn sớm nhất. Nếu cần gấp, bạn có thể gọi trực tiếp hotline của lưu xá.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {/* Ô bẫy cho người máy: ẩn khỏi người dùng thật */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Trang web của bạn
          <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website")(e.target.value)} />
        </label>
      </div>

      <CustomInput label="Họ và tên *" value={f.fullName} onChange={(e) => set("fullName")(e.target.value)} maxLength={120} autoComplete="name" placeholder="VD: Nguyễn Văn An" />
      <div className="grid sm:grid-cols-2 gap-4">
        <CustomInput label="Số điện thoại / Zalo" value={f.phone} onChange={(e) => set("phone")(e.target.value)} maxLength={20} inputMode="tel" autoComplete="tel" placeholder="09xx xxx xxx" />
        <CustomInput label="Email" type="email" value={f.email} onChange={(e) => set("email")(e.target.value)} maxLength={200} autoComplete="email" placeholder="ten@gmail.com" />
      </div>
      <p className="text-[11px] text-gray-400 -mt-2">Cần ít nhất một trong hai: số điện thoại hoặc email.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <CustomInput label="Trường đang / sắp học" value={f.school} onChange={(e) => set("school")(e.target.value)} maxLength={200} placeholder="VD: Đại học Nha Trang" />
        <CustomSelect label="Bạn đang là" value={f.yearOfStudy} onChange={set("yearOfStudy")} options={YEARS} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <CustomInput label="Giáo xứ" value={f.parish} onChange={(e) => set("parish")(e.target.value)} maxLength={200} placeholder="VD: Giáo xứ Chính Tòa" />
        <CustomInput label="Muốn đến thăm nhà lúc nào?" value={f.preferredVisit} onChange={(e) => set("preferredVisit")(e.target.value)} maxLength={200} placeholder="VD: Chiều Chủ Nhật" />
      </div>
      <CustomTextarea label="Lời nhắn" value={f.message} onChange={(e) => set("message")(e.target.value)} rows={4} maxLength={1500} placeholder="Bạn muốn hỏi điều gì, hoặc giới thiệu đôi nét về bản thân…" />
      {turnstileSiteKey && <div ref={captchaEl} className="min-h-[65px]" />}
      <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3 rounded-2xl bg-gradient-to-r from-[#5f3add] to-[#7857f8] text-white font-bold text-sm shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Gửi đăng ký
      </button>
      <p className="text-[11px] text-gray-400 leading-relaxed">
        Thông tin chỉ dùng để người quản lý liên hệ tư vấn, không chia sẻ cho bên thứ ba. Khi gửi đăng ký, bạn đồng ý để chúng tôi xử lý thông tin này theo{" "}
        <Link href="/chinh-sach-bao-mat" target="_blank" className="font-semibold text-primary hover:underline">Chính sách bảo mật</Link>.
      </p>
    </form>
  );
}
