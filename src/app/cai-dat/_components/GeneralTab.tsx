"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building, Wallet, ShieldCheck, Sliders, ChevronDown, Lock } from "lucide-react";
import { CustomInput, CustomTimePicker, CustomToggle } from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";
import type { RoleDto, SettingDto } from "@/lib/types/settings";
import type { SettingsDraft } from "./useSettingsDraft";
import {
  CardLockNote,
  FeastSetting,
  FieldHint,
  LockNoteShown,
  NumberSetting,
  TextSetting,
  TimeSetting,
  ToggleSetting,
  commonLock,
  formatSettingValue,
} from "./SettingFields";

export const ORG_KEYS = [
  "org.house_name",
  "org.motto",
  "org.address",
  "org.patron_feast",
  "org.contact_phone",
  "org.order_name",
  "org.chaplain_name",
];
export const FUND_KEYS = [
  "finance.dues_cycle_amount_vnd",
  "finance.dues_cycle_graduated_amount_vnd",
  "finance.dues_cycle_months",
  "finance.dues_cycle_start_month",
  "finance.dues_cycle_due_day",
  "finance.utility_due_day",
  "meal.price_per_serving_vnd",
  "liturgy.night_prayer_time",
  "meal.lunch_cutoff_time",
  "meal.dinner_cutoff_time",
];
export const FINANCE_CONTROL_KEYS = [
  "finance.expense.dual_approval_min_vnd",
  "finance.expense.treasurer_solo_approve_max_vnd",
  "finance.expense.receipt_required_min_vnd",
  "finance.reminder.days_before_due",
  "finance.reminder.overdue_every_days",
  "finance.period.close_requires_reconciliation",
  "finance.transparency.show_debtor_names",
];
/** Khóa tài chính cũ / có màn hình riêng — không hiện ở tab này:
 *  quỹ tháng (đã thay bằng quỹ định kỳ), tài khoản nhận quỹ (Thủ quỹ sửa ở trang Thu chi → thẻ "Tài khoản nhận quỹ", có mã QR). */
const HIDDEN_FINANCE_KEYS = ["finance.monthly_dues_vnd", "finance.dues_due_day", "finance.dues_bank_account", "finance.receiving_account"];
const TELEGRAM_PREFIX = "integration.telegram.";
const EVENTS_KEY = "integration.telegram.group_events";

/** Khóa thuộc tab Cấu hình chung (mọi khóa trừ nhóm Telegram). */
export const isGeneralKey = (k: string) => !k.startsWith(TELEGRAM_PREFIX);

const GROUP_LABEL: Record<string, string> = {
  duty: "Trực nhật & Vệ sinh",
  event: "Sự kiện & Điểm danh",
  qr: "Điểm danh bằng mã QR",
  facility: "Hậu cần — thời hạn xử lý sự cố (SLA)",
  laundry: "Đặt lịch giặt",
  feature: "Bật / tắt phân hệ",
  upload: "Lưu trữ tệp tải lên",
  auth: "Bảo mật đăng nhập",
  ai: "Trợ lý AI",
  privacy: "Quyền riêng tư & lưu trữ dữ liệu",
  finance: "Tài chính khác",
  meal: "Bếp & Cơm",
  liturgy: "Phụng vụ",
  org: "Thông tin tổ chức khác",
};
const GROUP_ORDER = ["feature", "duty", "event", "qr", "facility", "laundry", "upload", "auth", "privacy", "ai", "finance", "meal", "liturgy", "org"];

const unitOf = (k: string): string | undefined => {
  if (k.endsWith("_vnd")) return "VNĐ";
  if (k.endsWith("_minutes") || k.endsWith("_minutes_before")) return "phút";
  if (k.endsWith("_hours") || k.startsWith("facility.sla_hours.")) return "giờ";
  if (k.endsWith("_days") || k.endsWith("_days_ahead") || k.endsWith("days_before_due")) return "ngày";
  if (k.endsWith("_seconds")) return "giây";
  if (k.endsWith("_bytes")) return "byte";
  if (k.endsWith("_m")) return "m";
  if (k.endsWith("_per_week")) return "lượt";
  return undefined;
};
const cleanDesc = (d: string) => d.replace(/\[(GIẢ ĐỊNH|ĐỀ XUẤT|đề xuất)\]\s*/gi, "").trim();
const mb = (n: unknown) => (typeof n === "number" ? `≈ ${(n / 1048576).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB` : "");

interface Props {
  draft: SettingsDraft;
  roles: RoleDto[];
}

