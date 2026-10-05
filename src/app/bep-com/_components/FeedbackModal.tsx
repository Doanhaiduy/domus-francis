"use client";

import React, { useEffect, useState } from "react";
import { MessageSquareHeart, Star, Trash2 } from "lucide-react";
import { CustomTextarea } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { mealsApi, refreshMeals, useMealFeedback } from "@/lib/data/kitchen";
import { dmy, kitchenErrorText, vnDateTime } from "@/lib/kitchen-format";
import type { MealDayDto, MealType } from "@/lib/types/kitchen";
import KitchenModal, { btnGhost, btnPrimary } from "./KitchenModal";

interface Props {
  day: MealDayDto | null;
  initialMeal?: MealType;
  canManage: boolean;
  onClose: () => void;
}

function Stars({ value, onChange, size = "w-6 h-6" }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={`${onChange ? "hover:scale-110 transition" : "cursor-default"}`}
          aria-label={`${n} sao`}
        >
          <Star className={`${size} ${n <= value ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
}

/** Lời khen / góp ý + chấm sao cho một bữa đã diễn ra. Ban Ẩm thực xem được toàn bộ góp ý của bữa. */
export default function FeedbackModal({ day, initialMeal = "lunch", canManage, onClose }: Props) {
  const { showToast } = useApp();
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const slot = day ? day[meal] : null;
  const { feedback, mutate } = useMealFeedback(slot?.menuId ?? null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMeal(initialMeal), [initialMeal, day]);
  useEffect(() => {
    setRating(slot?.myFeedback?.rating ?? 0);
    setComment(slot?.myFeedback?.comment ?? "");
    setError(null);
  }, [slot?.menuId, slot?.myFeedback?.rating, slot?.myFeedback?.comment]);

  if (!day || !slot) return null;
  const future = !day.isPast && !day.isToday;
  const reason = future
    ? "Chỉ góp ý được bữa ăn đã diễn ra (hôm nay hoặc trước đó)."
    : !slot.menuId
      ? "Bữa này không có thực đơn nên chưa góp ý được."
      : slot.status === "cancelled"
        ? "Bữa này không nấu."
        : null;

  const save = async () => {
    if (!slot.menuId) return;
    if (rating < 1) return setError("Chọn số sao trước khi gửi.");
    setBusy(true);
    setError(null);
    try {
      await mutate(await mealsApi.putFeedback(slot.menuId, rating, comment.trim() || null), { revalidate: false });
      await refreshMeals();
      showToast("success", `Đã gửi góp ý cho bữa ${meal === "lunch" ? "trưa" : "tối"} ${dmy(day.date)} — cảm ơn bạn!`);
    } catch (e) {
      setError(kitchenErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (feedbackId?: string) => {
    if (!slot.menuId) return;
    setBusy(true);
    try {
      await mutate(await mealsApi.deleteFeedback(slot.menuId, feedbackId), { revalidate: false });
      await refreshMeals();
      if (!feedbackId) {
        setRating(0);
        setComment("");
      }
      showToast("info", "Đã xóa góp ý.");
    } catch (e) {
      showToast("error", kitchenErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const others = (feedback?.items ?? []).filter((f) => !f.mine);

  return (
    <KitchenModal
      open={!!day}
      onClose={onClose}
      title="Bình chọn & góp ý bữa ăn"
      subtitle={`${day.weekdayLong} ${dmy(day.date)}`}
      icon={<MessageSquareHeart className="w-5 h-5" />}
      footer={
        <>
          {slot.myFeedback && !reason && (
            <button onClick={() => remove()} disabled={busy} className="mr-auto px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50">
              Xóa góp ý của tôi
            </button>
          )}
          <button onClick={onClose} className={btnGhost}>Đóng</button>
          <button onClick={save} disabled={busy || !!reason} className={btnPrimary}>{slot.myFeedback ? "Cập nhật góp ý" : "Gửi góp ý"}</button>
        </>
      }
    >
      <div className="flex gap-2">
        {(["lunch", "dinner"] as MealType[]).map((m) => (
          <button
            key={m}
            onClick={() => setMeal(m)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${meal === m ? "bg-primary text-white shadow-xs" : "text-gray-600 hover:bg-surface-container-low"}`}
          >
            {m === "lunch" ? "☀️ Bữa Trưa" : "🌙 Bữa Tối"}
          </button>
        ))}
      </div>

      <div className="p-4 rounded-2xl bg-surface-container-low/60 border border-purple-50 text-xs text-gray-700">
        {slot.title && <div className="font-bold text-gray-900 mb-1">{slot.title}</div>}
        {slot.dishes.length ? slot.dishes.join(" · ") : <span className="text-gray-400">Chưa có danh sách món.</span>}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
          {feedback?.summary ? (
            <>
              <Stars value={Math.round(feedback.summary.avg)} size="w-3.5 h-3.5" />
              <span>
                <b className="text-gray-800">{feedback.summary.avg.toFixed(1)}</b>/5 · {feedback.summary.count} lượt chấm
              </span>
            </>
          ) : (
            <span>Chưa có ai chấm điểm bữa này.</span>
          )}
        </div>
      </div>

      {reason ? (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">{reason}</div>
      ) : (
        <>
          <div>
            <span className="block text-xs font-bold text-gray-700 mb-1.5">Bạn chấm bữa này mấy sao?</span>
            <Stars value={rating} onChange={setRating} />
          </div>
          <CustomTextarea
            label="Lời khen / góp ý cho anh em trực bếp (tùy chọn)"
            rows={3}
            maxLength={1000}
            placeholder="Ví dụ: Canh rất vừa miệng, món kho hơi mặn…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </>
      )}
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}

      {canManage && (
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
          <span className="text-xs font-bold text-gray-700">Góp ý của anh em ({others.length})</span>
          {others.length === 0 && <p className="text-[11px] text-gray-400">Chưa có góp ý nào khác.</p>}
          {others.map((f) => (
            <div key={f.id} className="p-3 rounded-xl bg-white border border-purple-50 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-900">{f.memberName}</span>
                  <Stars value={f.rating} size="w-3 h-3" />
                  <span className="text-[10px] text-gray-400">{vnDateTime(f.updatedAt)}</span>
                </div>
                {f.comment && <p className="text-xs text-gray-600 mt-0.5">{f.comment}</p>}
              </div>
              <button onClick={() => remove(f.id)} disabled={busy} className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50" title="Xóa góp ý không phù hợp">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </KitchenModal>
  );
}
