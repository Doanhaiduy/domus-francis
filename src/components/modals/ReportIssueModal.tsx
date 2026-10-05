"use client";

// Báo hỏng thiết bị & cơ sở — ghi maintenance_issues (mức khẩn ⇒ hạn SLA), ảnh hiện trạng gắn media_attachments (before_photo, bucket maintenance).
import React, { useMemo, useState } from "react";
import { X, AlertTriangle, Loader2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { CustomInput, CustomSelect, CustomTextarea, ImageUploadDropzone, type SelectOption } from "@/components/ui/FormControls";
import { issuesApi, refreshIssues, useIssues } from "@/lib/data/duty";
import { URGENCY_LABEL } from "@/lib/duty-format";
import type { IssueUrgency } from "@/lib/types/duty";
import type { AiResultDto } from "@/lib/types/ai";
import { AiLabel, AiSuggestButton } from "@/components/ai/AiParts";

const OTHER = "__other__";

export default function ReportIssueModal() {
  const { closeModal, rooms, floors, showToast } = useApp();
  const { can, session } = useSession();
  const { areas, categories } = useIssues();

  const [issueTitle, setIssueTitle] = useState("");
  const [issueLocation, setIssueLocation] = useState("");
  const [otherLocation, setOtherLocation] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [issueUrgency, setIssueUrgency] = useState<IssueUrgency>("medium");
  const [categoryId, setCategoryId] = useState("");
  const [issuePhoto, setIssuePhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [triage, setTriage] = useState<AiResultDto<"facility.issue_triage"> | null>(null);

  const floorName = (level: number) => floors.find((f) => f.id === level)?.name ?? `Tầng ${level}`;
  const locationOptions: SelectOption[] = useMemo(() => {
    const myRoom = session?.member?.roomCode;
    const roomOpts = [...rooms]
      .sort((a, b) => (a.id === myRoom ? -1 : b.id === myRoom ? 1 : a.floor - b.floor || a.id.localeCompare(b.id)))
      .map((r) => ({ value: `room:${r.id}`, label: `${r.name}${r.id === myRoom ? " (phòng của bạn)" : ""}`, subLabel: floorName(r.floor) }));
    const areaOpts = areas.map((a) => ({ value: `area:${a.name}`, label: `${a.icon} ${a.name}`, subLabel: "Khu vực chung" }));
    return [{ value: "", label: "— Chọn vị trí —" }, ...roomOpts, ...areaOpts, { value: OTHER, label: "Vị trí khác (ghi rõ)…" }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, areas, floors, session?.member?.roomCode]);

  const allowed = can("issue.create");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueTitle.trim()) return;
    if (!issueLocation || (issueLocation === OTHER && !otherLocation.trim())) {
      showToast("warning", "Chọn hoặc ghi rõ vị trí xảy ra sự cố.");
      return;
    }
    setBusy(true);
    try {
      const roomCode = issueLocation.startsWith("room:") ? issueLocation.slice(5) : null;
      const locationText = issueLocation.startsWith("area:") ? issueLocation.slice(5) : issueLocation === OTHER ? otherLocation.trim() : null;
      const r = await issuesApi.create({
        title: issueTitle.trim(),
        description: issueDesc.trim() || null,
        roomCode,
        locationText,
        urgency: issueUrgency,
        categoryId: categoryId || null,
        photoFileId: issuePhoto || null,
      });
      await refreshIssues();
      showToast("success", `Đã gửi báo hỏng ${r.code} — Ban Hậu Cần sẽ tiếp nhận sớm.`);
      setIssueTitle("");
      setIssueDesc("");
      setIssuePhoto("");
      closeModal();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
      <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Báo Hỏng Thiết Bị &amp; Cơ Sở</h3>
            <p className="text-xs text-gray-500">Ban Hậu Cần sẽ tiếp nhận và tiến hành khảo sát sửa chữa</p>
          </div>
        </div>
        <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100" aria-label="Đóng">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {!allowed && (
            <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">Tài khoản của bạn chưa có quyền báo hỏng.</p>
          )}
          <CustomInput
            label="Tên sự cố thiết bị *"
            required
            value={issueTitle}
            onChange={(e) => setIssueTitle(e.target.value)}
            placeholder="Ví dụ: Vòi nước rỉ, Bóng đèn phòng cháy, Quạt trần kêu to..."
          />

          <div className="grid grid-cols-2 gap-3">
            <CustomSelect label="Vị trí khu vực *" value={issueLocation} onChange={setIssueLocation} options={locationOptions} />
            <CustomSelect
              label="Mức độ khẩn cấp"
              value={issueUrgency}
              onChange={(v) => setIssueUrgency(v as IssueUrgency)}
              options={(["medium", "high", "critical", "low"] as IssueUrgency[]).map((u) => ({ value: u, label: URGENCY_LABEL[u] }))}
            />
          </div>

          <AiSuggestButton
            task="facility.issue_triage"
            label="AI gợi ý mức khẩn & kiểm tra báo trùng"
            getInput={() => {
              if (issueTitle.trim().length < 3) {
                showToast("warning", "Nhập tên sự cố (ít nhất 3 ký tự) để AI phân loại.");
                return null;
              }
              const loc = issueLocation.startsWith("room:") ? `Phòng ${issueLocation.slice(5)}` : issueLocation.startsWith("area:") ? issueLocation.slice(5) : otherLocation;
              return { title: issueTitle.trim(), description: issueDesc.trim() || undefined, location: loc || undefined };
            }}
            onResult={(r) => setTriage(r)}
          />
          {triage && (
            <div className="p-3 rounded-2xl bg-violet-50/60 border border-violet-100 text-xs text-gray-700 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <AiLabel result={triage} />
                <button type="button" onClick={() => setTriage(null)} className="text-[10px] font-bold text-gray-400 hover:text-gray-600">Ẩn</button>
              </div>
              <p>
                <b>Mức khẩn gợi ý:</b> {URGENCY_LABEL[triage.output.urgency]} · <b>Loại:</b> {triage.output.category}
              </p>
              <p className="text-gray-600">{triage.output.summary}{triage.output.rationale ? ` — ${triage.output.rationale}` : ""}</p>
              {triage.output.duplicateOf && (
                <p className="text-amber-700 font-semibold">Có thể trùng với sự cố đang mở: “{triage.output.duplicateOf.title}”.</p>
              )}
              <button
                type="button"
                onClick={() => setIssueUrgency(triage.output.urgency)}
                className="self-start px-3 py-1.5 rounded-lg bg-white border border-violet-200 text-violet-700 font-bold hover:bg-violet-100"
              >
                Dùng mức “{URGENCY_LABEL[triage.output.urgency]}”
              </button>
            </div>
          )}

          {issueLocation === OTHER && (
            <CustomInput
              label="Ghi rõ vị trí *"
              value={otherLocation}
              onChange={(e) => setOtherLocation(e.target.value)}
              placeholder="Ví dụ: Hành lang tầng 2, cạnh cửa phòng 5"
            />
          )}

          {categories.length > 0 && (
            <CustomSelect
              label="Loại sự cố (tùy chọn)"
              value={categoryId}
              onChange={setCategoryId}
              options={[{ value: "", label: "— Chưa phân loại —" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            />
          )}

          <ImageUploadDropzone
            bucket="maintenance"
            label="Ảnh chụp hiện trạng sự cố (Tùy chọn)"
            placeholder="Kéo thả ảnh hoặc nhấp để chọn tệp từ máy..."
            helperText="Chụp vị trí hỏng để ban hậu cần chuẩn bị dụng cụ thay thế (PNG, JPG)"
            value={issuePhoto}
            onChange={setIssuePhoto}
          />

          <CustomTextarea
            label="Mô tả hiện trạng"
            value={issueDesc}
            onChange={(e) => setIssueDesc(e.target.value)}
            rows={3}
            placeholder="Nêu rõ tình trạng hỏng hóc để anh em chuẩn bị sẵn dụng cụ thay thế..."
          />
        </div>

        <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
          <button type="button" onClick={closeModal} className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700">
            Hủy bỏ
          </button>
          <button
            type="submit"
            disabled={!allowed || busy || !issueTitle.trim()}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-md shadow-rose-200 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Gửi báo hỏng
          </button>
        </div>
      </form>
    </div>
  );
}
