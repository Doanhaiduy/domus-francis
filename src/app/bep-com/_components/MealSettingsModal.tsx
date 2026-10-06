"use client";

import React, { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { CustomInput, CustomToggle } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { mealsApi, refreshMeals } from "@/lib/data/kitchen";
import { kitchenErrorText } from "@/lib/kitchen-format";
import type { MealsWeekDto } from "@/lib/types/kitchen";
import KitchenModal, { btnGhost, btnPrimary } from "./KitchenModal";

/** Giờ chốt suất trưa/tối (Ban Ẩm thực) và bật/tắt phân hệ (người có quyền Cài đặt hệ thống). */
export default function MealSettingsModal({ open, week, onClose }: { open: boolean; week: MealsWeekDto; onClose: () => void }) {
  const { showToast } = useApp();
  const [lunch, setLunch] = useState("");
  const [dinner, setDinner] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLunch(week.settings.lunchCutoff);
    setDinner(week.settings.dinnerCutoff);
    setEnabled(week.enabled);
    setError(null);
  }, [open, week]);

  const save = async () => {
    const re = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (week.canManage && (!re.test(lunch) || !re.test(dinner))) return setError("Giờ chốt phải có dạng HH:mm, ví dụ 09:00.");
    const body: Parameters<typeof mealsApi.updateSettings>[0] = {};
    if (week.canManage) {
      if (lunch !== week.settings.lunchCutoff) body.lunchCutoff = lunch;
      if (dinner !== week.settings.dinnerCutoff) body.dinnerCutoff = dinner;
    }
    if (week.canToggleFeature && enabled !== week.enabled) body.enabled = enabled;
    if (!Object.keys(body).length) return onClose();
    setBusy(true);
    setError(null);
    try {
      await mealsApi.updateSettings(body);
      await refreshMeals();
      showToast("success", "Đã lưu cấu hình Bếp & Cơm.");
      onClose();
    } catch (e) {
      setError(kitchenErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KitchenModal
      open={open}
      onClose={onClose}
      title="Cấu hình Bếp & Cơm"
      subtitle="Áp dụng cho các bữa từ ngày mai còn mở đăng ký"
      icon={<Settings2 className="w-5 h-5" />}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>Hủy</button>
          <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Đang lưu…" : "Lưu cấu hình"}</button>
        </>
      }
    >
      {week.canManage && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <CustomInput label="Giờ chốt suất trưa" value={lunch} onChange={(e) => setLunch(e.target.value)} placeholder="09:00" maxLength={5} />
            <CustomInput label="Giờ chốt suất tối" value={dinner} onChange={(e) => setDinner(e.target.value)} placeholder="15:00" maxLength={5} />
          </div>
        </>
      )}
      {week.canToggleFeature && (
        <CustomToggle
          checked={enabled}
          onChange={setEnabled}
          label="Phân hệ Bếp & Cơm đang hoạt động"
          description="Tắt = tạm hoãn: không ai đăng ký / sửa suất ăn được (dữ liệu vẫn giữ nguyên)"
        />
      )}
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}
    </KitchenModal>
  );
}
