"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { Laptop, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, errorMessage, swrFetcher } from "@/lib/api";
import { cn } from "@/lib/utils";
import { dateTimeVN } from "@/lib/finance-format";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { btnGhost, securityCard } from "./MfaCard";

interface TrustedDevice {
  id: string;
  label: string;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  current: boolean;
}

const KEY = "/api/v1/auth/trusted-devices";
const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

/**
 * Cài đặt → Bảo mật: thiết bị đã chọn "Tin cậy thiết bị này trong 30 ngày" ở bước nhập mã 2FA. Đăng nhập lại trên các thiết bị này
 * (mật khẩu đúng) không hỏi mã 2FA cho tới khi hết hạn; thu hồi ở đây để buộc nhập mã trở lại. Chỉ hiện khi đã bật 2FA.
 */
export function TrustedDevicesCard() {
  const { showToast } = useApp();
  const { data, mutate } = useSWR<TrustedDevice[]>(KEY, swrFetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const items = data ?? [];

  const revoke = async (id: string) => {
    setBusy(id);
    try {
      await api.del(`${KEY}/${id}`);
      await mutate();
      showToast("success", "Đã thu hồi — lần đăng nhập sau trên thiết bị đó sẽ hỏi mã 2FA.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const revokeAll = async () => {
    setConfirmAll(false);
    setBusy("all");
    try {
      await api.del(KEY);
      await mutate();
      showToast("success", "Đã thu hồi mọi thiết bị tin cậy.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={securityCard}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center shrink-0"><ShieldCheck className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold text-gray-900">Thiết bị tin cậy</h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Thiết bị bạn đã chọn “Tin cậy thiết bị này trong 30 ngày” khi nhập mã 2FA. Trên các thiết bị này, đăng nhập lại trong 30 ngày không hỏi mã nữa (vẫn phải nhập đúng mật khẩu).
            Đổi mật khẩu hoặc tắt 2FA sẽ thu hồi tất cả.
          </p>
        </div>
        {items.length > 1 && (
          <button type="button" onClick={() => setConfirmAll(true)} disabled={busy !== null} className={cn(btnGhost, "shrink-0 !text-rose-700 !border-rose-200 hover:!bg-rose-50")}>
            Thu hồi tất cả
          </button>
        )}
      </div>

      {data === undefined ? (
        <div className="shimmer-box h-14 rounded-2xl" />
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-3">Chưa có thiết bị nào. Khi đăng nhập và nhập mã 2FA, tick “Tin cậy thiết bị này trong 30 ngày” để không phải nhập mã mỗi lần.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3.5 py-3">
              <Laptop className="w-5 h-5 text-gray-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 flex flex-wrap items-center gap-2">
                  {d.label}
                  {d.current && <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">Thiết bị này</span>}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Tin cậy {dateTimeVN(d.createdAt)}{d.lastUsedAt ? ` · dùng gần nhất ${dateTimeVN(d.lastUsedAt)}` : ""}{d.ip ? ` · IP ${d.ip}` : ""} · còn {daysLeft(d.expiresAt)} ngày
                </p>
              </div>
              <button type="button" onClick={() => revoke(d.id)} disabled={busy !== null} aria-label={`Thu hồi ${d.label}`} title="Thu hồi" className="p-2 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-50">
                {busy === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={revokeAll}
        title="Thu hồi mọi thiết bị tin cậy?"
        message="Lần đăng nhập sau trên TẤT CẢ thiết bị (kể cả thiết bị này) sẽ hỏi mã xác thực 2 bước. Các phiên đang đăng nhập không bị đăng xuất."
        confirmText="Thu hồi tất cả"
      />
    </div>
  );
}
