"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, QrCode, ArrowLeft, Smartphone } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { ATTENDANCE_LABEL } from "@/lib/events-format";
import { eventsApi, refreshEvents } from "@/lib/data/events";
import type { CheckInResultDto } from "@/lib/types/events";

/**
 * Trang đích khi quét mã QR điểm danh: /lich-su-kien/diem-danh?t=<token>. Middleware bắt đăng nhập trước (mỗi người
 * chỉ điểm danh cho chính mình). Không có token ⇒ cho nhập mã 6 số hiển thị cạnh mã QR.
 */
function CheckInLanding() {
  const params = useSearchParams();
  const token = params.get("t");
  const { session } = useSession();
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(token ? "working" : "idle");
  const [result, setResult] = useState<CheckInResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const sent = useRef(false);

  const submit = async (body: { token?: string; code?: string }) => {
    setState("working");
    setError(null);
    try {
      const r = await eventsApi.checkIn(body);
      setResult(r);
      setState("done");
      refreshEvents();
    } catch (e) {
      setError(errorMessage(e));
      setState("error");
    }
  };

  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true;
      submit({ token });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex flex-col w-full max-w-md mx-auto gap-6 pb-16 pt-4">
      <div>
        <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <QrCode className="w-4 h-4" />
          <span>Điểm danh sự kiện</span>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Check-in có mặt</h1>
        {session?.member && <p className="text-xs text-gray-500 mt-0.5">Điểm danh cho: <b>{session.member.fullName}</b></p>}
      </div>

      <div className="bg-white rounded-3xl p-6 border border-purple-100 shadow-sm flex flex-col items-center gap-4 text-center">
        {state === "working" && (
          <>
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm font-bold text-gray-700">Đang xác nhận điểm danh...</p>
          </>
        )}

        {state === "done" && result && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-black text-gray-900">
                {ATTENDANCE_LABEL[result.status]}
                {result.time ? ` lúc ${result.time}` : ""}
              </p>
              <p className="text-sm font-bold text-primary">{result.eventTitle}</p>
              <p className="text-xs text-gray-500">Ngày {result.date}</p>
            </div>
          </>
        )}

        {state === "error" && (
          <>
            <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
              <XCircle className="w-9 h-9" />
            </div>
            <p className="text-sm font-bold text-rose-700">{error}</p>
          </>
        )}

        {(state === "idle" || state === "error") && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const digits = code.replace(/\D/g, "");
              if (digits.length !== 6) {
                setError("Mã điểm danh gồm 6 chữ số.");
                setState("error");
                return;
              }
              submit({ code: digits });
            }}
            className="w-full space-y-3"
          >
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1.5">
              <Smartphone className="w-4 h-4" />
              {token ? "Mã QR có thể đã đổi — quét lại hoặc nhập mã 6 số đang hiển thị:" : "Nhập mã 6 số hiển thị dưới mã QR của Ban tổ chức:"}
            </p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
              placeholder="000 000"
              className="w-full text-center font-mono text-2xl font-black tracking-[0.3em] py-3 rounded-2xl border-2 border-purple-200 focus:border-primary focus:outline-none text-primary placeholder:text-gray-300"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs active:scale-95 transition">
              Xác nhận tôi đã có mặt tại đây
            </button>
          </form>
        )}

        <Link href="/lich-su-kien" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" />
          Về Lịch &amp; Sự kiện
        </Link>
      </div>
    </div>
  );
}

export default function DiemDanhPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      }
    >
      <CheckInLanding />
    </Suspense>
  );
}
