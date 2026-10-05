"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Minus, Package, Pencil, Plus, ShoppingBag, ShoppingCart, Trash2, X } from "lucide-react";
import { CustomInput, CustomSelect, CustomDatePicker } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApp } from "@/lib/store";
import { pantryApi, usePantry, PANTRY_KEY } from "@/lib/data/kitchen";
import { dm, kitchenErrorText, qtyText, vnDateTime, vnd } from "@/lib/kitchen-format";
import type { PantryDto, PantryItemDto, RestockRequestDto, ShoppingItemDto } from "@/lib/types/kitchen";
import { mutate as globalMutate } from "swr";
import KitchenModal, { btnGhost, btnPrimary } from "./KitchenModal";

const STATUS_LABEL = { ok: "Đầy đủ", low: "Sắp hết", urgent: "Cần mua gấp" } as const;
const REQ_LABEL: Record<RestockRequestDto["status"], { text: string; cls: string }> = {
  open: { text: "Chờ duyệt", cls: "bg-amber-100 text-amber-800" },
  approved: { text: "Đã vào DS cần mua", cls: "bg-purple-100 text-purple-800" },
  bought: { text: "Đã mua", cls: "bg-emerald-100 text-emerald-800" },
  rejected: { text: "Từ chối", cls: "bg-rose-100 text-rose-800" },
  cancelled: { text: "Đã hủy", cls: "bg-gray-100 text-gray-600" },
};
const setPantryData = (p: PantryDto) => globalMutate(PANTRY_KEY, p, { revalidate: false });
const isoDate = (v: string) => (v.includes("/") ? v.split("/").reverse().join("-") : v);

type RestockMode = { kind: "request" | "shopping"; item: PantryItemDto | null };

