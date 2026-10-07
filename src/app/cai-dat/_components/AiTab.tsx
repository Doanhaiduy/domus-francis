"use client";

// Quản trị AI (AIX-TASK / AIX-BUD / AIX-USE / AIX-GATE): công tắc tổng, nhà cung cấp (Groq mặc định → Gemini dự phòng),
// bật/tắt từng tác vụ, ngân sách tháng, chi phí và tỷ lệ gợi ý được chấp nhận. Khóa API chỉ nằm trong .env.local.
// Giao diện luôn hiện TÊN tiếng Việt; mã kỹ thuật (finance.dues_message…) chỉ còn trong tooltip.
import React, { useEffect, useState } from "react";
import { mutate as globalMutate } from "swr";
import { Sparkles, KeyRound, CheckCircle2, CircleSlash, PauseCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { useApp } from "@/lib/store";
import { ToggleListSkeleton } from "./TabSkeletons";
import { errorMessage } from "@/lib/api";
import { aiApi, refreshAi, useAiStatus, useAiUsage } from "@/lib/data/ai";
import { SETTINGS_KEY, settingsApi } from "@/lib/data/settings";
import { CustomToggle } from "@/components/ui/FormControls";
import { formatVND } from "@/lib/utils";
import type { AiTaskDto } from "@/lib/types/ai";

const CLASS_LABEL: Record<AiTaskDto["dataClass"], { text: string; cls: string; hint: string }> = {
  internal_ok: { text: "Dữ liệu nội bộ", cls: "bg-emerald-50 text-emerald-700", hint: "Nội dung công khai trong nhà (nội quy, thông báo, sự cố) — được phép gửi dịch vụ AI." },
  mask_required: { text: "Ẩn danh trước khi gửi", cls: "bg-amber-50 text-amber-700", hint: "Tên, email, số điện thoại… được che trước khi gửi dịch vụ AI." },
  never_external: { text: "Không gửi ra ngoài", cls: "bg-rose-50 text-rose-700", hint: "Dữ liệu nhạy cảm (điểm số, CCCD…) — tuyệt đối không gửi dịch vụ AI bên ngoài." },
};
const TECHNIQUE_LABEL: Record<string, string> = {
  llm: "Mô hình ngôn ngữ",
  rule_based: "Luật nội bộ",
  statistical: "Thống kê",
  ocr: "Đọc chữ từ ảnh",
  vision: "Phân tích ảnh",
  solver: "Thuật toán tối ưu",
  embedding: "Tìm kiếm ngữ nghĩa",
  speech: "Giọng nói",
};
/** Tên/mô tả thân thiện (bản gốc trong DB dùng thuật ngữ kỹ thuật). Mã lạ ⇒ dùng tên trong DB. */
const TASK_TEXT: Record<string, { name: string; desc: string }> = {
  "finance.receipt_ocr": { name: "Đọc hóa đơn từ ảnh", desc: "Đọc số tiền, ngày, nơi bán trên ảnh hóa đơn để điền sẵn phiếu chi; người tạo phiếu xác nhận lại." },
  "finance.anomaly_rules": { name: "Cảnh báo thu chi bất thường", desc: "Cảnh báo phiếu chi trùng, chi vượt mức thường lệ, lệch sao kê — chạy bằng luật nội bộ, không gửi đi đâu." },
  "finance.dues_message": { name: "Soạn tin nhắc đóng quỹ", desc: "Soạn lời nhắc đóng quỹ lịch sự để gửi nhóm; chỉ dùng số tiền và hạn nộp, không gửi tên ai." },
  "duty.photo_check": { name: "Kiểm tra ảnh trực nhật", desc: "Gợi ý ảnh minh chứng có đúng khu vực hay không; người nghiệm thu quyết định." },
  "duty.roster_solver": { name: "Gợi ý phân công trực nhật", desc: "Gợi ý lịch trực cân bằng, tránh ngày bận — chạy nội bộ." },
  "academic.transcript_ocr": { name: "Đọc bảng điểm từ ảnh", desc: "Điểm cá nhân là dữ liệu nhạy cảm nên chỉ được chạy trên máy chủ riêng, cần thành viên đồng ý." },
  "academic.risk_forecast": { name: "Cảnh báo sớm nguy cơ nợ môn", desc: "Phân tích điểm (khi thành viên đồng ý) để cảnh báo sớm — chạy nội bộ." },
  "community.policy_rag": { name: "Trợ lý Lưu Xá (hướng dẫn & hỏi đáp)", desc: "Hướng dẫn thao tác theo sách hướng dẫn của ứng dụng + trả lời từ nội quy, thông báo, lịch sự kiện; nhớ vài lượt trò chuyện, gợi ý mở đúng trang, luôn ghi nguồn, chỉ dùng nội dung người hỏi được xem." },
  "community.moderation": { name: "Soát nội dung trước khi đăng", desc: "Phát hiện lời lẽ xúc phạm hoặc lộ thông tin cá nhân; không gửi danh tính tác giả." },
  "facility.issue_triage": { name: "Phân loại & ưu tiên sự cố", desc: "Gợi ý mức khẩn, loại sự cố và cảnh báo báo hỏng trùng; Ban hậu cần xác nhận." },
  "community.minutes": { name: "Tóm tắt biên bản / bản tin", desc: "Tóm tắt ghi chú cuộc họp, soạn bản tin tuần từ các ý chính." },
  "finance.monthly_insight": {
    name: "Nhận xét thu chi theo tháng",
    desc: "Khi Thủ quỹ/người quản lý mở trang Thu chi, AI tóm tắt và so sánh thu chi tháng này với tháng trước. Chỉ gửi số liệu tổng hợp của quỹ, không tên người; số tiền do hệ thống tính.",
  },
  "academic.insight": {
    name: "Nhận xét kết quả học tập cá nhân",
    desc: "Nhận xét điểm của chính thành viên, so với năm học trước. Chỉ chạy khi người đó đồng ý; gửi điểm trung bình, tín chỉ, số môn đã ẩn danh — không tên, trường hay mã sinh viên.",
  },
  "academic.house_insight": {
    name: "Nhận xét học tập toàn nhà",
    desc: "Cho người quản lý: nhận xét tình hình học tập chung so với năm học trước, chỉ từ số liệu tổng hợp ẩn danh (học kỳ có từ 3 bảng điểm).",
  },
};
const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  queued: { text: "Đang chờ", cls: "text-gray-600" },
  running: { text: "Đang chạy", cls: "text-gray-600" },
  succeeded: { text: "Thành công", cls: "text-emerald-700" },
  failed: { text: "Lỗi", cls: "text-rose-600" },
  blocked: { text: "Bị chặn", cls: "text-rose-600" },
  cancelled: { text: "Đã hủy", cls: "text-gray-500" },
};
const PROVIDER_LABEL: Record<string, string> = { groq: "Groq", gemini: "Gemini", rule_based: "Luật nội bộ", local: "Nội bộ", self_hosted: "Máy chủ riêng" };
const CONSENT_LABEL: Record<string, string> = {
  ai_processing: "“Dùng AI xử lý nội dung do tôi tạo”",
  ai_academic: "“Dùng AI phân tích dữ liệu học tập”",
  academic_share_leadership: "“Chia sẻ bảng điểm cho người quản lý”",
  ai_academic_summary: "“Dùng AI nhận xét điểm học tập của tôi”",
};
/** Lý do chặn/lỗi từ máy chủ có thể chứa mã kỹ thuật (BR-AI-03, ai_processing, feature.ai.enabled…) ⇒ diễn đạt lại. */
function humanReason(s: string): string {
  return s
    .replace(/^BR-AI-\d+:\s*/, "")
    .replace(/\(settings feature\.ai\.enabled\)/, "")
    .replace(/mục đích ([a-z_]+)/g, (_, c: string) => `mục đích ${CONSENT_LABEL[c] ?? c}`)
    .replace(/tác vụ ([a-z][a-z0-9_]*\.[a-z0-9_.]+)/g, (_, c: string) => `tác vụ “${TASK_TEXT[c]?.name ?? c}”`)
    .replace(/\(ai_[a-z_]+\)/g, (m) => `(${CONSENT_LABEL[m.slice(1, -1)] ?? m.slice(1, -1)})`)
    .replace(/dữ liệu loại (internal_ok|mask_required|never_external)/, (_, c: AiTaskDto["dataClass"]) => `dữ liệu “${CLASS_LABEL[c].text.toLowerCase()}”`)
    .replace(/\b(groq|gemini)\b/gi, (m) => PROVIDER_LABEL[m.toLowerCase()] ?? m)
    .trim();
}

const fmtTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function AiTab() {
  const { showToast } = useApp();
  const { status, mutate: refreshStatus } = useAiStatus();
  const { usage, mutate: refreshUsage } = useAiUsage(!!status?.canManage);
  const [busy, setBusy] = useState<string | null>(null);
  const [limit, setLimit] = useState("");
  const [threshold, setThreshold] = useState("");

  useEffect(() => {
    if (usage?.budget) {
      setLimit(String(usage.budget.limitVnd));
      setThreshold(String(usage.budget.alertThresholdPct));
    }
  }, [usage?.budget?.limitVnd, usage?.budget?.alertThresholdPct]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!status) return <ToggleListSkeleton rows={7} />;
  if (!status.canManage) {
    return <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">Chỉ người có quyền quản lý AI (Trưởng nhà, Admin) mới xem và cấu hình được mục này.</div>;
  }

  const byCode = new Map(status.tasks.map((t) => [t.code, t]));
  const taskName = (code: string) => TASK_TEXT[code]?.name ?? byCode.get(code)?.name ?? code;

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      await Promise.all([refreshStatus(), refreshUsage(), globalMutate(SETTINGS_KEY)]);
      showToast("success", ok);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleMaster = (v: boolean) =>
    run("master", () => settingsApi.save([{ key: "feature.ai.enabled", value: v }]), v ? "Đã bật tính năng AI." : "Đã tắt toàn bộ tính năng AI.");
  const toggleTask = (t: AiTaskDto, v: boolean) =>
    run(t.code, () => aiApi.updateTask(t.code, { enabled: v }), v ? `Đã bật “${taskName(t.code)}”.` : `Đã tắt “${taskName(t.code)}”.`);
  const saveBudget = () => {
    const l = Number(limit.replace(/[.\s,]/g, ""));
    const th = Number(threshold);
    if (!Number.isInteger(l) || l < 0 || !Number.isInteger(th) || th < 1 || th > 100) {
      showToast("warning", "Hạn mức phải là số nguyên ≥ 0 và ngưỡng cảnh báo từ 1 đến 100%.");
      return;
    }
    void run("budget", () => aiApi.updateBudget({ limitVnd: l, alertThresholdPct: th }), "Đã lưu ngân sách AI tháng này.");
  };

  const b = usage?.budget;
  const pct = b && b.limitVnd > 0 ? Math.min(100, Math.round((b.usedVnd / b.limitVnd) * 100)) : 0;
  const overAlert = !!b && pct >= b.alertThresholdPct;
  const card = "bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-4 sm:gap-5 min-w-0";
  const input = "w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-primary";

  return (
    <div className="flex flex-col gap-5 sm:gap-6 animate-in fade-in duration-200">
      {/* Công tắc tổng + nhà cung cấp */}
      <div className={card}>
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 text-sm">Trợ lý AI</h3>
              <p className="text-[11px] text-gray-500 leading-relaxed">AI chỉ gợi ý — người dùng luôn xem và quyết định. Hệ thống vẫn chạy bình thường khi tắt AI.</p>
            </div>
          </div>
          <div className="shrink-0">
            <CustomToggle checked={status.masterEnabled} onChange={toggleMaster} disabled={busy === "master"} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {status.providers.map((p, i) => (
            <div key={p.id} className="p-3.5 rounded-2xl bg-surface-container-low border border-purple-50 flex flex-col gap-1.5 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="font-bold text-xs text-gray-900">
                  {p.label} <span className="font-medium text-gray-400">· {i === 0 ? "dùng mặc định" : "dự phòng khi lỗi"}</span>
                </span>
                {p.configured ? (
                  p.paused ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700">
                      <PauseCircle className="w-3.5 h-3.5" /> Tạm dừng do lỗi liên tiếp
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã cấu hình khóa
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500">
                    <CircleSlash className="w-3.5 h-3.5" /> Chưa có khóa
                  </span>
                )}
              </div>
              <span className="text-[11px] text-gray-500 break-all">Mô hình: {p.model}</span>
            </div>
          ))}
        </div>

        {!status.configured && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-[11px] text-amber-900 flex items-start gap-2">
            <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">
              Chưa có khóa API nên các tác vụ AI chưa chạy được. Thêm khóa Groq (<code className="font-mono">GROQ_API_KEY</code>) và tùy chọn khóa Gemini (
              <code className="font-mono">GEMINI_API_KEY</code>) làm dự phòng vào file <code className="font-mono">.env.local</code> rồi khởi động lại máy chủ. Khóa không bao giờ được
              lưu trong cơ sở dữ liệu hay gửi về trình duyệt.
            </span>
          </div>
        )}
        {status.masterEnabled && status.configured && (
          <div className="px-3 py-2 rounded-xl bg-violet-50 border border-violet-100 text-[11px] text-violet-800 leading-relaxed">
            Khi bật, nội dung người dùng gửi cho AI (đã che tên, email, số điện thoại) sẽ được chuyển tới dịch vụ AI bên ngoài. Mỗi thành viên phải đồng ý một lần trước khi dùng.
          </div>
        )}
      </div>

      {/* Danh mục tác vụ */}
      <div className={card}>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Các tính năng AI</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Bật riêng từng tính năng. Tính năng ghi “Chưa hỗ trợ” có trong thiết kế nhưng ứng dụng chưa triển khai.</p>
        </div>
        <div className="flex flex-col divide-y divide-gray-100">
          {[...status.tasks].sort((a, b) => Number(b.implemented) - Number(a.implemented)).map((t) => {
            const cls = CLASS_LABEL[t.dataClass];
            const a = usage?.acceptance.find((x) => x.taskCode === t.code);
            const decided = a ? a.accepted + a.rejected : 0;
            const meta = [
              t.monthlyBudgetVnd ? `Trần ${formatVND(t.monthlyBudgetVnd)}/tháng` : null,
              t.requiredConsent ? "Cần người dùng đồng ý" : null,
              t.humanReview ? "Người duyệt quyết định" : null,
              decided > 0 && a ? `Được chấp nhận ${Math.round((a.accepted / decided) * 100)}% (${decided} lượt duyệt)` : null,
            ].filter(Boolean);
            return (
              <div key={t.code} className="py-3 flex items-start justify-between gap-3" title={t.code}>
                <div className="min-w-0 flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-xs text-gray-900">{taskName(t.code)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cls.cls}`} title={cls.hint}>
                      {cls.text}
                    </span>
                    {!t.implemented ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">Chưa hỗ trợ</span>
                    ) : (
                      t.technique !== "llm" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">{TECHNIQUE_LABEL[t.technique] ?? t.technique}</span>
                      )
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">{TASK_TEXT[t.code]?.desc ?? t.description}</p>
                  {meta.length > 0 && <p className="text-[10px] text-gray-400 leading-relaxed">{meta.join(" · ")}</p>}
                </div>
                <div className="shrink-0 pt-0.5">
                  <CustomToggle checked={t.enabled} onChange={(v) => toggleTask(t, v)} disabled={!t.implemented || busy === t.code} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ngân sách & sử dụng */}
      <div className={card}>
        <h3 className="font-bold text-gray-900 text-sm">Ngân sách &amp; chi phí tháng {usage ? usage.month.slice(5, 7) + "/" + usage.month.slice(0, 4) : ""}</h3>
        {b ? (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs font-semibold text-gray-700">
                <span>
                  Đã dùng {formatVND(b.usedVnd)} / {formatVND(b.limitVnd)}
                </span>
                <span className={overAlert ? "text-rose-600" : "text-gray-500"}>{pct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full ${overAlert ? "bg-rose-500" : "bg-violet-500"}`} style={{ width: `${pct}%` }} />
              </div>
              {overAlert && (
                <p className="flex items-start gap-1.5 text-[11px] text-rose-700 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> Đã đạt ngưỡng cảnh báo {b.alertThresholdPct}%
                  {b.hardStop && pct >= 100 ? " — tính năng AI tạm dừng tới tháng sau hoặc khi tăng hạn mức." : "."}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-end">
              <label className="text-[11px] font-bold text-gray-600 flex flex-col gap-1">
                Hạn mức tháng (đồng)
                <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" className={input} />
              </label>
              <label className="text-[11px] font-bold text-gray-600 flex flex-col gap-1">
                Cảnh báo khi dùng tới (%)
                <input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric" className={input} />
              </label>
              <div className="flex items-center gap-2 sm:pb-1">
                <CustomToggle
                  checked={b.hardStop}
                  onChange={(v) => run("hard", () => aiApi.updateBudget({ hardStop: v }), v ? "Đã bật dừng khi hết ngân sách." : "Đã tắt dừng khi hết ngân sách.")}
                  disabled={busy === "hard"}
                />
                <span className="text-[11px] font-bold text-gray-600">Dừng hẳn khi hết ngân sách</span>
              </div>
            </div>
            <button
              onClick={saveBudget}
              disabled={busy === "budget"}
              className="w-full sm:w-auto sm:self-start px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold disabled:opacity-60"
            >
              Lưu ngân sách
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-400">Chưa có ngân sách tháng này — sẽ tự tạo ở lần dùng AI đầu tiên.</p>
        )}

        {usage && usage.byTask.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-[11px] font-bold text-gray-500 uppercase">Sử dụng theo tính năng</h4>
            {/* Điện thoại: thẻ; máy tính: bảng */}
            <div className="flex flex-col gap-2 sm:hidden">
              {usage.byTask.map((r) => (
                <div key={r.taskCode} className="p-3 rounded-xl bg-surface-container-low text-xs flex flex-col gap-1" title={r.taskCode}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-gray-900">{taskName(r.taskCode)}</span>
                    <span className="font-bold text-gray-900 shrink-0">{formatVND(r.costVnd)}</span>
                  </div>
                  <span className="text-[11px] text-gray-500">
                    {r.jobs} lượt{r.failedJobs ? ` (${r.failedJobs} lỗi)` : ""} · {(r.tokensIn + r.tokensOut).toLocaleString("vi-VN")} token
                  </span>
                </div>
              ))}
            </div>
            <table className="hidden sm:table w-full text-left text-xs">
              <thead>
                <tr className="text-gray-400 font-bold uppercase text-[10px]">
                  <th className="pb-2">Tính năng</th>
                  <th className="pb-2 text-right">Lượt</th>
                  <th className="pb-2 text-right">Lỗi</th>
                  <th className="pb-2 text-right">Token vào / ra</th>
                  <th className="pb-2 text-right">Chi phí</th>
                </tr>
              </thead>
              <tbody>
                {usage.byTask.map((r) => (
                  <tr key={r.taskCode} className="border-t border-gray-50" title={r.taskCode}>
                    <td className="py-1.5 font-semibold text-gray-800">{taskName(r.taskCode)}</td>
                    <td className="py-1.5 text-right">{r.jobs}</td>
                    <td className="py-1.5 text-right">{r.failedJobs}</td>
                    <td className="py-1.5 text-right">
                      {r.tokensIn.toLocaleString("vi-VN")} / {r.tokensOut.toLocaleString("vi-VN")}
                    </td>
                    <td className="py-1.5 text-right font-semibold">{formatVND(r.costVnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Nhật ký gần đây */}
      <div className={card}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 text-sm">Nhật ký gần đây</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Chỉ lưu tính năng, nhà cung cấp, chi phí và lý do bị chặn — không lưu nội dung câu hỏi hay câu trả lời.</p>
          </div>
          <button onClick={() => void refreshAi()} className="shrink-0 p-2 rounded-xl hover:bg-gray-100 text-gray-500" title="Làm mới">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {!usage || usage.recentJobs.length === 0 ? (
          <p className="text-xs text-gray-400">Chưa có lượt dùng AI nào.</p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {usage.recentJobs.map((j) => {
              const stt = STATUS_LABEL[j.status] ?? { text: j.status, cls: "text-gray-600" };
              const reason = j.blockedReason ?? j.errorMessage;
              return (
                <div key={j.id} className="py-2.5 flex flex-col gap-0.5 text-xs" title={j.taskCode}>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                    <span className="font-semibold text-gray-900">{taskName(j.taskCode)}</span>
                    <span className="text-[11px] text-gray-500">{fmtTime(j.createdAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                    <span className={`font-bold ${stt.cls}`}>{stt.text}</span>
                    {j.provider && (
                      <span className="text-gray-500">
                        · {PROVIDER_LABEL[j.provider] ?? j.provider}
                        {j.latencyMs ? ` · ${(j.latencyMs / 1000).toFixed(1)} giây` : ""}
                      </span>
                    )}
                    {j.costVnd > 0 && <span className="text-gray-500">· {formatVND(j.costVnd)}</span>}
                  </div>
                  {reason && <p className="text-[11px] text-gray-500 break-words">{humanReason(reason)}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
