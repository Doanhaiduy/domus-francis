"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, MessageSquareText, ShieldCheck, UserX } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { dataRequestsApi, useDataRequests } from "@/lib/data/data-requests";
import {
  DATA_REQUEST_DUE_HOURS,
  DATA_REQUEST_STATUSES,
  DATA_REQUEST_STATUS_LABEL,
  type DataRequestDto,
  type DataRequestStatus,
} from "@/lib/types/data-requests";
import { CustomInput, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { DsrDueBadge, DsrStatusChip, DsrTypeChip, fmtDateTime } from "@/components/privacy/DataRequestBits";
import { PrivacyDialog, dlgBtnDanger, dlgBtnGhost } from "@/components/privacy/PrivacyDialog";
import { cn } from "@/lib/utils";

// Trang Thành viên → tab "Yêu cầu dữ liệu" (người có privacy.manage: Trưởng nhà, Admin): mọi yêu cầu về dữ liệu cá nhân của thành viên —
// còn mở / quá hạn 72 giờ trước; đổi trạng thái + trả lời (người gửi nhận thông báo); yêu cầu XÓA của người đã rời nhà ⇒ ẩn danh hóa hồ sơ
// (gõ lại họ tên để xác nhận). Mở thẳng một yêu cầu: /thanh-vien?tab=data-requests&request=<id> (liên kết trong thông báo).

type Filter = "open" | "overdue" | "done" | "all";

const MEMBER_STATUS_LABEL: Record<string, string> = { active: "Đang ở", on_leave: "Tạm vắng", alumni: "Cựu thành viên", left: "Đã rời nhà" };

export default function DataRequestsPanel() {
  const { data, isLoading } = useDataRequests();
  const [filter, setFilter] = useState<Filter>("open");
  const [focusId, setFocusId] = useState<string | null>(null);
  const all = useMemo(() => data?.all ?? [], [data]);

  // Mở từ thông báo: ?request=<id> ⇒ hiện cả yêu cầu đã đóng + cuộn tới
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("request");
    if (id) setFocusId(id);
  }, []);
  useEffect(() => {
    if (!focusId || !all.length) return;
    const it = all.find((r) => r.id === focusId);
    if (it && it.status !== "received" && it.status !== "in_progress") setFilter("all");
    const t = setTimeout(() => document.getElementById(`dsr-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    return () => clearTimeout(t);
  }, [focusId, all]);

  const isOpen = (r: DataRequestDto) => r.status === "received" || r.status === "in_progress";
  const shown = all.filter((r) => (filter === "open" ? isOpen(r) : filter === "overdue" ? r.overdue : filter === "done" ? !isOpen(r) : true));
  const counts: Record<Filter, number> = {
    open: all.filter(isOpen).length,
    overdue: all.filter((r) => r.overdue).length,
    done: all.filter((r) => !isOpen(r)).length,
    all: all.length,
  };

  if (isLoading) return <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="shimmer-box h-32 rounded-2xl" />)}</div>;
  if (!data?.canManage) {
    return <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-10 text-center text-sm text-gray-500">Chỉ người quản lý (Trưởng nhà, Admin) xem được yêu cầu về dữ liệu cá nhân.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-4 flex gap-3 text-xs text-gray-700 leading-relaxed">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-1">
          <p>
            Thành viên gửi yêu cầu về dữ liệu cá nhân của mình (xem, sửa, xóa, rút đồng ý…) theo Luật Bảo vệ dữ liệu cá nhân. Hãy <b>phản hồi trong {DATA_REQUEST_DUE_HOURS} giờ</b>{" "}
            (đổi sang “Đang xử lý” và trả lời), xác minh đúng người trước khi thực hiện việc xóa, và nêu rõ lý do nếu không thể thực hiện.
          </p>
          <p className="text-gray-500">
            Sửa thông tin: mở hồ sơ thành viên ở tab Danh bạ. Xóa dữ liệu của người đã rời nhà: nút “Ẩn danh hóa hồ sơ” bên dưới (sổ quỹ và chứng từ vẫn giữ).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc yêu cầu">
        {(
          [
            ["open", "Đang mở"],
            ["overdue", "Quá hạn"],
            ["done", "Đã đóng"],
            ["all", "Tất cả"],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className={cn(
              "px-3 py-1 rounded-full text-[11px] font-bold border transition",
              filter === k ? (k === "overdue" ? "bg-rose-600 text-white border-rose-600" : "bg-primary text-white border-primary") : "bg-white text-gray-600 border-gray-200 hover:border-purple-300",
            )}
          >
            {label} <span className={filter === k ? "text-white/80" : k === "overdue" && counts.overdue ? "text-rose-600" : "text-gray-400"}>{counts[k]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-10 text-center">
          <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-3" aria-hidden />
          <p className="font-bold text-gray-900">{filter === "open" ? "Không có yêu cầu nào đang chờ 🎉" : "Không có yêu cầu nào ở mục này"}</p>
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2 items-start">
          {shown.map((r) => (
            <RequestItem key={r.id} item={r} highlight={r.id === focusId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestItem({ item: r, highlight }: { item: DataRequestDto; highlight: boolean }) {
  const { showToast } = useApp();
  const [status, setStatus] = useState<DataRequestStatus>(r.status);
  const [note, setNote] = useState(r.resolutionNote ?? "");
  const [busy, setBusy] = useState(false);
  const [anon, setAnon] = useState(false);

  useEffect(() => {
    setStatus(r.status);
    setNote(r.resolutionNote ?? "");
  }, [r.status, r.resolutionNote]);

  const dirty = status !== r.status || note.trim() !== (r.resolutionNote ?? "");
  const closing = status === "completed" || status === "rejected";

  const save = async () => {
    if (closing && note.trim().length < 5) {
      showToast("error", status === "rejected" ? "Hãy nêu lý do không thể thực hiện (tối thiểu 5 ký tự)." : "Hãy ghi kết quả xử lý (tối thiểu 5 ký tự) để người gửi biết.");
      return;
    }
    setBusy(true);
    try {
      await dataRequestsApi.update(r.id, {
        status: status !== r.status ? status : undefined,
        resolutionNote: note.trim() !== (r.resolutionNote ?? "") ? note.trim() || null : undefined,
      });
      showToast("success", "Đã lưu và báo cho người gửi.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const m = r.member;
  const canAnonymize = !!m && !m.anonymized && (m.status === "left" || m.status === "alumni") && (r.status === "received" || r.status === "in_progress");

  return (
    <li
      id={`dsr-${r.id}`}
      className={cn(
        "bg-white border rounded-2xl p-4 sm:p-5 space-y-3 scroll-mt-24",
        r.overdue ? "border-rose-300" : r.status === "received" ? "border-amber-200" : "border-purple-100",
        highlight && "ring-2 ring-purple-300",
        busy && "opacity-60 pointer-events-none",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <DsrTypeChip type={r.type} />
        <DsrStatusChip status={r.status} />
        <DsrDueBadge item={r} />
        <span className="text-[11px] text-gray-400 ml-auto">{fmtDateTime(r.receivedAt)}</span>
      </div>

      {m && (
        <p className="text-xs text-gray-600 flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="text-gray-900">{m.name}</b>
          <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold", m.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600")}>
            {m.anonymized ? "Đã ẩn danh" : (MEMBER_STATUS_LABEL[m.status] ?? m.status)}
          </span>
        </p>
      )}

      {r.details ? (
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{r.details}</p>
      ) : (
        <p className="text-xs text-gray-400 italic">Không có mô tả thêm.</p>
      )}

      <div className="rounded-2xl bg-gray-50/70 border border-gray-100 p-3 space-y-3">
        <CustomSelect<DataRequestStatus>
          label="Trạng thái"
          value={status}
          onChange={setStatus}
          options={DATA_REQUEST_STATUSES.map((s) => ({ value: s, label: DATA_REQUEST_STATUS_LABEL[s] }))}
        />
        <CustomTextarea
          label={closing ? "Trả lời / kết quả xử lý (người gửi sẽ thấy) *" : "Trả lời (người gửi sẽ thấy)"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={
            status === "rejected"
              ? "Nêu rõ lý do, vd. sổ quỹ là chứng từ bắt buộc lưu giữ nên không xóa được."
              : "VD: Đã sửa ngày vào nhà thành 09/2024 theo yêu cầu của bạn."
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {r.handledByName ? (
            <p className="text-[11px] text-gray-400 inline-flex items-center gap-1">
              <MessageSquareText className="w-3.5 h-3.5" aria-hidden /> {r.handledByName}
              {r.completedAt ? ` · đóng ${fmtDateTime(r.completedAt)}` : ""}
            </p>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {canAnonymize && (
              <button
                type="button"
                onClick={() => setAnon(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold transition"
              >
                <UserX className="w-3.5 h-3.5" /> Ẩn danh hóa hồ sơ…
              </button>
            )}
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={save}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container transition active:scale-95 disabled:opacity-50"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Lưu &amp; báo người gửi
            </button>
          </div>
        </div>
        {r.type === "erasure" && m && m.status !== "left" && m.status !== "alumni" && !m.anonymized && (r.status === "received" || r.status === "in_progress") && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-2.5 py-2 leading-relaxed">
            Thành viên còn đang ở nhà: dữ liệu cần cho sinh hoạt chung chưa xóa được. Có thể xóa phần không bắt buộc (vd. hồ sơ Công giáo — chính chủ tự rút đồng ý),
            hoặc ẩn danh hóa sau khi chuyển trạng thái “Rời nhà”.
          </p>
        )}
      </div>

      {canAnonymize && <AnonymizeDialog open={anon} onClose={() => setAnon(false)} item={r} />}
    </li>
  );
}

function AnonymizeDialog({ open, onClose, item }: { open: boolean; onClose: () => void; item: DataRequestDto }) {
  const { showToast } = useApp();
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = item.member?.name ?? "";

  useEffect(() => {
    if (open) {
      setConfirmName("");
      setReason(item.type === "erasure" ? "Thành viên đã rời nhà yêu cầu xóa dữ liệu cá nhân" : "");
      setError(null);
    }
  }, [open, item.type]);

  const norm = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  const matches = !!name && norm(confirmName) === norm(name);

  const submit = async () => {
    setError(null);
    if (!matches) return setError("Họ tên gõ lại chưa khớp với hồ sơ.");
    if (reason.trim().length < 10) return setError("Ghi căn cứ ẩn danh hóa (tối thiểu 10 ký tự).");
    setBusy(true);
    try {
      await dataRequestsApi.anonymize(item.id, { confirmName, reason: reason.trim() });
      showToast("success", `Đã ẩn danh hóa hồ sơ ${name} và đóng yêu cầu.`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PrivacyDialog
      open={open}
      onClose={() => !busy && onClose()}
      tone="danger"
      icon={<UserX className="w-5 h-5" />}
      title="Ẩn danh hóa hồ sơ"
      subtitle={name}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={dlgBtnGhost}>
            Hủy
          </button>
          <button type="button" onClick={submit} disabled={busy || !matches} className={dlgBtnDanger}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />} {busy ? "Đang ẩn danh hóa…" : "Ẩn danh hóa vĩnh viễn"}
          </button>
        </>
      }
    >
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900 leading-relaxed space-y-1.5">
        <p className="font-bold">Không hoàn tác được. Hệ thống sẽ:</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Thay họ tên bằng “[Đã ẩn danh]”, xóa SĐT, email liên hệ, ảnh đại diện, ngày sinh, quê quán, địa chỉ, CCCD, thông tin cha mẹ/người giám hộ.</li>
          <li>Xóa hồ sơ Công giáo, Bí tích, tài khoản nhận tiền, hồ sơ cựu thành viên, mã sinh viên, ảnh điểm danh / check-in, thông báo.</li>
          <li>Khóa tài khoản đăng nhập, xóa xác thực 2 bước và thiết bị nhận thông báo.</li>
        </ul>
        <p>
          <b>Vẫn giữ</b> (không định danh): sổ quỹ, phiếu thu/chi, khoản đóng, lịch sử điểm danh/trực ở dạng số liệu, bằng chứng đồng ý và yêu cầu này. Yêu cầu sẽ được đóng ở
          trạng thái “Đã hoàn tất”.
        </p>
      </div>
      <CustomInput
        label={`Gõ lại họ tên để xác nhận: ${name}`}
        value={confirmName}
        onChange={(e) => setConfirmName(e.target.value)}
        placeholder={name}
        autoComplete="off"
        error={confirmName && !matches ? "Chưa khớp họ tên trong hồ sơ." : undefined}
      />
      <CustomTextarea label="Căn cứ (lưu vào nhật ký kiểm toán)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={400} />
      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
    </PrivacyDialog>
  );
}
