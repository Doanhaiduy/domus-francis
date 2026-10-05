"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import type { TargetType } from "@/lib/types/community";
import { announcementsApi, refreshAnnouncements, useAnnouncementMeta } from "@/lib/data/community";
import { formatDateTime } from "@/lib/community-format";
import type { AiResultDto } from "@/lib/types/ai";
import { AiLabel, AiSuggestButton } from "@/components/ai/AiParts";
import {
  CustomInput,
  CustomSelect,
  CustomDatePicker,
  CustomTextarea,
  CustomToggle,
  ImageUploadDropzone,
} from "@/components/ui/FormControls";

type Audience = "all" | TargetType;

const AUDIENCE_OPTIONS: { value: Audience; label: string; icon: string }[] = [
  { value: "all", label: "Toàn thể thành viên", icon: "🏠" },
  { value: "floor", label: "Theo tầng", icon: "🏢" },
  { value: "room", label: "Theo phòng", icon: "🚪" },
  { value: "role", label: "Theo vai trò / ban", icon: "👥" },
];

const plusDays = (n: number) => {
  const d = new Date(Date.now() + 7 * 3600e3 + n * 86400e3);
  return d.toISOString().slice(0, 10);
};

export default function CreateAnnouncementModal() {
  const { closeModal, showToast } = useApp();
  const { can } = useSession();
  const meta = useAnnouncementMeta();
  const [digest, setDigest] = useState<AiResultDto<"community.minutes"> | null>(null);
  const canPin = can("announcement.pin");
  const canNotify = can("notification.send");

  const [annTitle, setAnnTitle] = useState("");
  const [annCategory, setAnnCategory] = useState<string>("");
  const [annContent, setAnnContent] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [targetId, setTargetId] = useState("");
  const [eventId, setEventId] = useState("");
  const [fileId, setFileId] = useState("");
  const [pinned, setPinned] = useState(false);
  const [requiresAck, setRequiresAck] = useState(false);
  const [ackDate, setAckDate] = useState(plusDays(7));
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!annCategory && meta.categories.length) setAnnCategory(meta.categories[0].id);
  }, [meta.categories, annCategory]);
  useEffect(() => setTargetId(""), [audience]);

  const targetOptions =
    audience === "floor"
      ? meta.floors.map((f) => ({ value: f.id, label: f.name }))
      : audience === "room"
      ? meta.rooms.map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` }))
      : audience === "role"
      ? meta.roles.map((r) => ({ value: r.id, label: r.name }))
      : [];

  const selectedCat = meta.categories.find((c) => c.id === annCategory);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (annTitle.trim().length < 3) return showToast("error", "Tiêu đề tối thiểu 3 ký tự.");
    if (!annContent.trim()) return showToast("error", "Vui lòng nhập nội dung thông báo.");
    if (!annCategory) return showToast("error", "Vui lòng chọn chuyên mục.");
    if (audience !== "all" && !targetId) return showToast("error", "Vui lòng chọn đối tượng nhận.");
    setSaving(true);
    try {
      const res = await announcementsApi.create({
        title: annTitle.trim(),
        content: annContent.trim(),
        categoryId: annCategory,
        targets: audience === "all" ? [] : [{ type: audience, id: targetId }],
        isPinned: canPin ? pinned : false,
        requiresAck: canPin ? requiresAck : false,
        ackDeadline: canPin && requiresAck ? new Date(`${ackDate}T23:59:00+07:00`).toISOString() : null,
        eventId: eventId || null,
        attachmentFileId: fileId || null,
        notify: canNotify ? notify : false,
      });
      await refreshAnnouncements();
      showToast(
        "success",
        res.notified > 0 ? `Đã đăng thông báo và gửi tới hộp thư của ${res.notified} thành viên.` : "Đã đăng thông báo lên bảng tin."
      );
      closeModal();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
      <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Đăng Thông Báo Mới</h3>
          <p className="text-xs text-gray-500">Thông báo sẽ được gửi tới bảng tin của đối tượng nhận</p>
        </div>
        <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <CustomInput
            label="Tiêu đề thông báo *"
            required
            minLength={3}
            maxLength={200}
            value={annTitle}
            onChange={(e) => setAnnTitle(e.target.value)}
            placeholder="Tiêu đề ngắn gọn, rõ ràng..."
          />

          <CustomSelect
            label="Chuyên mục"
            value={annCategory}
            onChange={setAnnCategory}
            placeholder="Chọn chuyên mục..."
            options={meta.categories.map((c) => ({ value: c.id, label: c.label, subLabel: c.name, icon: c.icon }))}
          />

          <CustomTextarea
            label="Nội dung chi tiết *"
            required
            maxLength={20000}
            value={annContent}
            onChange={(e) => setAnnContent(e.target.value)}
            rows={4}
            placeholder="Nội dung thông báo tới toàn thể anh em..."
          />
          <AiSuggestButton
            task="community.minutes"
            label="AI soạn gọn từ ý chính"
            getInput={() => {
              if (annContent.trim().length < 20) {
                showToast("warning", "Gõ vài ý chính (ít nhất 20 ký tự) vào ô nội dung để AI soạn thành bản tin.");
                return null;
              }
              return { notes: annContent.trim(), kind: "weekly_digest" };
            }}
            onResult={(r) => setDigest(r)}
          />
          {digest && (
            <div className="p-3 rounded-2xl bg-violet-50/60 border border-violet-100 text-xs text-gray-700 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <AiLabel result={digest} />
                <button type="button" onClick={() => setDigest(null)} className="text-[10px] font-bold text-gray-400 hover:text-gray-600">Ẩn</button>
              </div>
              <p className="whitespace-pre-wrap">{digest.output.summary}</p>
              {digest.output.decisions.length > 0 && (
                <ul className="list-disc pl-4 space-y-0.5">
                  {digest.output.decisions.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
              {digest.output.actions.length > 0 && (
                <ul className="list-disc pl-4 space-y-0.5 text-gray-600">
                  {digest.output.actions.map((a, i) => <li key={i}>{a.task}{a.owner ? ` — ${a.owner}` : ""}</li>)}
                </ul>
              )}
              <button
                type="button"
                onClick={() => {
                  const o = digest.output;
                  const parts = [
                    o.summary,
                    o.decisions.map((d) => `• ${d}`).join("\n"),
                    o.actions.length ? "Việc cần làm:\n" + o.actions.map((x) => `• ${x.task}${x.owner ? ` (${x.owner})` : ""}`).join("\n") : "",
                  ];
                  setAnnContent(parts.filter(Boolean).join("\n\n"));
                  setDigest(null);
                }}
                className="self-start px-3 py-1.5 rounded-lg bg-white border border-violet-200 text-violet-700 font-bold hover:bg-violet-100"
              >
                Thay vào nội dung (bạn vẫn chỉnh được)
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CustomSelect label="Gửi tới" value={audience} onChange={setAudience} options={AUDIENCE_OPTIONS} />
            {audience !== "all" && (
              <CustomSelect label="Đối tượng" value={targetId} onChange={setTargetId} placeholder="Chọn..." options={targetOptions} />
            )}
          </div>

          {(selectedCat?.code === "ANN_EVENT" || eventId) && meta.events.length > 0 && (
            <CustomSelect
              label="Liên kết sự kiện (nút “Tôi sẽ có mặt”)"
              value={eventId}
              onChange={setEventId}
              options={[
                { value: "", label: "Không liên kết sự kiện" },
                ...meta.events.map((ev) => ({ value: ev.id, label: ev.title, subLabel: formatDateTime(ev.startsAt) })),
              ]}
            />
          )}

          <ImageUploadDropzone
            label="Tệp đính kèm (tùy chọn)"
            bucket="attachments"
            allowPdf
            value={fileId}
            onChange={setFileId}
            placeholder="Kéo thả tệp PDF hoặc ảnh kế hoạch, danh sách… vào đây"
          />

          {(canPin || canNotify) && (
            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3 space-y-2">
              {canPin && (
                <CustomToggle checked={pinned} onChange={setPinned} label="Ghim lên đầu bảng tin" description="Tự bỏ ghim sau 14 ngày" />
              )}
              {canPin && (
                <CustomToggle
                  checked={requiresAck}
                  onChange={setRequiresAck}
                  label="Yêu cầu xác nhận đã đọc"
                  description="Thành viên phải bấm “Xác nhận đã đọc” trước hạn"
                />
              )}
              {canPin && requiresAck && (
                <CustomDatePicker label="Hạn xác nhận" value={ackDate} onChange={setAckDate} format="YYYY-MM-DD" />
              )}
              {canNotify && (
                <CustomToggle
                  checked={notify}
                  onChange={setNotify}
                  label="Gửi vào hộp thư thành viên"
                  description="Mỗi người nhận một thông báo trong ứng dụng"
                />
              )}
            </div>
          )}
        </div>

        <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
          <button
            type="button"
            onClick={closeModal}
            className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-60"
          >
            {saving ? "Đang đăng…" : "Đăng thông báo"}
          </button>
        </div>
      </form>
    </div>
  );
}
