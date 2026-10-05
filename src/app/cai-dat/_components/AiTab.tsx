"use client";

// Quản trị AI (AIX-TASK / AIX-BUD / AIX-USE / AIX-GATE): công tắc tổng, nhà cung cấp (Groq mặc định → Gemini dự phòng),
// bật/tắt từng tác vụ, ngân sách tháng, chi phí và tỷ lệ gợi ý được chấp nhận. Khóa API chỉ nằm trong .env.local.
import React, { useEffect, useState } from "react";
import { mutate as globalMutate } from "swr";
import { Sparkles, KeyRound, CheckCircle2, CircleSlash, PauseCircle, AlertTriangle } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { aiApi, refreshAi, useAiStatus, useAiUsage } from "@/lib/data/ai";
import { SETTINGS_KEY, settingsApi } from "@/lib/data/settings";
import { CustomToggle } from "@/components/ui/FormControls";
import { formatVND } from "@/lib/utils";
import type { AiTaskDto } from "@/lib/types/ai";

const CLASS_LABEL: Record<AiTaskDto["dataClass"], { text: string; cls: string }> = {
  internal_ok: { text: "Dữ liệu nội bộ", cls: "bg-emerald-50 text-emerald-700" },
  mask_required: { text: "Ẩn danh trước khi gửi", cls: "bg-amber-50 text-amber-700" },
  never_external: { text: "Không gửi ra ngoài", cls: "bg-rose-50 text-rose-700" },
};
const STATUS_LABEL: Record<string, string> = {
  queued: "Chờ",
  running: "Đang chạy",
  succeeded: "Thành công",
  failed: "Lỗi",
  blocked: "Bị chặn",
  cancelled: "Hủy",
};

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

  if (!status) return <div className="p-8 text-center text-xs text-gray-400">Đang tải…</div>;
  if (!status.canManage) {
    return <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">Chỉ người có quyền quản lý AI (Trưởng nhà, Admin) mới xem và cấu hình được mục này.</div>;
  }

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
  const toggleTask = (t: AiTaskDto, v: boolean) => run(t.code, () => aiApi.updateTask(t.code, { enabled: v }), v ? `Đã bật “${t.name}”.` : `Đã tắt “${t.name}”.`);
  const saveBudget = () => {
    const l = Number(limit);
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
  const card = "bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5";

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200">
      {/* Công tắc tổng + nhà cung cấp */}
      <div className={card}>
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Trợ lý AI</h3>
              <p className="text-[11px] text-gray-500">AI chỉ gợi ý — người dùng luôn xem và quyết định. Hệ thống chạy bình thường khi AI tắt.</p>
            </div>
          </div>
          <CustomToggle checked={status.masterEnabled} onChange={toggleMaster} disabled={busy === "master"} />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {status.providers.map((p, i) => (
            <div key={p.id} className="p-3.5 rounded-2xl bg-surface-container-low border border-purple-50 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-gray-900">
                  {p.label} <span className="font-medium text-gray-400">· {i === 0 ? "mặc định" : "dự phòng"}</span>
                </span>
                {p.configured ? (
                  p.paused ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700"><PauseCircle className="w-3.5 h-3.5" /> Tạm dừng (lỗi liên tiếp)</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Đã có khóa</span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500"><CircleSlash className="w-3.5 h-3.5" /> Chưa có khóa</span>
                )}
              </div>
              <span className="text-[11px] text-gray-500 font-mono">{p.model}</span>
            </div>
          ))}
        </div>

        {!status.configured && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-[11px] text-amber-900 flex items-start gap-2">
            <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Chưa có khóa API nên các tác vụ AI chưa chạy được. Thêm <code className="font-mono">GROQ_API_KEY</code> (và tùy chọn <code className="font-mono">GEMINI_API_KEY</code> làm
              dự phòng) vào <code className="font-mono">.env.local</code> rồi khởi động lại máy chủ. Khóa không bao giờ được lưu trong cơ sở dữ liệu hay gửi về trình duyệt.
            </span>
          </div>
        )}
        {status.masterEnabled && status.configured && (
          <div className="px-3 py-2 rounded-xl bg-violet-50 border border-violet-100 text-[11px] text-violet-800">
            Khi bật, nội dung người dùng gửi cho AI (đã ẩn danh) sẽ được chuyển tới dịch vụ bên ngoài. Mỗi thành viên phải đồng ý một lần trước khi dùng.
          </div>
        )}
      </div>

      {/* Danh mục tác vụ */}
      <div className={card}>
        <h3 className="font-bold text-gray-900 text-sm">Danh mục tác vụ AI</h3>
        <div className="flex flex-col divide-y divide-gray-100">
          {status.tasks.map((t) => {
            const cls = CLASS_LABEL[t.dataClass];
            const a = usage?.acceptance.find((x) => x.taskCode === t.code);
            const decided = a ? a.accepted + a.rejected : 0;
            return (
              <div key={t.code} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0 flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-xs text-gray-900">{t.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cls.cls}`}>{cls.text}</span>
                    {!t.implemented && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">Chưa có bộ xử lý</span>}
                    {t.implemented && t.technique !== "llm" && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">{t.technique}</span>}
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">{t.description}</p>
                  <p className="text-[10px] text-gray-400">
                    <span className="font-mono">{t.code}</span>
                    {t.monthlyBudgetVnd ? ` · trần ${formatVND(t.monthlyBudgetVnd)}/tháng` : ""}
                    {t.requiredConsent ? " · cần đồng ý của người dùng" : ""}
                    {decided > 0 && a ? ` · được chấp nhận ${Math.round((a.accepted / decided) * 100)}% (${decided} lượt duyệt)` : ""}
                  </p>
                </div>
                <CustomToggle checked={t.enabled} onChange={(v) => toggleTask(t, v)} disabled={!t.implemented || busy === t.code} />
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
              <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                <span>
                  Đã dùng {formatVND(b.usedVnd)} / {formatVND(b.limitVnd)}
                </span>
                <span className={overAlert ? "text-rose-600" : "text-gray-500"}>{pct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full ${overAlert ? "bg-rose-500" : "bg-violet-500"}`} style={{ width: `${pct}%` }} />
              </div>
              {overAlert && (
                <p className="flex items-center gap-1.5 text-[11px] text-rose-700 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" /> Đã đạt ngưỡng cảnh báo {b.alertThresholdPct}%{b.hardStop && pct >= 100 ? " — tác vụ mới đang bị chặn." : "."}
                </p>
              )}
            </div>
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <label className="text-[11px] font-bold text-gray-600 flex flex-col gap-1">
                Hạn mức tháng (đồng)
                <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-primary" />
              </label>
              <label className="text-[11px] font-bold text-gray-600 flex flex-col gap-1">
                Cảnh báo ở (%)
                <input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric" className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-primary" />
              </label>
              <div className="flex items-center gap-2 pb-1">
                <CustomToggle
                  checked={b.hardStop}
                  onChange={(v) => run("hard", () => aiApi.updateBudget({ hardStop: v }), v ? "Đã bật dừng cứng khi hết ngân sách." : "Đã tắt dừng cứng.")}
                  disabled={busy === "hard"}
                />
                <span className="text-[11px] font-bold text-gray-600">Dừng cứng khi hết</span>
              </div>
            </div>
            <button onClick={saveBudget} disabled={busy === "budget"} className="self-start px-4 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold disabled:opacity-60">
              Lưu ngân sách
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-400">Chưa có dòng ngân sách tháng này — sẽ tự tạo ở lần chạy AI đầu tiên, hoặc đặt hạn mức rồi bấm lưu.</p>
        )}

        {usage && usage.byTask.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-gray-400 font-bold uppercase text-[10px]">
                  <th className="pb-2">Tác vụ</th>
                  <th className="pb-2 text-right">Lượt</th>
                  <th className="pb-2 text-right">Lỗi</th>
                  <th className="pb-2 text-right">Token vào/ra</th>
                  <th className="pb-2 text-right">Chi phí</th>
                </tr>
              </thead>
              <tbody>
                {usage.byTask.map((r) => (
                  <tr key={r.taskCode} className="border-t border-gray-50">
                    <td className="py-1.5 font-mono text-[11px]">{r.taskCode}</td>
                    <td className="py-1.5 text-right">{r.jobs}</td>
                    <td className="py-1.5 text-right">{r.failedJobs}</td>
                    <td className="py-1.5 text-right">{r.tokensIn.toLocaleString("vi-VN")} / {r.tokensOut.toLocaleString("vi-VN")}</td>
                    <td className="py-1.5 text-right font-semibold">{formatVND(r.costVnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Nhật ký job gần đây */}
      <div className={card}>
        <h3 className="font-bold text-gray-900 text-sm">Nhật ký gần đây</h3>
        <p className="text-[11px] text-gray-500 -mt-3">Chỉ lưu tác vụ, nhà cung cấp, chi phí và lý do chặn — không lưu nội dung câu hỏi hay câu trả lời (BR-AI-10).</p>
        {!usage || usage.recentJobs.length === 0 ? (
          <p className="text-xs text-gray-400">Chưa có lượt chạy AI nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-gray-400 font-bold uppercase text-[10px]">
                  <th className="pb-2">Thời gian</th>
                  <th className="pb-2">Tác vụ</th>
                  <th className="pb-2">Trạng thái</th>
                  <th className="pb-2">Nhà cung cấp</th>
                  <th className="pb-2 text-right">Chi phí</th>
                </tr>
              </thead>
              <tbody>
                {usage.recentJobs.map((j) => (
                  <tr key={j.id} className="border-t border-gray-50 align-top">
                    <td className="py-1.5 whitespace-nowrap">{new Date(j.createdAt).toLocaleString("vi-VN")}</td>
                    <td className="py-1.5 font-mono text-[11px]">{j.taskCode}</td>
                    <td className="py-1.5">
                      <span className={j.status === "succeeded" ? "text-emerald-700 font-bold" : j.status === "failed" || j.status === "blocked" ? "text-rose-600 font-bold" : "text-gray-600"}>
                        {STATUS_LABEL[j.status] ?? j.status}
                      </span>
                      {(j.blockedReason || j.errorMessage) && <div className="text-[10px] text-gray-500 max-w-xs">{j.blockedReason ?? j.errorMessage}</div>}
                    </td>
                    <td className="py-1.5">{j.provider ? `${j.provider}${j.latencyMs ? ` · ${j.latencyMs}ms` : ""}` : "—"}</td>
                    <td className="py-1.5 text-right">{formatVND(j.costVnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button onClick={() => void refreshAi()} className="self-start text-[11px] font-bold text-primary hover:underline">Làm mới</button>
      </div>
    </div>
  );
}
