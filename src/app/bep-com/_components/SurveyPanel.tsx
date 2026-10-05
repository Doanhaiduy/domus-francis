"use client";

import React, { useEffect, useState } from "react";
import { Check, Lock, LockOpen, Plus, Sparkles, Trash2, Vote } from "lucide-react";
import { CustomInput, CustomTextarea, CustomToggle, CustomSelect, CustomDatePicker } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApp } from "@/lib/store";
import { mealsApi, useMealSurveys, SURVEYS_KEY } from "@/lib/data/kitchen";
import { dm, kitchenErrorText, vnDateTime, addDays } from "@/lib/kitchen-format";
import type { MealSurveyDto } from "@/lib/types/kitchen";
import { mutate as globalMutate } from "swr";
import KitchenModal, { btnGhost, btnPrimary } from "./KitchenModal";

function SurveyCard({ s, canManage, canRegister, onAskDelete }: { s: MealSurveyDto; canManage: boolean; canRegister: boolean; onAskDelete: (s: MealSurveyDto) => void }) {
  const { showToast } = useApp();
  const mineInit = s.options.filter((o) => o.mine).map((o) => o.id);
  const [picked, setPicked] = useState<string[]>(mineInit);
  const [suggest, setSuggest] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setPicked(s.options.filter((o) => o.mine).map((o) => o.id)), [s]);

  const open = s.status === "open";
  const total = Math.max(1, ...s.options.map((o) => o.votes));
  const changed = picked.length !== mineInit.length || picked.some((p) => !mineInit.includes(p));
  const setData = (list: MealSurveyDto[]) => globalMutate(SURVEYS_KEY, list, { revalidate: false });

  const toggle = (id: string) => {
    if (!open || !canRegister) return;
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      if (s.maxChoices === 1) return [id];
      if (p.length >= s.maxChoices) {
        showToast("warning", `Khảo sát chỉ cho chọn tối đa ${s.maxChoices} món — bỏ bớt một món trước.`);
        return p;
      }
      return [...p, id];
    });
  };
  const run = async (fn: () => Promise<MealSurveyDto[]>, ok: string) => {
    setBusy(true);
    try {
      await setData(await fn());
      showToast("success", ok);
      return true;
    } catch (e) {
      showToast("error", kitchenErrorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`bg-white rounded-3xl p-5 border shadow-xs flex flex-col gap-3 ${open ? "border-primary/40 ring-2 ring-purple-100" : "border-purple-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-gray-900">{s.title}</h3>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${open ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
              {open ? "Đang mở" : "Đã đóng"}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {s.description ? `${s.description} · ` : ""}
            {s.targetWeek ? `Tuần ${dm(s.targetWeek)}–${dm(addDays(s.targetWeek, 6))} · ` : ""}
            Chọn tối đa {s.maxChoices} món · {s.voters} người đã bình chọn
            {s.closesAt ? ` · ${open ? "Hạn" : "Đóng"} ${vnDateTime(s.closesAt)}` : ""}
            {s.createdBy ? ` · Lập bởi ${s.createdBy}` : ""}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => run(() => mealsApi.setSurveyStatus(s.id, open ? "closed" : "open"), open ? "Đã đóng khảo sát." : "Đã mở lại khảo sát.")}
              disabled={busy}
              className="p-1.5 rounded-lg text-gray-500 hover:text-primary hover:bg-purple-50"
              title={open ? "Đóng khảo sát" : "Mở lại khảo sát"}
            >
              {open ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
            </button>
            <button onClick={() => onAskDelete(s)} disabled={busy} className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50" title="Xóa khảo sát">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {s.options.map((o) => {
          const on = picked.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              disabled={!open || !canRegister}
              className={`relative overflow-hidden text-left p-3 rounded-2xl border transition ${
                on ? "border-primary bg-purple-50/60" : "border-purple-50 bg-surface-container-low/60 hover:border-purple-200"
              } ${!open || !canRegister ? "cursor-default" : ""}`}
            >
              <div className="absolute inset-y-0 left-0 bg-purple-200/40" style={{ width: `${(o.votes / total) * 100}%` }} />
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary text-white" : "border-gray-300 bg-white"}`}>
                    {on && <Check className="w-3 h-3" />}
                  </span>
                  <span className="text-xs font-semibold text-gray-800 truncate">{o.label}</span>
                </div>
                <span className="text-[11px] font-bold text-primary shrink-0">{o.votes} phiếu</span>
              </div>
              {o.suggestedBy && <div className="relative text-[10px] text-gray-400 mt-0.5 pl-6">Đề xuất bởi {o.suggestedBy}</div>}
            </button>
          );
        })}
      </div>

      {open && canRegister && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
          <button
            onClick={() => run(() => mealsApi.vote(s.id, picked), picked.length ? "Đã ghi nhận bình chọn của bạn!" : "Đã rút phiếu bình chọn.")}
            disabled={busy || !changed}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-50"
          >
            <Vote className="w-3.5 h-3.5" /> {mineInit.length ? "Cập nhật bình chọn" : "Gửi bình chọn"}
          </button>
          {s.allowSuggestions && (
            <form
              className="flex items-center gap-2 flex-1"
              onSubmit={async (e) => {
                e.preventDefault();
                if (suggest.trim().length < 2) return;
                if (await run(() => mealsApi.suggest(s.id, suggest.trim()), `Đã thêm "${suggest.trim()}" vào khảo sát.`)) setSuggest("");
              }}
            >
              <input
                value={suggest}
                onChange={(e) => setSuggest(e.target.value)}
                maxLength={120}
                placeholder="Đề xuất thêm món…"
                className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary"
              />
              <button type="submit" disabled={busy || suggest.trim().length < 2} className="px-3 py-2 rounded-xl bg-purple-100 text-primary font-bold text-xs hover:bg-purple-200 disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** Khảo sát món ăn: Ban Ẩm thực lập phiếu, anh em bình chọn / đề xuất thêm món. */
export default function SurveyPanel({ canManage, canRegister, createOpen, setCreateOpen, weekStart }: {
  canManage: boolean;
  canRegister: boolean;
  createOpen: boolean;
  setCreateOpen: (v: boolean) => void;
  weekStart: string;
}) {
  const { showToast } = useApp();
  const { surveys, isLoading } = useMealSurveys();
  const [showClosed, setShowClosed] = useState(false);
  const [toDelete, setToDelete] = useState<MealSurveyDto | null>(null);
  const open = surveys.filter((s) => s.status === "open");
  const closed = surveys.filter((s) => s.status === "closed");

  return (
    <div id="khao-sat-mon" className="flex flex-col gap-3">
      {isLoading && !surveys.length && <div className="h-24 rounded-3xl bg-white border border-purple-50 animate-pulse" />}
      {!isLoading && !open.length && (
        <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100 text-xs text-gray-600 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          {canManage ? "Chưa có khảo sát món nào đang mở — bấm “+ Đề xuất món tuần mới” để lấy ý kiến anh em." : "Hiện chưa có khảo sát món nào đang mở."}
        </div>
      )}
      {open.map((s) => (
        <SurveyCard key={s.id} s={s} canManage={canManage} canRegister={canRegister} onAskDelete={setToDelete} />
      ))}
      {closed.length > 0 && (
        <button onClick={() => setShowClosed((v) => !v)} className="self-start text-xs font-bold text-primary hover:underline">
          {showClosed ? "Ẩn khảo sát đã đóng" : `Xem ${closed.length} khảo sát đã đóng`}
        </button>
      )}
      {showClosed && closed.map((s) => <SurveyCard key={s.id} s={s} canManage={canManage} canRegister={canRegister} onAskDelete={setToDelete} />)}

      <SurveyCreateModal open={createOpen} onClose={() => setCreateOpen(false)} weekStart={weekStart} />
      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Xóa khảo sát món?"
        message={<>Khảo sát “{toDelete?.title}” cùng toàn bộ phiếu bình chọn sẽ bị xóa vĩnh viễn.</>}
        confirmText="Xóa khảo sát"
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await globalMutate(SURVEYS_KEY, await mealsApi.deleteSurvey(toDelete.id), { revalidate: false });
            showToast("success", "Đã xóa khảo sát.");
          } catch (e) {
            showToast("error", kitchenErrorText(e));
          }
        }}
      />
    </div>
  );
}

