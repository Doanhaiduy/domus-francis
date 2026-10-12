"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, HandHeart, Loader2 } from "lucide-react";
import { CustomDatePicker, CustomInput, CustomTextarea, CustomToggle } from "@/components/ui/FormControls";
import { formatVND } from "@/lib/utils";
import { DONATION_AMOUNT_EVENT } from "./DonationQr";

// Biểu mẫu "Báo đã ủng hộ" cho người ngoài (không cần tài khoản) ⇒ POST /api/v1/public/donations ⇒ khoản CHỜ Thủ quỹ đối chiếu sao kê
// và xác nhận (chưa vào sổ quỹ cho tới khi xác nhận). Gọi API bằng fetch thuần (không có phiên/CSRF). Chống spam: ô bẫy "website",
// thời gian điền, CAPTCHA Turnstile khi có khóa (giống biểu mẫu Đăng ký tìm hiểu).

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

const vnToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const digits = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10);
const grouped = (s: string) => (s ? Number(s).toLocaleString("vi-VN") : "");

export function DonationReportForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const today = vnToday();
  const [name, setName] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [token, setToken] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const amountTouched = useRef(false);
  const captchaEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAt.current = Date.now();
    // Người xem chọn số tiền ở mã QR ⇒ điền sẵn (nếu chưa tự gõ)
    const onPick = (e: Event) => {
      const v = (e as CustomEvent<number>).detail;
      if (!amountTouched.current && typeof v === "number" && v > 0) setAmount(String(v));
    };
    window.addEventListener(DONATION_AMOUNT_EVENT, onPick);
    return () => window.removeEventListener(DONATION_AMOUNT_EVENT, onPick);
  }, []);

  // Cloudflare Turnstile (chỉ khi có khóa site)
  useEffect(() => {
    if (!turnstileSiteKey || !captchaEl.current || done) return;
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
  }, [turnstileSiteKey, done]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountVnd = Number(amount);
    if (!anonymous && name.trim().length < 2) return setError("Vui lòng nhập họ tên hoặc danh xưng — hoặc bật “Ủng hộ ẩn danh”.");
    if (!amountVnd || amountVnd < 1000) return setError("Vui lòng nhập số tiền đã chuyển (tối thiểu 1.000đ).");
    if (amountVnd > 1_000_000_000) return setError("Số tiền tối đa 1.000.000.000đ — khoản lớn hơn xin liên hệ trực tiếp người quản lý.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Vui lòng chọn ngày chuyển khoản.");
    if (date > today) return setError("Ngày chuyển khoản không được ở tương lai.");
    if (turnstileSiteKey && !token) return setError("Vui lòng xác nhận bạn là người thật (ô kiểm bên dưới).");
    setBusy(true);
    try {
      const res = await fetch("/api/v1/public/donations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          donorName: anonymous ? null : name.trim(),
          anonymous,
          amountVnd,
          donatedOn: date,
          message: message.trim() || null,
          contact: contact.trim() || null,
          website,
          startedAt: startedAt.current,
          turnstileToken: token,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || "Không gửi được. Vui lòng thử lại hoặc gọi hotline của nhà.");
      }
      setDone(amountVnd);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-7 text-center space-y-3" role="status">
        <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" aria-hidden />
        <h3 className="text-xl font-extrabold text-emerald-900">Xin chân thành cảm ơn!</h3>
        <p className="text-sm text-emerald-900/80 leading-relaxed">
          Chúng tôi đã nhận thông tin khoản ủng hộ <b>{formatVND(done)}</b>. Thủ quỹ sẽ đối chiếu với sao kê ngân hàng và ghi nhận vào quỹ chung của nhà. Nguyện xin Chúa chúc lành cho bạn và gia đình.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl bg-purple-50/60 border border-purple-100 px-4 py-2">
        <CustomToggle checked={anonymous} onChange={setAnonymous} label="Ủng hộ ẩn danh" description="Nhà ghi nhận là “Ẩn danh”, không hỏi tên bạn." />
      </div>
      {!anonymous && (
        <CustomInput label="Họ tên hoặc danh xưng *" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" placeholder="VD: Gia đình anh Giuse Minh" />
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <CustomInput
          label="Số tiền đã chuyển *"
          inputMode="numeric"
          autoComplete="off"
          value={grouped(amount)}
          onChange={(e) => {
            amountTouched.current = true;
            setAmount(digits(e.target.value));
          }}
          placeholder="VD: 500.000"
          rightSuffix="đ"
        />
        <CustomDatePicker label="Ngày chuyển *" value={date} format="YYYY-MM-DD" onChange={(v) => setDate(v || today)} />
      </div>
      <CustomTextarea label="Lời nhắn (tùy chọn)" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={300} placeholder="Lời chúc, ý cầu nguyện hoặc mục đích bạn muốn gửi gắm…" />
      <CustomInput
        label="Số điện thoại hoặc email (tùy chọn)"
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        maxLength={120}
        autoComplete="off"
        placeholder="Để nhà gửi lời cảm ơn khi đã nhận"
      />
      {turnstileSiteKey && <div ref={captchaEl} className="min-h-[65px]" />}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3 rounded-2xl bg-gradient-to-r from-[#5f3add] to-[#7857f8] text-white font-bold text-sm shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <HandHeart className="w-4 h-4" aria-hidden />} Gửi thông tin ủng hộ
      </button>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Chỉ những người giữ sổ quỹ của nhà xem thông tin này để đối chiếu và gửi lời cảm ơn; tên người ủng hộ không được công khai. Xem{" "}
        <Link href="/chinh-sach-bao-mat" target="_blank" className="font-semibold text-primary hover:underline">Chính sách bảo mật</Link>.
      </p>
      {/* Ô bẫy cho người máy: ẩn khỏi người dùng thật */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Trang web của bạn
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
    </form>
  );
}
