"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Bảng nổi (dropdown / lịch / chọn giờ) dùng chung cho các picker:
 *  - Vẽ qua portal ra <body> với position: fixed → không bị modal (overflow) cắt mất phần dưới.
 *  - Tự lật lên TRÊN khi phía dưới không đủ chỗ, và co chiều cao (cuộn trong bảng) nếu cả hai phía đều chật.
 *  - Tự canh lại khi cuộn / đổi cỡ cửa sổ / nội dung đổi chiều cao.
 *  - Chỉ MỘT bảng được mở tại một thời điểm: mở bảng mới sẽ đóng bảng đang mở.
 */

interface PanelHandle {
  close: () => void;
}
let activePanel: PanelHandle | null = null;

const MARGIN = 8;
const GAP = 6;

interface Pos {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function FloatingPanel({
  open,
  onClose,
  anchorRef,
  width = "anchor",
  minWidth,
  maxHeight = 320,
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  /** "anchor" = bằng chiều rộng ô kích hoạt; hoặc số px cố định. */
  width?: "anchor" | number;
  minWidth?: number;
  maxHeight?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const handle = useRef<PanelHandle>({ close: () => {} }).current;
  handle.close = onClose;

  // Chỉ một bảng mở tại một thời điểm
  useEffect(() => {
    if (!open) return;
    if (activePanel && activePanel !== handle) activePanel.close();
    activePanel = handle;
    return () => {
      if (activePanel === handle) activePanel = null;
    };
  }, [open, handle]);

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let w = width === "anchor" ? r.width : width;
    if (minWidth) w = Math.max(w, minWidth);
    w = Math.min(w, vw - MARGIN * 2);
    const left = Math.min(Math.max(MARGIN, r.left), Math.max(MARGIN, vw - w - MARGIN));
    const natural = (panelRef.current?.scrollHeight ?? 240) + 2;
    const below = vh - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    const placeBelow = natural <= below || below >= above;
    const avail = Math.max(120, placeBelow ? below : above);
    const cap = Math.min(maxHeight, avail);
    const h = Math.min(natural, cap);
    const top = placeBelow ? r.bottom + GAP : r.top - GAP - h;
    setPos((prev) =>
      prev && prev.top === top && prev.left === left && prev.width === w && prev.maxHeight === cap ? prev : { top, left, width: w, maxHeight: cap },
    );
  }, [anchorRef, width, minWidth, maxHeight]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    update();
  }, [open, update, children]);

  useEffect(() => {
    if (!open) return;
    const on = () => update();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true); // capture: bắt cả cuộn bên trong modal
    const ro = typeof ResizeObserver !== "undefined" && panelRef.current ? new ResizeObserver(on) : null;
    if (ro && panelRef.current) ro.observe(panelRef.current);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
      ro?.disconnect();
    };
  }, [open, update]);

  // Bấm ra ngoài / Esc → đóng
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // không để Esc đóng luôn cả modal phía dưới
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="presentation"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: pos?.width,
        maxHeight: pos?.maxHeight,
        visibility: pos ? "visible" : "hidden",
        zIndex: 1100,
      }}
      className={`overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 border border-purple-100 ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
