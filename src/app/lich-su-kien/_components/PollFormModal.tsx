"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Vote, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { CustomInput, CustomSelect, CustomDatePicker, CustomTimePicker, CustomToggle } from "@/components/ui/FormControls";
import { parseVnTime, toIsoDate, vnToIso } from "@/lib/events-format";
import { pollsApi, refreshEvents } from "@/lib/data/events";
import type { EventDto } from "@/lib/types/events";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Sự kiện có thể liên kết (thường là các sự kiện của tháng đang xem) */
  events: EventDto[];
  presetEventId?: string | null;
}

export default function PollFormModal({ open, onClose, events, presetEventId }: Props) {
  const { showToast } = useApp();
  const [eventId, setEventId] = useState("");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multi, setMulti] = useState(false);
  const [maxChoices, setMaxChoices] = useState("2");
  const [anonymous, setAnonymous] = useState(false);
  const [closeDate, setCloseDate] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setEventId(presetEventId ?? "");
    setQuestion("");
    setOptions(["", ""]);
    setMulti(false);
    setMaxChoices("2");
    setAnonymous(false);
    setCloseDate("");
    setCloseTime("");
  }, [open, presetEventId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 5) {
      showToast("error", "Vui lòng nhập câu hỏi biểu quyết (tối thiểu 5 ký tự)!");
      return;
    }
    const valid = options.map((o) => o.trim()).filter(Boolean);
    if (valid.length < 2) {
      showToast("error", "Cần ít nhất 2 phương án lựa chọn!");
      return;
    }
    let closesAt: string | null = null;
    if (closeDate) {
      const d = toIsoDate(closeDate);
      const t = parseVnTime(closeTime || "23:59");
      if (!d || !t) {
        showToast("error", "Hạn chót không hợp lệ.");
        return;
      }
      closesAt = vnToIso(d, t.h, t.m);
      if (new Date(closesAt).getTime() <= Date.now()) {
        showToast("error", "Hạn chót biểu quyết phải ở tương lai.");
        return;
      }
    }
    setSaving(true);
    try {
      await pollsApi.create({
        eventId: eventId || null,
        question: question.trim(),
        options: valid,
        isMultiSelect: multi,
        maxChoices: multi ? Math.max(2, Math.min(valid.length, Number(maxChoices) || 2)) : 1,
        isAnonymous: anonymous,
        closesAt,
      });
      await refreshEvents();
      showToast("success", "Đã xuất bản cuộc biểu quyết mới!");
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open || !mounted) return null;

  const validCount = Math.max(2, options.filter((o) => o.trim()).length);

  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="flex min-h-full items-center justify-center">
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-purple-50 flex flex-col overflow-hidden my-auto p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <Vote className="w-5 h-5 text-primary" />
              <h3 className="text-base font-black text-gray-900">Tạo Cuộc Biểu Quyết Mới</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <CustomSelect
              label="Chọn sự kiện liên kết:"
              value={eventId}
              onChange={setEventId}
              placeholder="-- Chọn sự kiện liên kết --"
              options={[
                { value: "", label: "— Không gắn sự kiện (biểu quyết chung) —" },
                ...events
                  .filter((ev) => ev.status !== "cancelled")
                  .map((ev) => ({ value: ev.id, label: `${ev.title} (${ev.date})` })),
              ]}
            />

            <CustomInput
              label="Câu hỏi biểu quyết"
              placeholder="VD: Anh em chọn ngày nào thuận tiện để dã ngoại?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
            />

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Các phương án lựa chọn:</label>
              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Phương án ${idx + 1}...`}
                      value={opt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
                      }}
                      className="flex-1 p-2 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-purple-200 outline-none"
                      required={idx < 2}
                      maxLength={200}
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setOptions((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {options.length < 20 && (
                <button
                  type="button"
                  onClick={() => setOptions((prev) => [...prev, ""])}
                  className="mt-2 text-xs font-bold text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm phương án</span>
                </button>
              )}
            </div>

            <div className="p-3 bg-purple-50/60 rounded-2xl border border-purple-100 space-y-3">
              <CustomToggle
                label="Cho phép chọn nhiều phương án"
                description="Mỗi anh em được chọn tối đa số phương án quy định"
                checked={multi}
                onChange={setMulti}
              />
              {multi && (
                <CustomSelect
                  label="Số lựa chọn tối đa"
                  value={maxChoices}
                  onChange={setMaxChoices}
                  options={Array.from({ length: Math.max(1, validCount - 1) }, (_, i) => String(i + 2)).map((v) => ({ value: v, label: `${v} phương án` }))}
                />
              )}
              <CustomToggle
                label="Biểu quyết ẩn danh"
                description="Không ai (kể cả Ban điều hành) xem được ai chọn gì; số phiếu từng phương án công bố khi đóng"
                checked={anonymous}
                onChange={setAnonymous}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <CustomDatePicker label="Hạn chót (tuỳ chọn)" placeholder="Không giới hạn" value={closeDate} onChange={setCloseDate} />
              <CustomTimePicker label="Giờ đóng" placeholder="23:59" value={closeTime} onChange={setCloseTime} />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 disabled:opacity-60"
              >
                {saving ? "Đang xuất bản..." : "Xuất bản biểu quyết"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