export default function GeneralTab({ draft, roles }: Props) {
  const orgUpdated = useMemo(() => {
    const rows = ORG_KEYS.map((k) => draft.meta(k)).filter((m): m is SettingDto => !!m);
    const last = rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    return last;
  }, [draft]);

  const events = (draft.value<Record<string, boolean>>(EVENTS_KEY) ?? {}) as Record<string, boolean>;
  const groupEnabled = draft.value<boolean>("integration.telegram.group_enabled") === true;
  const financeVisible = FINANCE_CONTROL_KEYS.filter((k) => draft.meta(k));
  const shown = (k: string) => !!draft.meta(k);
  // Cả trang chỉ đọc ⇒ băng đầu trang đã giải thích; một thẻ khóa cùng một lý do ⇒ nêu một lần ở đầu thẻ
  const readOnly = !draft.anyWritable;
  const orgLock = commonLock(draft, ORG_KEYS);
  const fundLock = commonLock(draft, FUND_KEYS);
  const finLock = commonLock(draft, FINANCE_CONTROL_KEYS);

  const used = new Set([...ORG_KEYS, ...FUND_KEYS, ...FINANCE_CONTROL_KEYS, ...HIDDEN_FINANCE_KEYS]);
  // Xem trước các kỳ quỹ trong năm theo số tháng mỗi kỳ + tháng bắt đầu đang nhập (vd. T1–T6, T7–T12)
  const cycleMonths = Number(draft.value<number>("finance.dues_cycle_months")) || 6;
  const cycleStart = Number(draft.value<number>("finance.dues_cycle_start_month")) || 1;
  const cycleAmount = Number(draft.value<number>("finance.dues_cycle_amount_vnd")) || 0;
  const cyclePreview =
    cycleMonths >= 1 && cycleMonths <= 12 && cycleStart >= 1 && cycleStart <= 12
      ? Array.from({ length: Math.min(4, Math.ceil(12 / cycleMonths)) }, (_, i) => {
          const a = ((cycleStart - 1 + i * cycleMonths) % 12) + 1;
          const b = ((cycleStart - 1 + i * cycleMonths + cycleMonths - 1) % 12) + 1;
          return a === b ? `T${a}` : `T${a}–T${b}`;
        }).join(", ")
      : null;
  const advanced = useMemo(() => {
    const groups = new Map<string, SettingDto[]>();
    for (const m of draft.byKey.values()) {
      if (used.has(m.key) || !isGeneralKey(m.key)) continue;
      const g = m.key.split(".")[0];
      groups.set(g, [...(groups.get(g) ?? []), m]);
    }
    return [...groups.entries()].sort((a, b) => (GROUP_ORDER.indexOf(a[0]) + 1 || 99) - (GROUP_ORDER.indexOf(b[0]) + 1 || 99));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.byKey]);
  const advancedCount = advanced.reduce((n, [, l]) => n + l.length, 0);
  const advancedDirty = advanced.some(([, l]) => l.some((m) => draft.isDirty(m.key)));
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <LockNoteShown.Provider value={readOnly}>
      <div className="flex flex-col gap-6 animate-in fade-in duration-200">
        {/* Thông tin nhà */}
        <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Thông tin cộng đoàn lưu xá</h2>
                <p className="text-xs text-gray-500">Thông tin nhận diện chính thức hiển thị cho anh em và phụ huynh</p>
              </div>
            </div>
            {orgUpdated && (
              <span className="hidden sm:inline text-[11px] text-purple-700 font-semibold bg-purple-50 px-2.5 py-1 rounded-xl text-right">
                Cập nhật {new Date(orgUpdated.updatedAt).toLocaleDateString("vi-VN")}
                {orgUpdated.updatedByName ? ` · ${orgUpdated.updatedByName}` : ""}
              </span>
            )}
          </div>

          {!readOnly && <CardLockNote reason={orgLock} />}
          <LockNoteShown.Provider value={readOnly || !!orgLock}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextSetting draft={draft} k="org.house_name" label="Tên lưu xá chính thức" placeholder="Nhập tên lưu xá" />
              <TextSetting draft={draft} k="org.motto" label="Khẩu hiệu / Châm ngôn cộng đoàn" placeholder="VD: Pax et Bonum" />
              <TextSetting
                draft={draft}
                k="org.address"
                label="Địa chỉ cộng đoàn lưu xá"
                placeholder="Địa chỉ trụ sở lưu xá"
                className="sm:col-span-2"
              />
              <FeastSetting draft={draft} k="org.patron_feast" label="Ngày Đại Lễ Bổn Mạng (DD/MM)" />
              <TextSetting
                draft={draft}
                k="org.contact_phone"
                label="Hotline công khai của lưu xá"
                placeholder="VD: 0903 112 451 (không dùng SĐT cá nhân)"
              />
              <TextSetting
                draft={draft}
                k="org.order_name"
                label="Tỉnh Dòng (in trên sơ yếu lý lịch)"
                placeholder="VD: Tỉnh Dòng Anh Em Hèn Mọn Việt Nam (OFM)"
              />
              <TextSetting
                draft={draft}
                k="org.chaplain_name"
                label="Cha linh hướng (ký trên sơ yếu lý lịch)"
                placeholder="VD: Lm. Giuse Nguyễn Văn A, OFM"
              />
            </div>
          </LockNoteShown.Provider>
        </div>

        {/* Quản lý quỹ & Định mức ăn uống */}
        <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
          <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-secondary flex items-center justify-center font-bold">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Quản lý quỹ &amp; Định mức ăn uống</h2>
              <p className="text-xs text-gray-500">Thiết lập tài chính cố định, giá suất ăn và khung giờ khóa điểm danh cơm</p>
            </div>
          </div>

          {!readOnly && <CardLockNote reason={fundLock} />}
          <LockNoteShown.Provider value={readOnly || !!fundLock}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberSetting draft={draft} k="finance.dues_cycle_amount_vnd" label="Mức quỹ mỗi kỳ — Sinh viên đang học (VNĐ / người)" />
              <NumberSetting draft={draft} k="finance.dues_cycle_graduated_amount_vnd" label="Mức quỹ mỗi kỳ — Đã tốt nghiệp / ra trường (VNĐ / người)" />
              <NumberSetting draft={draft} k="finance.dues_cycle_months" label="Số tháng mỗi kỳ quỹ" suffix="tháng" />
              <NumberSetting draft={draft} k="finance.dues_cycle_start_month" label="Kỳ quỹ đầu tiên trong năm bắt đầu từ tháng" suffix="tháng" />
              <NumberSetting draft={draft} k="finance.dues_cycle_due_day" label="Hạn nộp quỹ kỳ (ngày … của tháng đầu kỳ)" suffix="ngày" />
              <NumberSetting draft={draft} k="finance.utility_due_day" label="Hạn nộp tiền điện nước (ngày … của tháng sau)" suffix="ngày" />
              {cyclePreview && draft.meta("finance.dues_cycle_months") && (
                <p className="sm:col-span-2 -mt-1 text-[11px] text-gray-500">
                  Các kỳ quỹ trong năm: <b className="text-gray-800">{cyclePreview}</b>
                  {cycleAmount > 0 && (
                    <>
                      {" "}
                      · Sinh viên: {cycleAmount.toLocaleString("vi-VN")}đ / kỳ (≈ {Math.round((cycleAmount * 12) / cycleMonths).toLocaleString("vi-VN")}đ/năm)
                      {Number(draft.value<number>("finance.dues_cycle_graduated_amount_vnd")) > 0 && (
                        <span> · Đã ra trường: {Number(draft.value<number>("finance.dues_cycle_graduated_amount_vnd")).toLocaleString("vi-VN")}đ / kỳ</span>
                      )}
                    </>
                  )}
                  . Tiền điện nước: Thủ quỹ nhập tổng hóa đơn hằng tháng ở trang Thu chi, hệ thống chia đều cho người đang ở.
                </p>
              )}
              <NumberSetting draft={draft} k="meal.price_per_serving_vnd" label="Tiền suất cơm trưa / tối tham chiếu (VNĐ / suất)" />
              <TimeSetting draft={draft} k="liturgy.night_prayer_time" label="Giờ cử hành Kinh Tối chung hàng ngày" />
              <TimeSetting draft={draft} k="meal.lunch_cutoff_time" label="Giờ chốt điểm danh cơm trưa" />
              <TimeSetting draft={draft} k="meal.dinner_cutoff_time" label="Giờ chốt điểm danh cơm tối" />
            </div>
          </LockNoteShown.Provider>

          <p className="text-[11px] text-gray-500 -mt-2">
            Tài khoản nhận quỹ (số tài khoản + mã QR chuyển khoản) do Thủ quỹ cập nhật ở trang{" "}
            <Link href="/thu-chi" className="font-bold text-primary hover:underline">
              Thu chi
            </Link>{" "}
            → thẻ “Tài khoản nhận quỹ”.
          </p>

          {shown(EVENTS_KEY) && (
            <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-100">
              <ToggleSetting
                draft={draft}
                k={EVENTS_KEY}
                checked={events.dues_reminder === true}
                onChange={(x) => draft.set(EVENTS_KEY, { ...events, dues_reminder: x })}
                label="Tự động gửi thông báo nhắc đóng quỹ qua Telegram"
                description={`Bot gửi kèm thông tin tài khoản nhận quỹ và hạn nộp (quỹ kỳ: ngày ${draft.value<number>("finance.dues_cycle_due_day") ?? 15} tháng đầu kỳ; điện nước: ngày ${draft.value<number>("finance.utility_due_day") ?? 10} tháng sau)`}
              />
              {draft.meta(EVENTS_KEY) && !groupEnabled && (
                <p className="mt-1 text-[10.5px] text-amber-700">
                  Lưu ý: “Gửi tin tự động vào nhóm” đang tắt ở tab Tích hợp Telegram, và hệ thống đang chạy chế độ local (không gửi ra ngoài).
                </p>
              )}
            </div>
          )}
        </div>

        {/* Ngưỡng kiểm soát chi — chỉ hiện khi người dùng được xem cấu hình tài chính (Trưởng nhà, Thủ quỹ, Admin) */}
        {financeVisible.length > 0 && (
          <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Ngưỡng kiểm soát chi &amp; Nhắc quỹ</h2>
                <p className="text-xs text-gray-500">
                  Hai chữ ký, hóa đơn bắt buộc, hạn mức Thủ quỹ tự duyệt — hạn mức tự duyệt phải nhỏ hơn ngưỡng hai chữ ký
                </p>
              </div>
            </div>
            {!readOnly && <CardLockNote reason={finLock} />}
            <LockNoteShown.Provider value={readOnly || !!finLock}>
              {FINANCE_CONTROL_KEYS.slice(0, 5).some(shown) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {shown("finance.expense.dual_approval_min_vnd") && (
                    <NumberSetting draft={draft} k="finance.expense.dual_approval_min_vnd" label="Phiếu chi từ mức này cần 2 chữ ký" />
                  )}
                  {shown("finance.expense.treasurer_solo_approve_max_vnd") && (
                    <NumberSetting draft={draft} k="finance.expense.treasurer_solo_approve_max_vnd" label="Thủ quỹ được tự duyệt phiếu chi đến mức" />
                  )}
                  {shown("finance.expense.receipt_required_min_vnd") && (
                    <NumberSetting draft={draft} k="finance.expense.receipt_required_min_vnd" label="Bắt buộc ảnh hóa đơn từ mức" />
                  )}
                  {shown("finance.reminder.days_before_due") && (
                    <NumberSetting draft={draft} k="finance.reminder.days_before_due" label="Nhắc đóng quỹ trước hạn" suffix="ngày" />
                  )}
                  {shown("finance.reminder.overdue_every_days") && (
                    <NumberSetting draft={draft} k="finance.reminder.overdue_every_days" label="Chu kỳ nhắc khi quá hạn" suffix="ngày" />
                  )}
                </div>
              )}
              <div className="p-4 rounded-2xl bg-surface-container-low/60 flex flex-col gap-2">
                {shown("finance.period.close_requires_reconciliation") && (
                  <ToggleSetting
                    draft={draft}
                    k="finance.period.close_requires_reconciliation"
                    label="Bắt buộc đối soát sao kê trước khi chốt sổ tháng"
                    description="Áp dụng cho túi quỹ ngân hàng — Thủ quỹ phải đối soát xong mới đề nghị chốt sổ"
                  />
                )}
                <ToggleSetting
                  draft={draft}
                  k="finance.transparency.show_debtor_names"
                  label="Công khai danh sách người chưa đóng quỹ cho mọi thành viên"
                  description="Mặc định chỉ Thủ quỹ / Ban điều hành thấy tên; thành viên chỉ thấy số liệu tổng hợp"
                />
              </div>
            </LockNoteShown.Provider>
          </div>
        )}

        {/* Tham số vận hành nâng cao */}
        {advancedCount > 0 && (
          <div className="bg-white rounded-3xl border border-purple-50 shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="w-full flex items-center justify-between gap-3 p-6 text-left hover:bg-purple-50/30 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    Tham số vận hành nâng cao
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700">{advancedCount}</span>
                    {advancedDirty && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700">Có thay đổi</span>
                    )}
                  </h2>
                  <p className="text-xs text-gray-500">Khung giờ check-in trực nhật, điểm danh, SLA sự cố, lịch giặt, cờ tính năng, bảo mật…</p>
                </div>
              </div>
              <ChevronDown className={cn("w-5 h-5 text-gray-400 transition-transform", showAdvanced && "rotate-180 text-primary")} />
            </button>

            {showAdvanced && (
              <div className="px-6 pb-6 flex flex-col gap-5">
                {advanced.map(([g, list]) => (
                  <div key={g} className="flex flex-col gap-2">
                    <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-400">{GROUP_LABEL[g] ?? g}</h3>
                    <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100">
                      {list.map((m) => (
                        <AdvancedRow key={m.key} draft={draft} m={m} roles={roles} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </LockNoteShown.Provider>
  );
}

function AdvancedRow({ draft, m, roles }: { draft: SettingsDraft; m: SettingDto; roles: RoleDto[] }) {
  const k = m.key;
  const v = draft.value(k);
  const locked = !m.canWrite;
  const err = draft.errorOf(k);
  let control: React.ReactNode;

  if (m.valueType === "boolean") {
    control = (
      <div className={cn(locked && "pointer-events-none opacity-60")}>
        <CustomToggle checked={v === true} onChange={(x) => draft.set(k, x)} />
      </div>
    );
  } else if (m.valueType === "integer" || m.valueType === "vnd" || m.valueType === "number") {
    control = (
      <CustomInput
        type="number"
        value={v === undefined || v === null ? "" : String(v)}
        min={m.min ?? undefined}
        max={m.max ?? undefined}
        onChange={(e) => draft.set(k, e.target.value === "" ? "" : Number(e.target.value))}
        disabled={locked}
        rightSuffix={unitOf(k)}
        className={locked ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""}
      />
    );
  } else if (m.valueType === "time") {
    control = (
      <div className={cn(locked && "pointer-events-none opacity-60")}>
        <CustomTimePicker value={typeof v === "string" ? v : ""} onChange={(t) => draft.set(k, t.slice(0, 5))} />
      </div>
    );
  } else if (m.valueType === "string") {
    control = (
      <CustomInput
        value={typeof v === "string" ? v : ""}
        onChange={(e) => draft.set(k, e.target.value)}
        disabled={locked}
        className={locked ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""}
      />
    );
  } else if (k === "laundry.slots") {
    control = <SlotsEditor value={v} onChange={(x) => draft.set(k, x)} disabled={locked} />;
  } else if (k === "auth.mfa_required_roles" && Array.isArray(v)) {
    const sel = v as string[];
    control = (
      <div className={cn("flex flex-wrap gap-1.5", locked && "pointer-events-none opacity-60")}>
        {roles.map((r) => {
          const on = sel.includes(r.code);
          return (
            <button
              key={r.code}
              type="button"
              onClick={() => draft.set(k, on ? sel.filter((x) => x !== r.code) : [...sel, r.code])}
              className={cn(
                "px-2 py-1 rounded-lg text-[10px] font-bold border transition",
                on ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-purple-300",
              )}
            >
              {r.name}
            </button>
          );
        })}
      </div>
    );
  } else {
    control = <code className="text-[10px] text-gray-500 break-all">{formatSettingValue(m, v)}</code>;
  }

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-[1fr_260px] gap-2 md:gap-4 items-center px-4 py-3", draft.isDirty(k) && "bg-purple-50/40")}>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-800 leading-snug">{cleanDesc(m.description)}</p>
        <p className="text-[10px] font-mono text-gray-400 mt-0.5 flex items-center gap-1">
          {locked && <Lock className="w-2.5 h-2.5 text-amber-600" />}
          {k}
          {k.endsWith("_bytes") && <span className="font-sans">· {mb(v)}</span>}
        </p>
      </div>
      <div>
        {control}
        {err && <p className="mt-1 text-[11px] text-rose-500">{err}</p>}
        <FieldHint draft={draft} k={k} />
      </div>
    </div>
  );
}

/** laundry.slots: [["06:00","08:00"], …] ⇄ "06:00-08:00, 08:00-10:00" */
function SlotsEditor({ value, onChange, disabled }: { value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  const toText = (v: unknown) => (Array.isArray(v) ? (v as string[][]).map((s) => `${s[0]}-${s[1]}`).join(", ") : "");
  const [text, setText] = useState(toText(value));
  useEffect(() => {
    setText((t) => (toText(parse(t)) === toText(value) ? t : toText(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  function parse(t: string) {
    return t
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const m = /^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/.exec(s);
        return m ? [m[1].padStart(5, "0"), m[2].padStart(5, "0")] : [s, ""];
      });
  }
  return (
    <CustomInput
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parse(e.target.value));
      }}
      disabled={disabled}
      placeholder="06:00-08:00, 08:00-10:00"
      className={disabled ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""}
    />
  );
}
