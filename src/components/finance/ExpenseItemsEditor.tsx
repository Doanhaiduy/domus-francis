"use client";

// Bảng nhập CHI TIẾT TỪNG MÓN của phiếu chi (đi chợ nhiều món): tên món · số lượng · đơn vị · đơn giá → thành tiền, có tổng.
// Mỗi món là một thẻ (tên ở trên; số lượng · đơn vị · đơn giá và thành tiền ở dưới) — hộp thoại chỉ rộng ~450px nên không dùng bảng nhiều cột. Mỗi ô tự mang nhãn riêng.
// Enter ở ô đơn giá của dòng cuối thêm món mới (không gửi biểu mẫu).
import React, { useEffect, useRef } from "react";
import { Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { CustomInput } from "@/components/ui/FormControls";
import { formatVND } from "@/lib/utils";
import type { ExpenseItemDto } from "@/lib/types/finance";

export interface ItemDraft {
  key: string;
  name: string;
  /** Số lượng gõ tự do ("1,5" hoặc "1.5") */
  quantity: string;
  unit: string;
  /** Đơn giá: chỉ chữ số */
  price: string;
}

let seq = 0;
// Dòng cần focus sau khi thêm. Để ở mức module vì bảng "trống" và bảng "có món" là hai vị trí khác nhau trong biểu mẫu (React gắn lại thành phần).
let pendingFocus: string | null = null;
export const newItemDraft = (over: Partial<ItemDraft> = {}): ItemDraft => ({ key: `it${Date.now().toString(36)}${seq++}`, name: "", quantity: "1", unit: "", price: "", ...over });

export const draftsFromItems = (items: ExpenseItemDto[]): ItemDraft[] =>
  items.map((i) => newItemDraft({ name: i.name, quantity: String(i.quantity).replace(".", ","), unit: i.unit ?? "", price: String(i.unitPriceVnd) }));

/** "1,5" / "1.5" → 1.5; sai → null */
export function parseQuantity(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t || !/^\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const parsePrice = (s: string) => Number(s.replace(/\D/g, "")) || 0;

/** Thành tiền một món (nửa lên, tính bằng số nguyên để khớp cách làm tròn của CSDL). */
export function draftAmount(d: ItemDraft): number {
  const q = parseQuantity(d.quantity);
  return q === null ? 0 : Math.round((Math.round(q * 1000) * parsePrice(d.price)) / 1000);
}
/** Dòng trống hoàn toàn (không tên, không giá) coi như chưa nhập — bỏ qua khi lưu */
export const isBlankDraft = (d: ItemDraft) => !d.name.trim() && !parsePrice(d.price);
export const draftsTotal = (ds: ItemDraft[]) => ds.filter((d) => !isBlankDraft(d)).reduce((s, d) => s + draftAmount(d), 0);

/** Kiểm tra từng dòng; trả thông báo lỗi đầu tiên hoặc null. */
export function validateDrafts(ds: ItemDraft[]): string | null {
  const rows = ds.filter((d) => !isBlankDraft(d));
  for (const [i, d] of rows.entries()) {
    const n = `Món ${i + 1}`;
    if (!d.name.trim()) return `${n}: nhập tên món.`;
    const q = parseQuantity(d.quantity);
    if (q === null || q <= 0) return `${n} (${d.name.trim()}): số lượng phải lớn hơn 0.`;
    if (Math.abs(q * 1000 - Math.round(q * 1000)) > 1e-6) return `${n} (${d.name.trim()}): số lượng tối đa 3 chữ số thập phân.`;
    if (parsePrice(d.price) <= 0) return `${n} (${d.name.trim()}): nhập đơn giá lớn hơn 0.`;
  }
  if (rows.length > 100) return "Tối đa 100 món mỗi phiếu.";
  return null;
}

/** Dữ liệu gửi máy chủ (bỏ dòng trống) */
export const draftsToPayload = (ds: ItemDraft[]) =>
  ds
    .filter((d) => !isBlankDraft(d))
    .map((d) => ({ name: d.name.trim(), quantity: parseQuantity(d.quantity) ?? 0, unit: d.unit.trim() || null, unitPriceVnd: parsePrice(d.price) }));

const UNITS = ["kg", "g", "lít", "chai", "hộp", "gói", "túi", "bó", "cái", "quả", "con", "miếng", "bao", "thùng", "lốc", "vỉ", "cuộn", "cây", "bộ"];

interface Props {
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
  disabled?: boolean;
}

const label = "block text-[10px] font-bold text-gray-500 mb-1";
// 6 cột trên điện thoại (3 ô × 2 cột; thành tiền nằm dòng riêng), 8 cột từ sm: (4 ô × 2 cột trên một hàng)
const GRID = "grid grid-cols-6 gap-x-2 gap-y-2 sm:grid-cols-8";

export function ExpenseItemsEditor({ items, onChange, disabled }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendingFocus) return;
    const el = root.current?.querySelector<HTMLInputElement>(`[data-item="${pendingFocus}"][data-field="name"]`);
    if (el) {
      pendingFocus = null;
      el.focus();
    }
  }, [items.length]);

  const set = (key: string, patch: Partial<ItemDraft>) => onChange(items.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const add = () => {
    const d = newItemDraft();
    pendingFocus = d.key;
    onChange([...items, d]);
  };
  const remove = (key: string) => onChange(items.filter((d) => d.key !== key));

  const onEnter = (e: React.KeyboardEvent, key: string, field: "name" | "quantity" | "unit" | "price") => {
    if (e.key !== "Enter") return;
    e.preventDefault(); // Enter ở đây không được gửi cả biểu mẫu
    const order = ["name", "quantity", "unit", "price"] as const;
    const idx = order.indexOf(field);
    if (idx < order.length - 1) {
      root.current?.querySelector<HTMLInputElement>(`[data-item="${key}"][data-field="${order[idx + 1]}"]`)?.focus();
      return;
    }
    const at = items.findIndex((d) => d.key === key);
    const next = items[at + 1];
    if (next) root.current?.querySelector<HTMLInputElement>(`[data-item="${next.key}"][data-field="name"]`)?.focus();
    else add();
  };

  const total = draftsTotal(items);
  const count = items.filter((d) => !isBlankDraft(d)).length;

  if (!items.length) {
    return (
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50/30 hover:bg-purple-50 text-left transition disabled:opacity-60"
      >
        <span className="w-10 h-10 rounded-xl bg-purple-100 text-primary flex items-center justify-center shrink-0">
          <ShoppingBasket className="w-5 h-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-bold text-gray-900">Chi nhiều món? Nhập chi tiết từng món</span>
          <span className="block text-[11px] text-gray-500 leading-snug">Đi chợ, mua nhiều thứ…: ghi tên món, số lượng, đơn giá — tổng tiền tự cộng và phiếu có bảng kê rõ ràng.</span>
        </span>
        <Plus className="w-4 h-4 text-primary ml-auto shrink-0" />
      </button>
    );
  }

  return (
    <div ref={root} className="space-y-2" aria-label="Chi tiết các món">
      <datalist id="expense-units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="flex items-center justify-between">
        <h4 className="text-xs font-extrabold text-gray-800 inline-flex items-center gap-1.5">
          <ShoppingBasket className="w-4 h-4 text-primary" /> Chi tiết các món
        </h4>
        <button type="button" onClick={() => onChange([])} disabled={disabled} className="text-[11px] font-bold text-gray-400 hover:text-rose-600">
          Bỏ chi tiết (chi một khoản)
        </button>
      </div>

      {items.map((d, i) => {
        const amt = draftAmount(d);
        return (
          <div key={d.key} className={`relative rounded-2xl border border-gray-100 bg-gray-50/60 p-3 pt-2.5 ${GRID}`}>
            <div className="col-span-6 sm:col-span-8 pr-9">
              <span className={label}>Món {i + 1}</span>
              <CustomInput
                value={d.name}
                onChange={(e) => set(d.key, { name: e.target.value })}
                onKeyDown={(e) => onEnter(e, d.key, "name")}
                placeholder="Tên món (vd. Thịt heo)"
                maxLength={200}
                aria-label={`Tên món ${i + 1}`}
                data-item={d.key}
                data-field="name"
                disabled={disabled}
              />
            </div>
            <div className="col-span-2">
              <span className={label}>Số lượng</span>
              <CustomInput
                value={d.quantity}
                onChange={(e) => set(d.key, { quantity: e.target.value.replace(/[^\d.,]/g, "") })}
                onKeyDown={(e) => onEnter(e, d.key, "quantity")}
                inputMode="decimal"
                placeholder="1"
                aria-label={`Số lượng món ${i + 1}`}
                data-item={d.key}
                data-field="quantity"
                disabled={disabled}
              />
            </div>
            <div className="col-span-2">
              <span className={label}>Đơn vị</span>
              <CustomInput
                value={d.unit}
                onChange={(e) => set(d.key, { unit: e.target.value })}
                onKeyDown={(e) => onEnter(e, d.key, "unit")}
                list="expense-units"
                placeholder="kg, bó…"
                maxLength={30}
                aria-label={`Đơn vị món ${i + 1}`}
                data-item={d.key}
                data-field="unit"
                disabled={disabled}
              />
            </div>
            <div className="col-span-2">
              <span className={label}>Đơn giá (đ)</span>
              <CustomInput
                value={d.price ? Number(d.price).toLocaleString("vi-VN") : ""}
                onChange={(e) => set(d.key, { price: e.target.value.replace(/\D/g, "") })}
                onKeyDown={(e) => onEnter(e, d.key, "price")}
                inputMode="numeric"
                placeholder="0"
                aria-label={`Đơn giá món ${i + 1}`}
                data-item={d.key}
                data-field="price"
                disabled={disabled}
              />
            </div>
            <div className="col-span-6 sm:col-span-2 flex items-center justify-between sm:block sm:text-right">
              <span className={label + " mb-0 sm:mb-1"}>Thành tiền</span>
              <span className={`block text-sm font-extrabold tabular-nums sm:leading-[42px] ${amt ? "text-gray-900" : "text-gray-300"}`}>{amt ? formatVND(amt) : "—"}</span>
            </div>
            <button
              type="button"
              onClick={() => remove(d.key)}
              disabled={disabled}
              aria-label={`Xóa món ${i + 1}`}
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 hover:text-rose-600 hover:bg-rose-50 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-3 pt-1">
        <button type="button" onClick={add} disabled={disabled} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-purple-200 bg-white hover:bg-purple-50 text-xs font-bold text-primary transition">
          <Plus className="w-3.5 h-3.5" /> Thêm món
        </button>
        <p className="text-xs text-gray-500">
          Tổng {count} món: <b className="text-base font-extrabold text-primary tabular-nums">{formatVND(total)}</b>
        </p>
      </div>
    </div>
  );
}
