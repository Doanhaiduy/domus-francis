"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChefHat, Plus, Trash2 } from "lucide-react";
import { CustomInput, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { mealsApi, refreshMeals } from "@/lib/data/kitchen";
import { dmy, kitchenErrorText, vnTime } from "@/lib/kitchen-format";
import type { CookRole, MealDayDto, MealType, MenuStatus } from "@/lib/types/kitchen";
import KitchenModal, { btnGhost, btnPrimary } from "./KitchenModal";

interface Props {
  day: MealDayDto | null;
  defaultPrice: number;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: MenuStatus; label: string }[] = [
  { value: "open", label: "Mở đăng ký" },
  { value: "closed", label: "Đã chốt sổ (khóa đăng ký)" },
  { value: "served", label: "Đã phục vụ" },
  { value: "cancelled", label: "Không nấu bữa này" },
  { value: "draft", label: "Nháp (chưa mở)" },
];
const ROLE_OPTIONS: { value: CookRole; label: string }[] = [
  { value: "lead", label: "Chính" },
  { value: "assistant", label: "Phụ" },
  { value: "shopper", label: "Đi chợ" },
];

interface MealForm {
  title: string;
  dishes: string;
  status: MenuStatus;
  cost: string;
  cutoff: string;
}

/** Ban Ẩm thực lập / sửa thực đơn một ngày: món trưa, món tối, trạng thái, giá suất, giờ chốt riêng và người trực bếp. */
export default function MenuEditModal({ day, defaultPrice, onClose }: Props) {
  const { members, showToast } = useApp();
  const [cooks, setCooks] = useState<{ memberId: string; role: CookRole }[]>([]);
  const [form, setForm] = useState<Record<MealType, MealForm>>({
    lunch: { title: "", dishes: "", status: "open", cost: "", cutoff: "" },
    dinner: { title: "", dishes: "", status: "open", cost: "", cutoff: "" },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!day) return;
    const seen = new Map<string, CookRole>();
    for (const c of [...day.lunch.cooks, ...day.dinner.cooks]) if (!seen.has(c.memberId)) seen.set(c.memberId, c.role);
    setCooks([...seen.entries()].map(([memberId, role]) => ({ memberId, role })));
    const f = (m: MealType): MealForm => {
      const s = day[m];
      return {
        title: s.title ?? "",
        dishes: s.dishes.join("\n"),
        status: s.status ?? "open",
        cost: s.menuId && s.costPerServing !== defaultPrice ? String(s.costPerServing) : "",
        cutoff: "",
      };
    };
    setForm({ lunch: f("lunch"), dinner: f("dinner") });
    setError(null);
  }, [day, defaultPrice]);

  const memberOptions = useMemo(
    () => members.filter((m) => m.status === "active" || m.status === "on_leave").map((m) => ({ value: m.id, label: m.name, subLabel: m.fullName })),
    [members]
  );

  if (!day) return null;

  const setMeal = (m: MealType, patch: Partial<MealForm>) => setForm((f) => ({ ...f, [m]: { ...f[m], ...patch } }));

  const save = async () => {
    setError(null);
    for (const m of ["lunch", "dinner"] as MealType[]) {
      if (form[m].cutoff && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form[m].cutoff)) return setError("Giờ chốt phải có dạng HH:mm, ví dụ 09:30.");
      if (form[m].cost && !(Number(form[m].cost) >= 0)) return setError("Giá suất phải là số tiền hợp lệ.");
    }
    const meal = (m: MealType) => ({
      title: form[m].title.trim() || null,
      dishes: form[m].dishes.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      status: form[m].status,
      costPerServing: form[m].cost ? Math.round(Number(form[m].cost)) : null,
      cutoffTime: form[m].cutoff || null,
    });
    setBusy(true);
    try {
      await mealsApi.saveMenuDay({ date: day.date, lunch: meal("lunch"), dinner: meal("dinner"), cooks: cooks.filter((c) => c.memberId) });
      await refreshMeals();
      showToast("success", `Đã lưu thực đơn ${day.weekdayLong} ${dmy(day.date)}.`);
      onClose();
    } catch (e) {
      setError(kitchenErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const mealBlock = (m: MealType) => {
    const s = day[m];
    const f = form[m];
    const isLunch = m === "lunch";
    return (
      <div className={`p-4 rounded-2xl border ${isLunch ? "bg-surface-container-low/60 border-purple-50" : "bg-emerald-50/40 border-emerald-50"} flex flex-col gap-3`}>
        <div className={`text-xs font-bold ${isLunch ? "text-purple-900" : "text-emerald-900"}`}>{isLunch ? "☀️ Bữa Trưa" : "🌙 Bữa Tối"}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CustomInput label="Tiêu đề (tùy chọn)" placeholder="Ví dụ: Tiệc Bổn Mạng" value={f.title} onChange={(e) => setMeal(m, { title: e.target.value })} maxLength={150} />
          <CustomSelect label="Trạng thái" value={f.status} onChange={(v) => setMeal(m, { status: v })} options={STATUS_OPTIONS} />
        </div>
        <CustomTextarea
          label="Các món (mỗi dòng một món)"
          rows={4}
          placeholder={"Thịt kho trứng cút\nCanh bí đao sườn\nRau muống xào tỏi"}
          value={f.dishes}
          onChange={(e) => setMeal(m, { dishes: e.target.value })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CustomInput
            label="Giá một suất (để trống = giá chung)"
            type="number"
            min={0}
            step={1000}
            placeholder={String(defaultPrice)}
            rightSuffix="đ"
            value={f.cost}
            onChange={(e) => setMeal(m, { cost: e.target.value })}
          />
          <CustomInput
            label={`Đổi giờ chốt (hiện ${vnTime(s.cutoffAt)})`}
            placeholder="HH:mm"
            value={f.cutoff}
            onChange={(e) => setMeal(m, { cutoff: e.target.value })}
            maxLength={5}
          />
        </div>
      </div>
    );
  };

  return (
    <KitchenModal
      open={!!day}
      onClose={onClose}
      title={`Thực đơn ${day.weekdayLong} ${dmy(day.date)}`}
      subtitle="Món ăn, trạng thái đăng ký và phân công trực bếp trong ngày"
      icon={<ChefHat className="w-5 h-5" />}
      maxWidth="max-w-2xl"
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>Hủy</button>
          <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Đang lưu…" : "Lưu thực đơn"}</button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-700">👨‍🍳 Người trực bếp</span>
          <button
            type="button"
            onClick={() => setCooks((c) => [...c, { memberId: "", role: c.length ? "assistant" : "lead" }])}
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm người trực
          </button>
        </div>
        {cooks.length === 0 && <p className="text-[11px] text-gray-400">Chưa phân công ai trực bếp ngày này.</p>}
        {cooks.map((c, i) => (
          <div key={i} className="flex items-end gap-2">
            <CustomSelect
              className="flex-1"
              value={c.memberId}
              placeholder="Chọn thành viên…"
              onChange={(v) => setCooks((cs) => cs.map((x, j) => (j === i ? { ...x, memberId: v } : x)))}
              options={memberOptions}
            />
            <CustomSelect
              className="w-32"
              value={c.role}
              onChange={(v) => setCooks((cs) => cs.map((x, j) => (j === i ? { ...x, role: v } : x)))}
              options={ROLE_OPTIONS}
            />
            <button
              type="button"
              onClick={() => setCooks((cs) => cs.filter((_, j) => j !== i))}
              className="p-2.5 rounded-xl text-rose-500 hover:bg-rose-50"
              aria-label="Bỏ người trực"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      {mealBlock("lunch")}
      {mealBlock("dinner")}
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}
    </KitchenModal>
  );
}
