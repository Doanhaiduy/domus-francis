"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { forumApi, refreshForum, useForum } from "@/lib/data/community";
import { CustomInput, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import type { AiResultDto } from "@/lib/types/ai";
import { AiLabel, AiSuggestButton } from "@/components/ai/AiParts";

export default function CreateThreadModal() {
  const { closeModal, showToast } = useApp();
  const { data } = useForum();
  const categories = data?.categories ?? [];

  const [threadTitle, setThreadTitle] = useState("");
  const [threadCategory, setThreadCategory] = useState<string>("");
  const [threadContent, setThreadContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<AiResultDto<"community.moderation"> | null>(null);

  useEffect(() => {
    if (!threadCategory && categories.length) setThreadCategory((categories.find((c) => c.code === "FORUM_SPORT") ?? categories[0]).id);
  }, [categories, threadCategory]);

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
      <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Tạo Chủ Đề Thảo Luận</h3>
          <p className="text-xs text-gray-500">Giao lưu, góp ý hoặc chia sẻ ý tưởng mới cùng cả nhà</p>
        </div>
        <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          if (threadTitle.trim().length < 3) return showToast("error", "Tiêu đề tối thiểu 3 ký tự.");
          if (!threadContent.trim()) return showToast("error", "Vui lòng nhập nội dung.");
          if (!threadCategory) return showToast("error", "Vui lòng chọn chuyên mục.");
          setSaving(true);
          try {
            await forumApi.create({ title: threadTitle.trim(), content: threadContent.trim(), categoryId: threadCategory });
            await refreshForum();
            showToast("success", "Đã đăng chủ đề mới lên diễn đàn!");
            closeModal();
          } catch (err) {
            showToast("error", errorMessage(err));
          } finally {
            setSaving(false);
          }
        }}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <CustomInput
            label="Chủ đề thảo luận *"
            required
            minLength={3}
            maxLength={200}
            value={threadTitle}
            onChange={(e) => setThreadTitle(e.target.value)}
            placeholder="Bạn muốn cùng thảo luận điều gì?"
          />

          <CustomSelect
            label="Chuyên mục"
            value={threadCategory}
            onChange={setThreadCategory}
            placeholder="Chọn chuyên mục..."
            options={categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))}
          />

          <CustomTextarea
            label="Nội dung *"
            required
            maxLength={10000}
            value={threadContent}
            onChange={(e) => setThreadContent(e.target.value)}
            rows={3}
            placeholder="Mô tả ý tưởng của bạn..."
          />
          <AiSuggestButton
            task="community.moderation"
            label="AI soát nội dung trước khi đăng"
            getInput={() => {
              const text = `${threadTitle}\n${threadContent}`.trim();
              if (text.length < 5) {
                showToast("warning", "Nhập tiêu đề/nội dung để AI soát.");
                return null;
              }
              return { text, kind: "forum_post" };
            }}
            onResult={(r) => setCheck(r)}
          />
          {check && (
            <div className={`p-3 rounded-2xl border text-xs flex flex-col gap-1 ${check.output.flagged ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-100 text-emerald-900"}`}>
              <AiLabel result={check} className="self-start" />
              <p className="font-semibold">{check.output.flagged ? "Nội dung có thể cần chỉnh lại trước khi đăng." : "Chưa thấy vấn đề rõ ràng."}</p>
              {check.output.reason && <p>{check.output.reason}</p>}
              <p className="text-[10px] opacity-70">Chỉ là gợi ý — bạn quyết định có đăng hay không; kiểm duyệt viên xem xét cuối cùng.</p>
            </div>
          )}
        </div>

        <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
          <button type="button" onClick={closeModal} className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700">
            Hủy bỏ
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-60"
          >
            {saving ? "Đang đăng…" : "Tạo chủ đề"}
          </button>
        </div>
      </form>
    </div>
  );
}
