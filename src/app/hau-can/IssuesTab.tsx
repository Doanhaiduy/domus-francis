"use client";
// Tab "Báo hỏng & Sự cố": danh sách sự cố từ DB, chi tiết (ảnh, SLA, người phụ trách, dự toán/chi phí, nhật ký trạng thái),
// tiếp nhận/phân công/chờ vật tư/xong/mở lại (issue.triage|issue.resolve), dự toán (issue.cost.propose), hủy & xác nhận của người báo.
import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, History, Loader2, Plus, Trash2, UserCheck, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { formatVND } from "@/lib/utils";
import { CustomInput, CustomSelect, CustomTextarea, ImageUploadDropzone, previewUrl } from "@/components/ui/FormControls";
import { issuesApi, refreshIssues } from "@/lib/data/duty";
import { ISSUE_STATUS_CLASS, ISSUE_STATUS_LABEL, URGENCY_CLASS, URGENCY_LABEL, isOpenIssue, vnStamp, vnToday } from "@/lib/duty-format";
import type { IssueDto, IssueStatus, IssueUrgency } from "@/lib/types/duty";
import { Lightbox, ModalShell } from "./ui";

export default function IssuesTab({ issues, loadedAt, loading }: { issues: IssueDto[]; loadedAt: string | null; loading: boolean }) {
  const { members, showToast } = useApp();
  const { can, session } = useSession();
  const me = session?.member?.id ?? null;
  const today = vnToday();
  const [showClosed, setShowClosed] = useState(true);
  const visible = useMemo(() => issues.filter((i) => showClosed || isOpenIssue(i.status)), [issues, showClosed]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = visible.find((i) => i.id === selectedId) ?? visible[0] ?? null;

  const canTriage = can("issue.triage");
  const canResolve = can(["issue.triage", "issue.resolve"]);
  const canCost = can("issue.cost.propose");

  const [busy, setBusy] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string): Promise<boolean> => {
    setBusy(key);
    try {
      await fn();
      await refreshIssues();
      showToast("success", ok);
      return true;
    } catch (e) {
      showToast("error", errorMessage(e));
      await refreshIssues();
      return false;
    } finally {
      setBusy(null);
    }
  };

  const takeOver = (i: IssueDto) =>
    run(
      "take",
      async () => {
        if (!me) throw new Error("Tài khoản chưa gắn hồ sơ thành viên.");
        await issuesApi.assign(i.id, me, "Tự nhận xử lý");
        if (i.status === "new") await issuesApi.update(i.id, { status: "in_progress", reason: "Đã tiếp nhận xử lý" });
      },
      `Bạn đã nhận xử lý ${i.code}.`
    );
  const setStatus = (i: IssueDto, status: IssueStatus, reason: string, ok: string) => run(status, () => issuesApi.update(i.id, { status, reason }), ok);

  const lead = selected?.assignees.find((a) => a.roleLabel === "lead") ?? selected?.assignees[0] ?? null;
  const iAmLead = !!lead && lead.memberId === me;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* ISSUE LIST (7 COLS) */}
      <div className="lg:col-span-7 bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100 gap-2">
          <h2 className="text-base font-bold text-gray-900">Danh sách sự cố &amp; sửa chữa</h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="rounded accent-primary" />
              Hiện cả đã xong/hủy
            </label>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              {loadedAt ? `Cập nhật lúc ${loadedAt}` : ""}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {visible.map((i) => {
            const isSelected = i.id === selected?.id;
            return (
              <div
                key={i.id}
                onClick={() => setSelectedId(i.id)}
                className={`p-4 rounded-2xl cursor-pointer transition border ${
                  isSelected ? "bg-purple-50/70 border-primary shadow-xs" : "bg-surface-container-low/50 hover:bg-surface-container-low border-transparent"
                }`}
              >
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ISSUE_STATUS_CLASS[i.status]}`}>{ISSUE_STATUS_LABEL[i.status]}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${URGENCY_CLASS[i.urgency]}`}>{URGENCY_LABEL[i.urgency].split(" (")[0]}</span>
                    <span className="text-[11px] font-mono text-gray-400">#{i.code}</span>
                    {i.isOverdue && <span className="text-[10px] font-bold text-rose-600">⏰ Quá hạn</span>}
                  </div>
                  <span className="text-[11px] text-gray-400 shrink-0">{vnStamp(i.createdAt, today)}</span>
                </div>
                <h3 className="text-sm font-bold text-gray-900">{i.title}</h3>
                {i.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{i.description}</p>}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-purple-50 text-xs text-gray-400 gap-2">
                  <span className="truncate">
                    Vị trí: <b>{i.location}</b>
                  </span>
                  <span className="shrink-0">
                    Báo bởi:{" "}
                    <b>
                      {i.isMine ? "Bạn" : i.reporter.name}
                      {i.reporter.roomCode ? ` (${i.reporter.roomCode})` : ""}
                    </b>
                  </span>
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <div className="p-10 text-center text-xs text-gray-500">
              <span className="text-3xl block mb-2">🔧</span>
              Chưa có sự cố nào{showClosed ? "" : " đang mở"}.
            </div>
          )}
        </div>
      </div>

      {/* ISSUE DETAIL VIEW (5 COLS) */}
      {selected && (
        <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${ISSUE_STATUS_CLASS[selected.status]}`}>
              {ISSUE_STATUS_LABEL[selected.status]} #{selected.code}
            </span>
            <span className="text-xs text-gray-400">{vnStamp(selected.createdAt, today)}</span>
          </div>

          <div>
            <h3 className="text-lg font-bold text-gray-900">{selected.title}</h3>
            {selected.description && <p className="text-xs text-gray-600 mt-2 leading-relaxed">{selected.description}</p>}
          </div>

          {selected.photos.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {selected.photos.map((p) => (
                <button
                  key={p.fileId}
                  onClick={() => setLightbox({ url: previewUrl(p.fileId, "medium"), title: `${selected.code} · ${p.purpose === "after_photo" ? "Sau sửa" : "Hiện trạng"}` })}
                  className="relative"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl(p.fileId, "thumb")} alt="Ảnh sự cố" className="w-16 h-16 rounded-xl object-cover border border-purple-200 hover:opacity-80" />
                  <span className="absolute bottom-0.5 left-0.5 px-1 rounded bg-black/60 text-white text-[9px]">{p.purpose === "after_photo" ? "Sau" : "Trước"}</span>
                </button>
              ))}
            </div>
          )}

          {/* INFO TABLE */}
          <div className="p-3.5 rounded-2xl bg-surface-container-low/70 text-xs space-y-2">
            <div className="flex justify-between gap-2">
              <span className="text-gray-400">Vị trí:</span>
              <span className="font-bold text-gray-900 text-right">{selected.location}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Người báo:</span>
              <span className="font-bold text-gray-900">
                {selected.reporter.fullName}
                {selected.reporter.roomCode ? ` (${selected.reporter.roomCode})` : ""}
              </span>
            </div>
            {selected.categoryName && (
              <div className="flex justify-between">
                <span className="text-gray-400">Loại sự cố:</span>
                <span className="font-bold text-gray-900">{selected.categoryName}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Mức khẩn:</span>
              {canTriage && isOpenIssue(selected.status) ? (
                <select
                  value={selected.urgency}
                  onChange={(e) => run("urgency", () => issuesApi.update(selected.id, { urgency: e.target.value as IssueUrgency }), "Đã cập nhật mức khẩn & hạn xử lý.")}
                  className="text-xs font-bold bg-white border border-gray-200 rounded-lg px-2 py-1"
                >
                  {(["low", "medium", "high", "critical"] as IssueUrgency[]).map((u) => (
                    <option key={u} value={u}>
                      {URGENCY_LABEL[u]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${URGENCY_CLASS[selected.urgency]}`}>{URGENCY_LABEL[selected.urgency]}</span>
              )}
            </div>
            {selected.slaDueAt && isOpenIssue(selected.status) && (
              <div className="flex justify-between">
                <span className="text-gray-400">Hạn xử lý (SLA):</span>
                <span className={`font-bold ${selected.isOverdue ? "text-rose-600" : "text-gray-900"}`}>
                  {vnStamp(selected.slaDueAt, today)}
                  {selected.isOverdue ? " · quá hạn" : ""}
                </span>
              </div>
            )}
            {selected.estimateTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Dự toán vật tư:</span>
                <span className="font-bold text-primary">{formatVND(selected.estimateTotal)}</span>
              </div>
            )}
            {selected.actualTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Chi phí thực (đã chi):</span>
                <span className="font-bold text-emerald-700">{formatVND(selected.actualTotal)}</span>
              </div>
            )}
            {lead && (
              <div className="flex justify-between gap-2">
                <span className="text-gray-400 shrink-0">Phụ trách:</span>
                <span className="font-bold text-secondary text-right">
                  {lead.memberId === me ? "Bạn" : lead.name}
                  {lead.note ? ` (${lead.note})` : ""}
                </span>
              </div>
            )}
            {selected.resolvedAt && (
              <div className="flex justify-between">
                <span className="text-gray-400">Sửa xong:</span>
                <span className="font-bold text-gray-900">{vnStamp(selected.resolvedAt, today)}</span>
              </div>
            )}
          </div>

          {selected.costs.length > 0 && (
            <div className="text-xs space-y-1">
              <p className="font-bold text-gray-700">Chi phí sửa chữa:</p>
              {selected.costs.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-gray-50 border border-gray-100">
                  <span className="truncate">
                    <span className={`mr-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${c.kind === "estimate" ? "bg-purple-100 text-primary" : "bg-emerald-100 text-emerald-700"}`}>
                      {c.kind === "estimate" ? "Dự toán" : "Thực chi"}
                    </span>
                    {c.description}
                  </span>
                  <span className="flex items-center gap-1 shrink-0 font-bold">
                    {formatVND(c.amount)}
                    {canCost && c.kind === "estimate" && isOpenIssue(selected.status) && (
                      <button
                        onClick={() => run(`cost:${c.id}`, () => issuesApi.deleteCost(selected.id, c.id), "Đã xóa dòng dự toán.")}
                        className="p-1 rounded text-gray-400 hover:text-rose-600"
                        title="Xóa dòng dự toán"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ACTION BUTTONS */}
          <div className="pt-2 flex flex-col gap-2">
            {isOpenIssue(selected.status) ? (
              <>
                {canTriage && !iAmLead && (
                  <button
                    onClick={() => takeOver(selected)}
                    disabled={!!busy}
                    className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-xs transition disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
                  >
                    {busy === "take" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-4 h-4" />} Nhận xử lý ca này
                  </button>
                )}
                {canTriage && iAmLead && selected.status === "new" && (
                  <button
                    onClick={() => setStatus(selected, "in_progress", "Bắt đầu xử lý", "Đã chuyển sang Đang xử lý.")}
                    disabled={!!busy}
                    className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-xs transition disabled:opacity-60"
                  >
                    Bắt đầu xử lý
                  </button>
                )}
                {canTriage && (
                  <button onClick={() => setAssignOpen(true)} className="w-full py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold transition">
                    {lead ? "Đổi người phụ trách…" : "Phân công người phụ trách…"}
                  </button>
                )}
                {canResolve && selected.status === "in_progress" && (
                  <button
                    onClick={() => setStatus(selected, "waiting_parts", "Chờ vật tư/thợ", "Đã chuyển sang Chờ vật tư/thợ.")}
                    disabled={!!busy}
                    className="w-full py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-800 text-xs font-bold transition disabled:opacity-60"
                  >
                    Chờ vật tư / thợ
                  </button>
                )}
                {canResolve && selected.status === "waiting_parts" && (
                  <button
                    onClick={() => setStatus(selected, "in_progress", "Đã có vật tư, tiếp tục xử lý", "Đã chuyển lại Đang xử lý.")}
                    disabled={!!busy}
                    className="w-full py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition disabled:opacity-60"
                  >
                    Đã có vật tư — tiếp tục xử lý
                  </button>
                )}
                {canResolve && selected.status !== "new" && (
                  <button
                    onClick={() => setDoneOpen(true)}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
                  >
                    Đánh dấu đã sửa xong
                  </button>
                )}
                {canCost && (
                  <button
                    onClick={() => setCostOpen(true)}
                    className="w-full py-2 rounded-xl bg-white border border-purple-200 hover:bg-purple-50 text-primary text-xs font-bold transition inline-flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm dự toán vật tư
                  </button>
                )}
                {selected.isMine && selected.status === "new" && !canResolve && (
                  <p className="text-[11px] text-gray-500 text-center">Ban Hậu Cần sẽ tiếp nhận phiếu của bạn sớm.</p>
                )}
                {(selected.isMine || canTriage) && (
                  <button
                    onClick={() => setStatus(selected, "cancelled", selected.isMine ? "Người báo hủy phiếu" : "Ban điều hành hủy phiếu", `Đã hủy phiếu ${selected.code}.`)}
                    disabled={!!busy}
                    className="w-full py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition disabled:opacity-60"
                  >
                    Hủy phiếu báo hỏng
                  </button>
                )}
              </>
            ) : selected.status === "done" ? (
              <>
                {selected.verifiedAt ? (
                  <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold text-center">
                    ✓ Sự cố này đã được sửa chữa và nghiệm thu hoàn tất!
                    <span className="block font-medium text-[11px] mt-0.5">
                      Xác nhận bởi {selected.verifiedByName ?? "—"} · {vnStamp(selected.verifiedAt, today)}
                    </span>
                  </div>
                ) : (selected.isMine || canResolve) ? (
                  <button
                    onClick={() => run("verify", () => issuesApi.verify(selected.id), "Đã xác nhận sửa chữa đạt yêu cầu.")}
                    disabled={!!busy}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Xác nhận đã sửa tốt
                  </button>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold text-center">✓ Đã sửa xong — chờ người báo xác nhận.</div>
                )}
                {canResolve && (
                  <button
                    onClick={() => setStatus(selected, "in_progress", "Mở lại: sự cố tái diễn", `Đã mở lại ${selected.code}.`)}
                    disabled={!!busy}
                    className="w-full py-2 rounded-xl text-amber-700 hover:bg-amber-50 text-xs font-bold transition disabled:opacity-60"
                  >
                    Mở lại (sự cố tái diễn)
                  </button>
                )}
              </>
            ) : (
              <div className="p-3 rounded-xl bg-gray-50 text-gray-600 text-xs font-bold text-center">Phiếu đã {ISSUE_STATUS_LABEL[selected.status].toLowerCase()}.</div>
            )}
          </div>

          {selected.history.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Nhật ký xử lý
              </p>
              <ol className="space-y-1.5">
                {selected.history.map((h, idx) => (
                  <li key={idx} className="text-[11px] text-gray-600 flex gap-2">
                    <Clock className="w-3 h-3 mt-0.5 text-gray-400 shrink-0" />
                    <span>
                      <b>{vnStamp(h.at, today)}</b> · {h.from ? `${ISSUE_STATUS_LABEL[h.from as IssueStatus] ?? h.from} → ` : ""}
                      {ISSUE_STATUS_LABEL[h.to as IssueStatus] ?? h.to}
                      {h.byName ? ` · ${h.byName}` : ""}
                      {h.reason ? ` — ${h.reason}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      <AssignIssueModal
        open={assignOpen}
        issue={selected}
        members={members.filter((m) => m.status === "active")}
        onClose={() => setAssignOpen(false)}
        onSubmit={(memberId, note) => run("assign", () => issuesApi.assign(selected!.id, memberId, note), "Đã phân công người phụ trách.").then((ok) => ok && setAssignOpen(false))}
        busy={busy === "assign"}
      />
      <CostModal
        open={costOpen}
        issue={selected}
        onClose={() => setCostOpen(false)}
        onSubmit={(amount, desc) => run("cost", () => issuesApi.addCost(selected!.id, amount, desc), "Đã thêm dự toán vật tư.").then((ok) => ok && setCostOpen(false))}
        busy={busy === "cost"}
      />
      <DoneModal
        open={doneOpen}
        issue={selected}
        onClose={() => setDoneOpen(false)}
        onSubmit={(note, fileId) =>
          run(
            "done",
            async () => {
              if (fileId) await issuesApi.addPhoto(selected!.id, fileId, "after_photo");
              await issuesApi.update(selected!.id, { status: "done", reason: note || "Đã sửa xong" });
            },
            `Đã đánh dấu ${selected?.code} sửa xong — chờ người báo xác nhận.`
          ).then((ok) => ok && setDoneOpen(false))
        }
        busy={busy === "done"}
      />
      <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

function AssignIssueModal({
  open,
  issue,
  members,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  issue: IssueDto | null;
  members: { id: string; fullName: string; room: string; role: string }[];
  onClose: () => void;
  onSubmit: (memberId: string, note: string | null) => void;
  busy: boolean;
}) {
  const [memberId, setMemberId] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open || !issue) return;
    const lead = issue.assignees.find((a) => a.roleLabel === "lead");
    setMemberId(lead?.memberId ?? "");
    setNote(lead?.note ?? "");
  }, [open, issue]);
  if (!open || !issue) return null;
  return (
    <ModalShell open onClose={onClose} icon={<UserCheck className="w-5 h-5" />} title="Phân Công Người Phụ Trách" subtitle={`${issue.code} · ${issue.title}`}>
      <div className="p-5 space-y-4">
        <CustomSelect
          label="Người phụ trách chính:"
          value={memberId}
          onChange={setMemberId}
          options={[{ value: "", label: "— Chọn thành viên —" }, ...members.map((m) => ({ value: m.id, label: m.fullName, subLabel: `${m.role} · ${m.room}` }))]}
        />
        <CustomInput label="Ghi chú tiến độ (tùy chọn):" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Đã khảo sát, đang mua gioăng 21mm" />
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">
            Hủy
          </button>
          <button
            onClick={() => memberId && onSubmit(memberId, note.trim() || null)}
            disabled={!memberId || busy}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 transition disabled:opacity-60"
          >
            Lưu phân công
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function CostModal({
  open,
  issue,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  issue: IssueDto | null;
  onClose: () => void;
  onSubmit: (amount: number, description: string) => void;
  busy: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  useEffect(() => {
    if (open) {
      setAmount("");
      setDesc("");
    }
  }, [open]);
  if (!open || !issue) return null;
  const n = Number(amount.replace(/\D/g, ""));
  return (
    <ModalShell open onClose={onClose} icon="💰" title="Dự Toán Vật Tư Sửa Chữa" subtitle={`${issue.code} · ${issue.title}`}>
      <div className="p-5 space-y-4">
        <CustomInput
          label="Số tiền dự toán (đồng) *"
          inputMode="numeric"
          value={amount ? Number(amount.replace(/\D/g, "")).toLocaleString("vi-VN") : ""}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          placeholder="Ví dụ: 120.000"
          rightSuffix="đ"
        />
        <CustomInput label="Nội dung *" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ví dụ: Bóng LED tuýp 1m2 + tăng phô" />
        <p className="text-[11px] text-gray-500">Chi phí thực được ghi tự động khi phiếu chi gắn sự cố này được Thủ quỹ chi (phân hệ Thu chi).</p>
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">
            Hủy
          </button>
          <button
            onClick={() => onSubmit(n, desc.trim())}
            disabled={busy || n < 1000 || desc.trim().length < 3}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 transition disabled:opacity-60"
          >
            Thêm dự toán
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function DoneModal({
  open,
  issue,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  issue: IssueDto | null;
  onClose: () => void;
  onSubmit: (note: string, fileId: string | null) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const [fileId, setFileId] = useState("");
  useEffect(() => {
    if (open) {
      setNote("Đã sửa xong, thiết bị hoạt động bình thường.");
      setFileId("");
    }
  }, [open]);
  if (!open || !issue) return null;
  return (
    <ModalShell
      open
      onClose={onClose}
      icon={<CheckCircle2 className="w-5 h-5" />}
      iconClass="bg-emerald-600 text-white"
      headerClass="bg-emerald-50/60"
      title="Hoàn Tất Sửa Chữa"
      subtitle={`${issue.code} · ${issue.title}`}
    >
      <div className="p-5 space-y-4">
        <CustomTextarea label="Kết quả xử lý:" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <ImageUploadDropzone bucket="maintenance" label="Ảnh sau sửa chữa (tùy chọn)" value={fileId} onChange={setFileId} helperText="Giúp người báo kiểm tra trước khi xác nhận" />
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">
            <X className="w-3.5 h-3.5 inline" /> Hủy
          </button>
          <button
            onClick={() => onSubmit(note.trim(), fileId || null)}
            disabled={busy}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-200 transition disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Đánh dấu đã sửa xong
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