function SurveyCreateModal({ open, onClose, weekStart }: { open: boolean; onClose: () => void; weekStart: string }) {
  const { showToast } = useApp();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState("");
  const [maxChoices, setMaxChoices] = useState(2);
  const [allowSuggestions, setAllowSuggestions] = useState(true);
  const [closesOn, setClosesOn] = useState("");
  const [targetNext, setTargetNext] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("Món anh em muốn ăn tuần sau?");
    setDescription("");
    setOptions("");
    setMaxChoices(2);
    setAllowSuggestions(true);
    setClosesOn(addDays(weekStart, 5));
    setTargetNext(true);
    setError(null);
  }, [open, weekStart]);

  const save = async () => {
    const opts = options.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (title.trim().length < 3) return setError("Nhập tiêu đề khảo sát (tối thiểu 3 ký tự).");
    if (opts.length < 2) return setError("Nhập ít nhất 2 món, mỗi dòng một món.");
    setBusy(true);
    setError(null);
    try {
      const r = await mealsApi.createSurvey({
        title: title.trim(),
        description: description.trim() || null,
        maxChoices,
        allowSuggestions,
        targetWeek: targetNext ? addDays(weekStart, 7) : weekStart,
        closesOn: closesOn ? (closesOn.includes("/") ? closesOn.split("/").reverse().join("-") : closesOn) : null,
        options: opts,
      });
      await globalMutate(SURVEYS_KEY, r.surveys, { revalidate: false });
      showToast("success", "Đã gửi phiếu khảo sát món ăn cho cả nhà!");
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
      title="Khảo sát món ăn mới"
      subtitle="Anh em bình chọn món yêu thích để Ban Ẩm thực lên thực đơn"
      icon={<Sparkles className="w-5 h-5" />}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>Hủy</button>
          <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Đang gửi…" : "Gửi khảo sát"}</button>
        </>
      }
    >
      <CustomInput label="Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
      <CustomInput label="Mô tả (tùy chọn)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="Ví dụ: Chọn món mặn cho bữa trưa" />
      <CustomTextarea label="Các món để bình chọn (mỗi dòng một món)" rows={5} value={options} onChange={(e) => setOptions(e.target.value)} placeholder={"Gà kho gừng\nCá basa chiên xù\nBò xào thiên lý"} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomSelect
          label="Số món mỗi người được chọn"
          value={maxChoices}
          onChange={setMaxChoices}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n} món` }))}
        />
        <CustomDatePicker label="Hạn bình chọn (hết ngày)" value={closesOn} onChange={setClosesOn} format="YYYY-MM-DD" />
      </div>
      <CustomSelect
        label="Áp dụng cho"
        value={targetNext ? "next" : "this"}
        onChange={(v) => setTargetNext(v === "next")}
        options={[
          { value: "next", label: `Tuần sau (${dm(addDays(weekStart, 7))}–${dm(addDays(weekStart, 13))})` },
          { value: "this", label: `Tuần đang xem (${dm(weekStart)}–${dm(addDays(weekStart, 6))})` },
        ]}
      />
      <CustomToggle checked={allowSuggestions} onChange={setAllowSuggestions} label="Cho phép anh em đề xuất thêm món" description="Mỗi người thêm tối đa 3 món vào phiếu" />
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}
    </KitchenModal>
  );
}