export default function PantryTab({ pantryCountChange }: { pantryCountChange?: (n: number) => void }) {
  const { showToast } = useApp();
  const { pantry, isLoading } = usePantry();
  const [restock, setRestock] = useState<RestockMode | null>(null);
  const [editItem, setEditItem] = useState<PantryItemDto | "new" | null>(null);
  const [reject, setReject] = useState<RestockRequestDto | null>(null);
  const [buy, setBuy] = useState<ShoppingItemDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (pantry) pantryCountChange?.(pantry.items.length);
  }, [pantry, pantryCountChange]);

  const run = async (id: string, fn: () => Promise<PantryDto>, ok: string) => {
    setBusyId(id);
    try {
      await setPantryData(await fn());
      showToast("success", ok);
    } catch (e) {
      showToast("error", kitchenErrorText(e));
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading && !pantry) return <div className="h-64 rounded-3xl bg-white border border-purple-50 animate-pulse" />;
  if (!pantry) return <div className="p-6 rounded-3xl bg-white border border-rose-100 text-sm text-rose-700">Không tải được dữ liệu kho bếp.</div>;

  const { items, requests, shopping, canManage, canRequest } = pantry;
  const urgent = items.filter((i) => i.status === "urgent").length;
  const low = items.filter((i) => i.status === "low").length;
  const pendingShop = shopping.filter((s) => !s.isPurchased);
  const estTotal = pendingShop.reduce((t, s) => t + (s.estCostVnd ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-purple-50 shadow-xs flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Kiểm kê gia vị &amp; Thực phẩm kho bếp</h2>
            <p className="text-xs text-gray-500">
              Theo dõi lượng tồn kho đồ dùng chung để kịp thời mua bổ sung
              {items.length > 0 && (
                <>
                  {" · "}
                  <b className="text-rose-700">{urgent} cần mua gấp</b>, <b className="text-amber-700">{low} sắp hết</b>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canManage && (
              <button
                onClick={() => setEditItem("new")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-primary font-bold text-xs transition"
              >
                <Package className="w-4 h-4" /> Thêm mặt hàng
              </button>
            )}
            {canRequest && (
              <button
                onClick={() => setRestock({ kind: "request", item: null })}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Đề xuất mua thêm gia vị</span>
              </button>
            )}
          </div>
        </div>

        {items.length === 0 && <p className="text-xs text-gray-400">Kho bếp chưa có mặt hàng nào{canManage ? " — bấm “Thêm mặt hàng” để bắt đầu theo dõi." : "."}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const pending = item.openRequestId || item.onShoppingList;
            return (
              <div key={item.id} className="p-4 rounded-2xl bg-surface-container-low/60 border border-purple-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center text-xl shrink-0">{item.icon || "📦"}</div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-gray-900 truncate">{item.name}</h3>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Hiện có: <b className="text-gray-900">{qtyText(item.qty)} {item.unit}</b> (Định mức: {qtyText(item.par)} {item.unit})
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          item.status === "ok" ? "bg-emerald-100 text-emerald-800" : item.status === "low" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800 animate-pulse"
                        }`}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                      {canManage && (
                        <span className="inline-flex items-center gap-0.5">
                          <button
                            onClick={() => run(item.id, () => pantryApi.updateItem(item.id, { delta: -1 }), `Đã trừ 1 ${item.unit} ${item.name}.`)}
                            disabled={busyId === item.id || item.qty <= 0}
                            className="w-5 h-5 rounded-md bg-white border border-purple-100 text-gray-600 hover:text-primary flex items-center justify-center disabled:opacity-40"
                            title={`Trừ 1 ${item.unit}`}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => run(item.id, () => pantryApi.updateItem(item.id, { delta: 1 }), `Đã cộng 1 ${item.unit} ${item.name}.`)}
                            disabled={busyId === item.id}
                            className="w-5 h-5 rounded-md bg-white border border-purple-100 text-gray-600 hover:text-primary flex items-center justify-center disabled:opacity-40"
                            title={`Cộng 1 ${item.unit}`}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setEditItem(item)}
                            className="w-5 h-5 rounded-md bg-white border border-purple-100 text-gray-600 hover:text-primary flex items-center justify-center"
                            title="Sửa tồn kho / định mức"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {pending ? (
                  <span className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100 shrink-0 text-center leading-tight whitespace-pre-line">
                    {item.onShoppingList ? "Đã trong DS\ncần mua" : "Đã có\nđề xuất"}
                  </span>
                ) : (
                  (canRequest || canManage) && (
                    <button
                      onClick={() => setRestock({ kind: canManage ? "shopping" : "request", item })}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-purple-50 text-primary border border-purple-200 transition shrink-0"
                    >
                      Mua thêm
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* YÊU CẦU MUA THÊM */}
        <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-primary" /> Đề xuất mua thêm
              </h2>
              <p className="text-xs text-gray-500">Anh em đề xuất — Ban Ẩm thực duyệt vào danh sách đi chợ</p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-xs font-bold">{requests.filter((r) => r.status === "open").length} chờ duyệt</span>
          </div>
          {requests.length === 0 && <p className="text-xs text-gray-400">Chưa có đề xuất nào.</p>}
          {requests.map((r) => (
            <div key={r.id} className="p-3.5 rounded-2xl bg-surface-container-low/60 border border-purple-50 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-gray-900">
                    {r.itemName}
                    {r.qty ? <span className="font-semibold text-gray-600"> · {qtyText(r.qty)} {r.unit ?? ""}</span> : null}
                    {!r.pantryItemId && <span className="ml-1.5 text-[10px] font-semibold text-purple-600">(món mới)</span>}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {r.mine ? "Bạn" : r.requestedBy} đề xuất · {vnDateTime(r.createdAt)}
                  </div>
                  {r.note && <div className="text-[11px] text-gray-600 mt-0.5">“{r.note}”</div>}
                  {r.status !== "open" && (r.resolutionNote || r.resolvedBy) && (
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      ↳ {r.resolutionNote ?? (r.status === "cancelled" ? "Đã hủy" : "Đã xử lý")}
                      {r.resolvedBy ? ` — ${r.resolvedBy}` : ""}
                      {r.resolvedAt ? ` (${vnDateTime(r.resolvedAt)})` : ""}
                    </div>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${REQ_LABEL[r.status].cls}`}>{REQ_LABEL[r.status].text}</span>
              </div>
              {r.status === "open" && (canManage || r.mine) && (
                <div className="flex items-center gap-2 pt-1">
                  {canManage && (
                    <>
                      <button
                        onClick={() => run(r.id, () => pantryApi.actOnRequest(r.id, "approve"), `Đã duyệt và đưa “${r.itemName}” vào danh sách cần mua.`)}
                        disabled={busyId === r.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-white text-[11px] font-bold hover:bg-primary-container disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" /> Duyệt mua
                      </button>
                      <button
                        onClick={() => setReject(r)}
                        disabled={busyId === r.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-rose-200 text-rose-600 text-[11px] font-bold hover:bg-rose-50 disabled:opacity-50"
                      >
                        <X className="w-3 h-3" /> Từ chối
                      </button>
                    </>
                  )}
                  {r.mine && (
                    <button
                      onClick={() => run(r.id, () => pantryApi.actOnRequest(r.id, "cancel"), "Đã hủy đề xuất của bạn.")}
                      disabled={busyId === r.id}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                    >
                      Hủy đề xuất
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* DANH SÁCH CẦN MUA */}
        <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100 gap-2">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-primary" /> Danh sách cần mua
              </h2>
              <p className="text-xs text-gray-500">
                {pendingShop.length} món chờ mua{estTotal ? ` · dự kiến ${vnd(estTotal)}` : ""} · đánh dấu đã mua sẽ tự cộng vào kho
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => setRestock({ kind: "shopping", item: null })}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-purple-100 text-primary font-bold text-xs hover:bg-purple-200 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm
              </button>
            )}
          </div>
          {shopping.length === 0 && <p className="text-xs text-gray-400">Danh sách trống — chưa cần mua gì.</p>}
          {shopping.map((s) => (
            <div
              key={s.id}
              className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 ${s.isPurchased ? "bg-gray-50 border-gray-100" : "bg-surface-container-low/60 border-purple-50"}`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <button
                  onClick={() => !s.isPurchased && canManage && setBuy(s)}
                  disabled={s.isPurchased || !canManage || busyId === s.id}
                  className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                    s.isPurchased ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-gray-300 hover:border-primary"
                  } ${!canManage && !s.isPurchased ? "cursor-default" : ""}`}
                  title={s.isPurchased ? "Đã mua" : canManage ? "Đánh dấu đã mua" : "Chưa mua"}
                >
                  {s.isPurchased && <Check className="w-3.5 h-3.5" />}
                </button>
                <div className="min-w-0">
                  <div className={`text-xs font-bold ${s.isPurchased ? "text-gray-400 line-through" : "text-gray-900"}`}>
                    {s.name}
                    {s.qty ? <span className="font-semibold"> · {qtyText(s.qty)} {s.unit ?? ""}</span> : null}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {s.isPurchased
                      ? `Đã mua${s.purchasedBy ? ` bởi ${s.purchasedBy}` : ""}${s.purchasedAt ? ` · ${vnDateTime(s.purchasedAt)}` : ""}`
                      : [s.neededOn ? `Cần trước ${dm(s.neededOn)}` : null, s.estCostVnd ? `~${vnd(s.estCostVnd)}` : null, s.restockRequestId ? "từ đề xuất" : null]
                          .filter(Boolean)
                          .join(" · ")}
                  </div>
                  {s.note && <div className="text-[11px] text-gray-600">{s.note}</div>}
                </div>
              </div>
              {canManage && !s.isPurchased && (
                <button
                  onClick={() => run(s.id, () => pantryApi.deleteShopping(s.id), `Đã bỏ “${s.name}” khỏi danh sách.`)}
                  disabled={busyId === s.id}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                  title="Bỏ khỏi danh sách"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <RestockModal mode={restock} items={items} onClose={() => setRestock(null)} />
      <PantryItemModal item={editItem} onClose={() => setEditItem(null)} />
      <RejectModal req={reject} onClose={() => setReject(null)} />
      <ConfirmDialog
        isOpen={!!buy}
        onClose={() => setBuy(null)}
        variant="info"
        icon={<ShoppingCart className="w-6 h-6" />}
        title="Xác nhận đã mua?"
        message={
          buy ? (
            <>
              Đánh dấu đã mua <b>{buy.name}</b>
              {buy.qty ? ` (${qtyText(buy.qty)} ${buy.unit ?? ""})` : ""}.
              {buy.pantryItemId && buy.qty ? " Số lượng sẽ được cộng vào tồn kho và không bỏ đánh dấu được nữa." : " Thao tác này không hoàn tác được."}
            </>
          ) : null
        }
        confirmText="Đã mua"
        onConfirm={() => buy && run(buy.id, () => pantryApi.updateShopping(buy.id, { isPurchased: true }), `Đã mua “${buy.name}”.`)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Đề xuất mua thêm (thành viên) / thêm vào danh sách cần mua (Ban Ẩm thực)
// ---------------------------------------------------------------------
function RestockModal({ mode, items, onClose }: { mode: RestockMode | null; items: PantryItemDto[]; onClose: () => void }) {
  const { showToast } = useApp();
  const [itemId, setItemId] = useState<string>("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [neededOn, setNeededOn] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    const it = mode.item;
    setItemId(it?.id ?? "");
    setName("");
    setQty(it ? String(Math.max(1, Math.ceil(it.par - it.qty))) : "");
    setUnit(it?.unit ?? "");
    setNote("");
    setNeededOn("");
    setCost("");
    setError(null);
  }, [mode]);

  const options = useMemo(
    () => [{ value: "", label: "— Món mới (chưa có trong kho) —" }, ...items.map((i) => ({ value: i.id, label: i.name, subLabel: `Còn ${qtyText(i.qty)} ${i.unit}` }))],
    [items]
  );
  if (!mode) return null;
  const shopping = mode.kind === "shopping";
  const sel = items.find((i) => i.id === itemId);

  const save = async () => {
    setError(null);
    if (!itemId && name.trim().length < 2) return setError("Nhập tên món cần mua (tối thiểu 2 ký tự).");
    const q = qty ? Number(qty.replace(",", ".")) : null;
    if (q !== null && !(q > 0)) return setError("Số lượng phải lớn hơn 0.");
    setBusy(true);
    try {
      const body = { pantryItemId: itemId || null, qty: q, unit: unit.trim() || null, note: note.trim() || null };
      const r = shopping
        ? await pantryApi.addShopping({ ...body, name: itemId ? null : name.trim(), neededOn: neededOn ? isoDate(neededOn) : null, estCostVnd: cost ? Math.round(Number(cost)) : null })
        : await pantryApi.request({ ...body, itemName: itemId ? null : name.trim() });
      await setPantryData(r.pantry);
      showToast("success", shopping ? "Đã thêm vào danh sách đồ cần mua!" : "Đã gửi đề xuất mua thêm cho Ban Ẩm thực!");
      onClose();
    } catch (e) {
      setError(kitchenErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KitchenModal
      open={!!mode}
      onClose={onClose}
      title={shopping ? "Thêm vào danh sách cần mua" : "Đề xuất mua thêm"}
      subtitle={shopping ? "Đội đi chợ sẽ mua theo danh sách này" : "Ban Ẩm thực sẽ duyệt và đưa vào danh sách đi chợ"}
      icon={shopping ? <ShoppingBag className="w-5 h-5" /> : <ClipboardList className="w-5 h-5" />}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>Hủy</button>
          <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Đang lưu…" : shopping ? "Thêm vào danh sách" : "Gửi đề xuất"}</button>
        </>
      }
    >
      <CustomSelect
        label="Mặt hàng"
        value={itemId}
        onChange={(v) => {
          setItemId(v);
          const it = items.find((i) => i.id === v);
          if (it) {
            setUnit(it.unit);
            setQty(String(Math.max(1, Math.ceil(it.par - it.qty))));
          }
        }}
        options={options}
      />
      {!itemId && <CustomInput label="Tên món cần mua" placeholder="Ví dụ: Tương ớt Chinsu" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />}
      <div className="grid grid-cols-2 gap-3">
        <CustomInput label="Số lượng" type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="2" />
        <CustomInput label="Đơn vị" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={sel?.unit ?? "chai, kg, gói…"} maxLength={30} />
      </div>
      {shopping && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CustomDatePicker label="Cần trước ngày" value={neededOn} onChange={setNeededOn} format="YYYY-MM-DD" placeholder="Mặc định: ngày mai" />
          <CustomInput label="Ước tính chi phí" type="number" min={0} step={1000} rightSuffix="đ" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
      )}
      <CustomInput label="Ghi chú (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ví dụ: Mua loại chai 750ml" />
      {sel && sel.unit && unit.trim() && unit.trim().toLowerCase() !== sel.unit.toLowerCase() && (
        <p className="text-[11px] text-amber-700">Đơn vị khác với đơn vị kho ({sel.unit}) — khi mua xong kho sẽ không tự cộng.</p>
      )}
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}
    </KitchenModal>
  );
}

// ---------------------------------------------------------------------
// Thêm / sửa mặt hàng kho (Ban Ẩm thực)
// ---------------------------------------------------------------------
function PantryItemModal({ item, onClose }: { item: PantryItemDto | "new" | null; onClose: () => void }) {
  const { showToast } = useApp();
  const [f, setF] = useState({ name: "", unit: "", qty: "", par: "", icon: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askArchive, setAskArchive] = useState(false);

  useEffect(() => {
    if (!item) return;
    setF(item === "new" ? { name: "", unit: "", qty: "0", par: "", icon: "" } : { name: item.name, unit: item.unit, qty: String(item.qty), par: String(item.par), icon: item.icon ?? "" });
    setError(null);
  }, [item]);
  if (!item) return null;
  const isNew = item === "new";

  const save = async () => {
    setError(null);
    const qty = Number(f.qty.replace(",", "."));
    const par = Number((f.par || "0").replace(",", "."));
    if (f.name.trim().length < 2) return setError("Tên mặt hàng tối thiểu 2 ký tự.");
    if (!f.unit.trim()) return setError("Nhập đơn vị (kg, chai, gói…).");
    if (!(qty >= 0) || !(par >= 0)) return setError("Tồn kho và định mức phải là số không âm.");
    setBusy(true);
    try {
      const body = { name: f.name.trim(), unit: f.unit.trim(), qtyOnHand: qty, parLevel: par, icon: f.icon.trim() || null };
      const p = isNew ? (await pantryApi.createItem(body)).pantry : await pantryApi.updateItem(item.id, body);
      await setPantryData(p);
      showToast("success", isNew ? `Đã thêm “${body.name}” vào kho.` : `Đã cập nhật “${body.name}”.`);
      onClose();
    } catch (e) {
      setError(kitchenErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <KitchenModal
        open={!!item}
        onClose={onClose}
        title={isNew ? "Thêm mặt hàng vào kho" : "Cập nhật mặt hàng"}
        subtitle="Trạng thái Đầy đủ / Sắp hết / Cần mua gấp tự tính theo định mức"
        icon={<Package className="w-5 h-5" />}
        footer={
          <>
            {!isNew && (
              <button onClick={() => setAskArchive(true)} className="mr-auto px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50">
                Ngưng theo dõi
              </button>
            )}
            <button onClick={onClose} className={btnGhost}>Hủy</button>
            <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Đang lưu…" : "Lưu"}</button>
          </>
        }
      >
        <div className="grid grid-cols-[1fr_80px] gap-3">
          <CustomInput label="Tên mặt hàng" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} placeholder="Ví dụ: Nước mắm Nam Ngư 750ml" />
          <CustomInput label="Biểu tượng" value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} maxLength={8} placeholder="🧂" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <CustomInput label="Tồn kho" type="number" min={0} step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
          <CustomInput label="Định mức" type="number" min={0} step="any" value={f.par} onChange={(e) => setF({ ...f, par: e.target.value })} />
          <CustomInput label="Đơn vị" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} maxLength={30} placeholder="chai" />
        </div>
        {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}
      </KitchenModal>
      <ConfirmDialog
        isOpen={askArchive}
        onClose={() => setAskArchive(false)}
        title="Ngưng theo dõi mặt hàng?"
        message="Mặt hàng sẽ ẩn khỏi kho bếp (lịch sử đề xuất / mua vẫn được giữ)."
        confirmText="Ngưng theo dõi"
        onConfirm={async () => {
          if (isNew) return;
          try {
            await setPantryData(await pantryApi.archiveItem(item.id));
            showToast("success", `Đã ngưng theo dõi “${item.name}”.`);
            onClose();
          } catch (e) {
            showToast("error", kitchenErrorText(e));
          }
        }}
      />
    </>
  );
}

function RejectModal({ req, onClose }: { req: RestockRequestDto | null; onClose: () => void }) {
  const { showToast } = useApp();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(""), [req]);
  if (!req) return null;
  const save = async () => {
    if (!note.trim()) return showToast("warning", "Nhập lý do từ chối để người đề xuất biết.");
    setBusy(true);
    try {
      await setPantryData(await pantryApi.actOnRequest(req.id, "reject", note.trim()));
      showToast("success", "Đã từ chối đề xuất.");
      onClose();
    } catch (e) {
      showToast("error", kitchenErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <KitchenModal
      open={!!req}
      onClose={onClose}
      title="Từ chối đề xuất mua thêm"
      subtitle={`${req.itemName} — ${req.requestedBy}`}
      icon={<X className="w-5 h-5" />}
      iconClass="bg-rose-50 text-rose-600"
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>Hủy</button>
          <button onClick={save} disabled={busy} className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition disabled:opacity-50">
            Từ chối
          </button>
        </>
      }
    >
      <CustomInput label="Lý do" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ví dụ: Kho còn 1 hũ ở tủ trên" autoFocus />
    </KitchenModal>
  );
}


