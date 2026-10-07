"use client";

// Nút "Xóa vĩnh viễn" dành cho Admin (quyền data.purge) để dọn dữ liệu rác. Chỉ hiện với người có quyền; luôn hỏi xác nhận.
import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { mutate as globalMutate } from "swr";
import { api, errorMessage } from "@/lib/api";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";

export interface PurgeButtonProps {
  /** Đường dẫn DELETE, vd. /api/v1/leave/<id> */
  url: string;
  /** Tên bản ghi để hỏi xác nhận, vd. "đơn xin phép của Nguyễn Văn A" */
  what: string;
  /** Các tiền tố khóa SWR cần làm mới sau khi xóa (mặc định: phần đường dẫn trước id cuối) */
  refreshPrefixes?: string[];
  onDone?: () => void;
  /** "icon" = nút vuông nhỏ; "text" = nút có chữ */
  variant?: "icon" | "text";
  className?: string;
}

export function PurgeButton({ url, what, refreshPrefixes, onDone, variant = "text", className }: PurgeButtonProps) {
  const { can } = useSession();
  const { showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!can("data.purge")) return null;

  const prefixes = refreshPrefixes ?? [url.slice(0, url.lastIndexOf("/"))];
  const run = async () => {
    setOpen(false);
    setBusy(true);
    try {
      await api.del(url);
      await globalMutate((k) => typeof k === "string" && prefixes.some((p) => k.startsWith(p)));
      showToast("success", "Đã xóa vĩnh viễn.");
      onDone?.();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Xóa vĩnh viễn (Admin)"
        aria-label={`Xóa vĩnh viễn ${what}`}
        className={cn(
          variant === "icon"
            ? "p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-50"
            : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-50 transition active:scale-95 disabled:opacity-50",
          className,
        )}
      >
        <Trash2 className="w-3.5 h-3.5" />
        {variant === "text" && <span>Xóa</span>}
      </button>
      <ConfirmDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        title="Xóa vĩnh viễn?"
        message={
          <>
            Xóa <b>{what}</b> khỏi hệ thống. Thao tác này <b>không khôi phục được</b> (chỉ còn dấu vết trong nhật ký kiểm toán).
          </>
        }
        confirmText="Xóa vĩnh viễn"
        cancelText="Giữ lại"
        variant="danger"
      />
    </>
  );
}
