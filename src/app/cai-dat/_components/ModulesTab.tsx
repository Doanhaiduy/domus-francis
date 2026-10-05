"use client";

// Ẩn/hiện phân hệ: Admin tạm khóa phân hệ không dùng tới — thanh bên làm mờ + nhãn "Bảo trì", mở trang thấy lời nhắn.
import React, { useEffect, useMemo, useState } from "react";
import { LayoutPanelLeft, Wrench, Save, Undo2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { modulesApi, useModules } from "@/lib/data/modules";
import { DEFAULT_MAINTENANCE_MESSAGE, TOGGLEABLE_MODULES, type DisabledModules } from "@/lib/modules";
import { CustomToggle } from "@/components/ui/FormControls";
import { sameSettingValue } from "@/lib/types/settings";

export default function ModulesTab() {
  const { showToast } = useApp();
  const { disabled, canManage } = useModules();
  const [draft, setDraft] = useState<DisabledModules>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(disabled), [JSON.stringify(disabled)]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => !sameSettingValue(draft, disabled), [draft, disabled]);
  const hiddenCount = Object.keys(draft).length;

  const toggle = (href: string, on: boolean) =>
    setDraft((d) => {
      const n = { ...d };
      if (on) delete n[href];
      else n[href] = { message: disabled[href]?.message ?? "" };
      return n;
    });
  const setMessage = (href: string, message: string) => setDraft((d) => ({ ...d, [href]: { ...d[href], message } }));

  const save = async () => {
    setSaving(true);
    try {
      await modulesApi.save(draft);
      showToast("success", hiddenCount ? `Đã lưu — ${hiddenCount} phân hệ đang bảo trì.` : "Đã lưu — mọi phân hệ đều hoạt động.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center shrink-0">
              <LayoutPanelLeft className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 text-sm">Phân hệ hiển thị</h3>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Tắt phân hệ chưa dùng tới: mục đó bị làm mờ trên thanh bên (nhãn “Bảo trì”), thành viên mở vào sẽ thấy lời nhắn bên dưới.
                Dữ liệu không bị xóa — bật lại là dùng tiếp. Tổng quan, Cài đặt và Hướng dẫn luôn mở.
              </p>
            </div>
          </div>
        </div>

        {!canManage && (
          <p className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 text-[11px] text-amber-800">
            🔒 Chỉ Admin/Trưởng nhà (quyền sửa cấu hình hệ thống) mới thay đổi được mục này.
          </p>
        )}

        <div className="flex flex-col divide-y divide-gray-100">
          {TOGGLEABLE_MODULES.map((m) => {
            const off = !!draft[m.href];
            return (
              <div key={m.href} className="py-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-xs text-gray-900">{m.label}</span>
                      {off ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">
                          <Wrench className="w-3 h-3" /> Bảo trì
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">Đang hoạt động</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500">{m.description}</p>
                  </div>
                  <div className="shrink-0">
                    <CustomToggle checked={!off} onChange={(v) => toggle(m.href, v)} disabled={!canManage || saving} />
                  </div>
                </div>
                {off && (
                  <input
                    value={draft[m.href]?.message ?? ""}
                    onChange={(e) => setMessage(m.href, e.target.value)}
                    disabled={!canManage}
                    maxLength={300}
                    placeholder={DEFAULT_MAINTENANCE_MESSAGE}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-primary disabled:bg-gray-50"
                  />
                )}
              </div>
            );
          })}
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-100">
            {dirty && (
              <button onClick={() => setDraft(disabled)} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
                <Undo2 className="w-3.5 h-3.5" /> Hủy thay đổi
              </button>
            )}
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
