"use client";

import React, { useState } from "react";
import { AlertTriangle, BadgeCheck, Lock, Mail, ShieldCheck } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { CustomToggle } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CONSENT_INFO, SELF_CONSENT_PURPOSES, consentsApi, useLegalConsent, useMyConsents, type SelfConsentPurpose } from "@/lib/data/consents";
import { refreshPeople } from "@/lib/data/members";
import { openSettingsTab } from "@/lib/data/system";
import { LEGAL_PATHS } from "@/content/legal";
import { MfaCard, btnGhost, securityCard as card } from "@/components/security/MfaCard";
import { TrustedDevicesCard } from "@/components/security/TrustedDevicesCard";

/** Cài đặt → Bảo mật: xác thực 2 bước (ứng dụng Authenticator + mã khôi phục) và đổi mật khẩu. */
export default function SecurityTab() {
  const { openModal } = useApp();
  const { session } = useSession();
  const required = !!session?.mfa.required;
  const enabled = !!session?.mfa.enabled;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <div className="space-y-6 min-w-0">
        {required && !enabled && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-sm text-amber-900" role="alert">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="leading-relaxed"><b>Vai trò của bạn bắt buộc bật xác thực 2 bước.</b> Tài khoản có quyền cao là mục tiêu của kẻ xấu — hãy bật ngay bên dưới (mất khoảng 2 phút).</p>
          </div>
        )}

        <MfaCard />
        {enabled && <TrustedDevicesCard />}

        <div className={card}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center shrink-0"><Mail className="w-5 h-5" /></div>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-gray-900">Email đăng nhập</h3>
                <p className="text-xs text-gray-500 mt-0.5 break-all">Đang dùng: <b className="text-gray-800">{session?.user.email ?? "—"}</b></p>
                <p className="text-[11px] text-gray-400 mt-0.5">Khác với “Email liên hệ” ở Hồ sơ — email liên hệ không dùng để đăng nhập.</p>
              </div>
            </div>
            <button type="button" onClick={() => openModal("changeEmail")} className={btnGhost}>Đổi email đăng nhập</button>
          </div>
        </div>

        <div className={card}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center shrink-0"><Lock className="w-5 h-5" /></div>
              <div>
                <h3 className="text-base font-extrabold text-gray-900">Mật khẩu</h3>
                <p className="text-xs text-gray-500 mt-0.5">Đổi mật khẩu sẽ đăng xuất mọi thiết bị khác.</p>
              </div>
            </div>
            <button type="button" onClick={() => openModal("changePassword")} className={btnGhost}>Đổi mật khẩu</button>
          </div>
        </div>
      </div>
      <PrivacyCard />
    </div>
  );
}

/**
 * Các đồng ý về dữ liệu cá nhân mà CHÍNH thành viên tự bật/tắt (mặc định tắt cho tới khi bạn đồng ý) + phiên bản Điều khoản/Chính sách đã đồng ý.
 * Tắt "Lưu hồ sơ Công giáo" = XÓA hồ sơ Công giáo ⇒ hỏi lại trước.
 */
function PrivacyCard() {
  const { showToast } = useApp();
  const { session } = useSession();
  const { consents } = useMyConsents(!!session?.member);
  const { status: legal } = useLegalConsent(!!session?.member);
  const [busy, setBusy] = useState<SelfConsentPurpose | null>(null);
  const [confirmCatholic, setConfirmCatholic] = useState(false);
  if (!session?.member) return null;
  const toggle = async (purpose: SelfConsentPurpose, granted: boolean) => {
    setBusy(purpose);
    try {
      const r = await consentsApi.set(purpose, granted);
      if (r.deleted) {
        await refreshPeople();
        showToast("success", "Đã rút đồng ý và xóa hồ sơ Công giáo của bạn (Tên Thánh, giáo xứ, giáo phận, các Bí tích).");
      } else {
        showToast("success", granted ? "Đã ghi nhận đồng ý của bạn." : "Đã rút đồng ý.");
      }
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const onToggle = (purpose: SelfConsentPurpose, granted: boolean) => {
    if (purpose === "catholic_profile" && !granted) return setConfirmCatholic(true);
    void toggle(purpose, granted);
  };
  return (
    <div className={card}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center shrink-0"><ShieldCheck className="w-5 h-5" /></div>
        <div>
          <h3 className="text-base font-extrabold text-gray-900">Quyền riêng tư &amp; đồng ý</h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Dữ liệu nhạy cảm chỉ được dùng khi bạn đồng ý. Bạn có thể rút lại bất cứ lúc nào.</p>
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {SELF_CONSENT_PURPOSES.map((p) => (
          <CustomToggle key={p} checked={!!consents?.[p]} onChange={(v) => onToggle(p, v)} disabled={!consents || busy === p} label={CONSENT_INFO[p].title} description={CONSENT_INFO[p].text} />
        ))}
      </div>
      <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 space-y-1.5 text-[11px] text-gray-600 leading-relaxed">
        <p className="flex items-start gap-1.5">
          <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-px" aria-hidden />
          <span>
            {legal?.accepted && legal.acceptedAt ? (
              <>
                Đã đồng ý <a href={LEGAL_PATHS.terms} target="_blank" rel="noopener" className="font-semibold text-primary hover:underline">Điều khoản sử dụng</a> và{" "}
                <a href={LEGAL_PATHS.privacy} target="_blank" rel="noopener" className="font-semibold text-primary hover:underline">Chính sách bảo mật</a> phiên bản{" "}
                <b>{legal.version}</b> lúc {new Date(legal.acceptedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })}.
              </>
            ) : (
              <>
                Điều khoản sử dụng và Chính sách bảo mật (phiên bản {legal?.version ?? "hiện hành"}) là điều kiện dùng ứng dụng.
              </>
            )}
          </span>
        </p>
        <p>
          Tải dữ liệu của bạn, gửi yêu cầu xem / sửa / xóa dữ liệu:{" "}
          <button type="button" onClick={() => openSettingsTab("profile")} className="font-semibold text-primary hover:underline">
            Hồ sơ cá nhân → Quyền riêng tư &amp; dữ liệu của tôi
          </button>
          .
        </p>
      </div>
      <ConfirmDialog
        isOpen={confirmCatholic}
        onClose={() => setConfirmCatholic(false)}
        onConfirm={() => {
          setConfirmCatholic(false);
          void toggle("catholic_profile", false);
        }}
        variant="danger"
        title="Rút đồng ý và xóa hồ sơ Công giáo?"
        message={
          <>
            Hệ thống sẽ <b>xóa hẳn</b> Tên Thánh, giáo phận, giáo xứ, linh mục quản xứ và các Bí tích (ngày, nơi lãnh nhận) của bạn, đồng thời ngừng chia sẻ hồ sơ
            Công giáo với người quản lý. Dữ liệu đã xóa không khôi phục được.
          </>
        }
        confirmText="Rút đồng ý & xóa"
        cancelText="Giữ lại"
      />
    </div>
  );
}
