"use client";

import React, { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { CheckCircle2, Copy, Download, KeyRound, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, errorMessage, swrFetcher } from "@/lib/api";
import { CustomInput } from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";
import { ZoomableImage } from "@/components/ui/ZoomableImage";

interface MfaStatus {
  enabled: boolean;
  pendingSetup: boolean;
  recoveryRemaining: number;
}
interface SetupResult {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

const MFA_KEY = "/api/v1/auth/mfa";
export const securityCard = "bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4";
export const btnPrimary =
  "inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60";
export const btnGhost =
  "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition disabled:opacity-60";

/**
 * Thẻ "Xác thực 2 bước" (ứng dụng Authenticator + mã khôi phục). Dùng ở Cài đặt → Bảo mật và ở màn hình chặn (SecurityGate) khi vai trò
 * bắt buộc 2FA mà chưa bật. `gateMode`: chỉ làm mới phiên (gỡ màn hình chặn) SAU KHI người dùng xác nhận đã lưu mã khôi phục.
 */
export function MfaCard({ gateMode = false }: { gateMode?: boolean }) {
  const { showToast } = useApp();
  const { session, refreshSession } = useSession();
  const { data: status, mutate } = useSWR<MfaStatus>(MFA_KEY, swrFetcher, { revalidateOnFocus: false });
  const [setup, setSetup] = useState<SetupResult | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [password, setPassword] = useState("");

  const required = !!session?.mfa.required;
  const enabled = !!status?.enabled;

  const begin = async () => {
    setBusy(true);
    try {
      setSetup(await api.post<SetupResult>(`${MFA_KEY}/setup`));
      setCode("");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ recoveryCodes: string[] }>(`${MFA_KEY}/confirm`, { code });
      setRecovery(r.recoveryCodes);
      setSetup(null);
      await mutate();
      // Ở màn hình chặn: chưa làm mới phiên (nếu làm mới ngay, màn hình chặn biến mất cùng 8 mã khôi phục chưa kịp lưu)
      if (!gateMode) await Promise.all([refreshSession(), globalMutate("/api/v1/setup")]);
      showToast("success", "Đã bật xác thực 2 bước.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doneSaving = async () => {
    setRecovery(null);
    if (gateMode) await Promise.all([refreshSession(), globalMutate("/api/v1/setup")]);
  };

  const disable = async () => {
    setBusy(true);
    try {
      await api.del(MFA_KEY, { password });
      setDisabling(false);
      setPassword("");
      await Promise.all([mutate(), refreshSession(), globalMutate("/api/v1/setup")]);
      showToast("success", "Đã tắt xác thực 2 bước.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText((recovery ?? []).join("\n"));
      showToast("success", "Đã sao chép mã khôi phục.");
    } catch {
      showToast("warning", "Trình duyệt không cho sao chép — hãy bôi đen và chép tay.");
    }
  };
  const downloadCodes = () => {
    const blob = new Blob([`Mã khôi phục Lưu Xá Phanxicô (mỗi mã dùng một lần)\n\n${(recovery ?? []).join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "luuxa-ma-khoi-phuc.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className={securityCard}>
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0", enabled ? "bg-emerald-50 text-emerald-600" : "bg-purple-50 text-primary")}>
          {enabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldOff className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold text-gray-900">Xác thực 2 bước</h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Ngoài mật khẩu, mỗi lần đăng nhập cần thêm mã 6 số từ ứng dụng trên điện thoại (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).
          </p>
        </div>
        <span className={cn("shrink-0 px-2.5 py-1 rounded-full text-[11px] font-extrabold", enabled ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600")}>{enabled ? "ĐÃ BẬT" : "CHƯA BẬT"}</span>
      </div>

      {/* MÃ KHÔI PHỤC VỪA SINH */}
      {recovery && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 space-y-3" role="region" aria-label="Mã khôi phục">
          <p className="text-sm font-bold text-violet-900 flex items-center gap-2"><KeyRound className="w-4 h-4" /> Lưu 8 mã khôi phục này ở nơi an toàn</p>
          <p className="text-xs text-violet-900/80 leading-relaxed">Nếu mất điện thoại, mỗi mã dùng được <b>một lần</b> để đăng nhập. Các mã chỉ hiện <b>một lần duy nhất</b> — sẽ không xem lại được.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-sm">
            {recovery.map((c) => <code key={c} className="px-2.5 py-1.5 rounded-lg bg-white border border-violet-100 text-center text-gray-900 select-all">{c}</code>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copyCodes} className={btnGhost}><Copy className="w-3.5 h-3.5" /> Sao chép</button>
            <button type="button" onClick={downloadCodes} className={btnGhost}><Download className="w-3.5 h-3.5" /> Tải về (.txt)</button>
            <button type="button" onClick={doneSaving} className={btnPrimary}><CheckCircle2 className="w-3.5 h-3.5" /> Tôi đã lưu xong{gateMode ? " — vào ứng dụng" : ""}</button>
          </div>
        </div>
      )}

      {/* ĐANG THIẾT LẬP */}
      {!enabled && setup && (
        <div className="grid sm:grid-cols-[auto_1fr] gap-5 items-start rounded-2xl border border-purple-100 bg-surface/50 p-4">
          <ZoomableImage
            src={setup.qrDataUrl}
            viewer={{ src: setup.qrDataUrl, alt: "Mã QR xác thực 2 bước", downloadName: "qr-xac-thuc-2-buoc.png" }}
            alt="Mã QR xác thực 2 bước"
            width={176}
            height={176}
            className="rounded-xl border border-purple-100 bg-white p-2"
            data-keep-bright
          />
          <div className="space-y-3 min-w-0">
            <ol className="text-xs text-gray-600 space-y-1.5 list-decimal pl-4 leading-relaxed">
              <li>Mở ứng dụng Authenticator trên điện thoại → thêm tài khoản → <b>quét mã QR</b>.</li>
              <li>Không quét được? Nhập khóa này: <code className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[11px] select-all break-all">{setup.secret}</code></li>
              <li>Nhập mã 6 số đang hiện trong ứng dụng để xác nhận.</li>
            </ol>
            <div className="flex items-end gap-2 max-w-xs">
              <div className="flex-1">
                <CustomInput label="Mã 6 số" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" onKeyDown={(e) => e.key === "Enter" && code.length === 6 && confirm()} />
              </div>
              <button type="button" onClick={confirm} disabled={busy || code.length !== 6} className={btnPrimary}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Xác nhận
              </button>
            </div>
            <button type="button" onClick={() => setSetup(null)} className="text-[11px] font-semibold text-gray-400 hover:text-gray-700">Hủy thiết lập</button>
          </div>
        </div>
      )}

      {!enabled && !setup && (
        <button type="button" onClick={begin} disabled={busy} className={btnPrimary}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />} Bật xác thực 2 bước
        </button>
      )}

      {enabled && !disabling && !gateMode && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">Còn <b className={cn(status && status.recoveryRemaining < 3 ? "text-amber-700" : "text-gray-800")}>{status?.recoveryRemaining ?? 0}</b> mã khôi phục chưa dùng.</p>
          {!required && <button type="button" onClick={() => setDisabling(true)} className={cn(btnGhost, "text-rose-600 hover:bg-rose-50")}>Tắt xác thực 2 bước</button>}
          {required && <p className="text-[11px] text-gray-400">Vai trò của bạn bắt buộc bật — không tắt được. Mất điện thoại? Nhờ Admin đặt lại.</p>}
        </div>
      )}

      {enabled && disabling && !gateMode && (
        <div className="flex items-end gap-2 max-w-md">
          <div className="flex-1">
            <CustomInput label="Nhập lại mật khẩu để tắt" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <button type="button" onClick={disable} disabled={busy || !password} className={cn(btnPrimary, "!bg-rose-600 hover:!bg-rose-700 !shadow-rose-200")}>Tắt</button>
          <button type="button" onClick={() => { setDisabling(false); setPassword(""); }} className={btnGhost}>Hủy</button>
        </div>
      )}
    </div>
  );
}
