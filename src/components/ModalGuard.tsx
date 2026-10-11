"use client";

// BẢO VỆ HỘP THOẠI — làm một lần cho mọi hộp thoại (nền mờ + thẻ trắng; xem SheetEnhancer) thay vì sửa từng nơi:
//   1. ĐANG TẢI ẢNH (có phần tử data-uploading="1") ⇒ không đóng được (bấm ra ngoài, Esc, vuốt xuống, nút X/Hủy/Đóng) và không bấm Lưu/Gửi/Tạo được;
//      người dùng dừng bằng nút "Hủy tải lên" ngay ở ô tải ảnh.
//   2. ĐANG LƯU (nút Lưu/Gửi/Tạo… bị khóa kèm vòng xoay hoặc chữ "Đang …") ⇒ phủ lớp "Đang xử lý…" lên hộp thoại (khỏi bấm lần hai, khỏi sửa dở), không đóng được.
//      Treo quá 20 giây thì hiện lối thoát "Đóng hộp thoại".
//   3. ĐÃ NHẬP / ĐÃ TẢI GÌ ĐÓ mà bấm thoát ⇒ hỏi "Thoát mà chưa lưu?" (Ở lại / Thoát, bỏ thay đổi). Chỉ tính hộp thoại dạng biểu mẫu (≥ 2 ô nhập, có <form>,
//      hoặc vừa tải tệp lên); ô tìm kiếm không tính.
//   4. Bấm nút Lưu/Gửi/Tạo hai lần liên tiếp (< 0,6 giây) ⇒ bỏ lần hai.
//   5. Đang tải ảnh / có thay đổi chưa lưu mà đóng tab, tải lại trang ⇒ trình duyệt hỏi lại (beforeunload).
// Cách nhận biết hộp thoại dựa vào thuộc tính data-sheet-* do SheetEnhancer gắn; loại một hộp thoại khỏi việc bảo vệ bằng data-no-guard trên lớp phủ,
// một ô khỏi tính "đã sửa" bằng data-no-dirty, một thẻ khỏi lớp phủ "Đang xử lý" bằng data-no-veil (vd. hộp thoại tự có thanh tiến độ riêng).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { useApp } from "@/lib/store";

type Lock = "upload" | "saving" | null;

const CLOSE_TEXT = /^(Hủy( bỏ)?|Đóng|Quay lại|Để sau|Thoát|Bỏ qua|Không lưu)$/i;
const SUBMIT_TEXT = /^(Lưu|Gửi|Tạo|Lập|Xác nhận|Duyệt|Ghi|Đăng|Cập nhật|Nộp|Áp dụng)\b/i;
const SAVE_TEXT = /^(Lưu|Gửi|Tạo|Thêm|Lập|Xác nhận|Duyệt|Ghi|Đăng|Cập nhật|Nộp|Áp dụng)\b/i;
const SAVING_TEXT = /^Đang\s+(lưu|gửi|tạo|thêm|ghi|xử lý|cập nhật|đăng|duyệt|xác nhận|nộp|lập|xóa|hủy|đảo)/i;
const FIELD_SEL = "input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=search]):not([data-no-dirty]), textarea:not([data-no-dirty]), select:not([data-no-dirty])";

const textOf = (el: Element) => ((el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " "));

const topOverlay = (): HTMLElement | null => {
  const all = [...document.querySelectorAll<HTMLElement>("[data-sheet-overlay]")].filter((o) => !o.hasAttribute("data-no-guard"));
  return all[all.length - 1] ?? null;
};
const cardOf = (ov: HTMLElement) => ov.querySelector<HTMLElement>("[data-sheet-card]");

/** Nút X ở GÓC TRÊN PHẢI thẻ (nút đóng của tiêu đề) — khác với X xóa ô ngày, bỏ ảnh, xóa thẻ… nằm trong biểu mẫu. */
function isHeaderX(btn: HTMLElement, card: HTMLElement): boolean {
  if (btn.textContent?.trim() || !btn.querySelector("svg.lucide-x") || btn.closest("[data-upload-zone]")) return false;
  const r = btn.getBoundingClientRect();
  const c = card.getBoundingClientRect();
  return r.top - c.top < 96 && c.right - r.right < 72;
}

/** Nút đóng hộp thoại: chữ Hủy bỏ / Đóng / Quay lại…, aria-label "Đóng", hoặc X ở tiêu đề. */
function isCloseButton(btn: HTMLElement, label: string, card: HTMLElement): boolean {
  if (CLOSE_TEXT.test(label)) return true;
  if (/^(đóng|close)\b/i.test(btn.getAttribute("aria-label") ?? "")) return true;
  return isHeaderX(btn, card);
}

function lockOf(card: HTMLElement): Lock {
  if (card.querySelector('[data-uploading="1"]')) return "upload";
  for (const b of card.querySelectorAll<HTMLButtonElement>("button:disabled")) {
    if (b.closest("[data-upload-zone]")) continue;
    const label = textOf(b);
    const spinning = !!b.querySelector(".animate-spin");
    const isSubmit = b.type === "submit" || SAVE_TEXT.test(label) || SAVING_TEXT.test(label);
    if (isSubmit && (spinning || SAVING_TEXT.test(label))) return "saving";
  }
  return card.querySelector('[aria-busy="true"]') ? "saving" : null;
}

const isFormLike = (card: HTMLElement) => !!card.querySelector("form") || card.querySelectorAll(FIELD_SEL).length >= 2;

interface OverlayState {
  dirty: boolean;
  allowOnce: boolean;
}

export function ModalGuard() {
  const { showToast } = useApp();
  const toast = useRef(showToast);
  toast.current = showToast;
  const states = useRef(new WeakMap<HTMLElement, OverlayState>());
  const lastClick = useRef(new WeakMap<Element, number>());
  const [ask, setAsk] = useState<{ proceed: () => void } | null>(null);
  const askRef = useRef(ask);
  askRef.current = ask;

  const stateOf = useCallback((ov: HTMLElement) => {
    let s = states.current.get(ov);
    if (!s) {
      s = { dirty: false, allowOnce: false };
      states.current.set(ov, s);
    }
    return s;
  }, []);

  const isDirty = useCallback(
    (ov: HTMLElement, card: HTMLElement) => {
      if (card.querySelector('[data-upload-fresh="1"]')) return true;
      return stateOf(ov).dirty && isFormLike(card);
    },
    [stateOf]
  );

  useEffect(() => {
    const block = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
    };
    const lockMessage = (lock: Lock) =>
      lock === "upload" ? "Đang tải ảnh lên — bấm “Hủy tải lên” nếu muốn dừng, hoặc chờ tải xong." : "Đang lưu — vui lòng chờ hoàn tất, đừng thoát lúc này.";

    /** Có chặn hành động thoát không? true = đã chặn (và đã báo / hỏi). */
    const guardClose = (ov: HTMLElement, card: HTMLElement, e: Event, proceed: () => void): boolean => {
      const st = stateOf(ov);
      if (st.allowOnce) {
        st.allowOnce = false;
        return false;
      }
      const lock = lockOf(card);
      if (lock) {
        block(e);
        toast.current("warning", lockMessage(lock), 4500);
        return true;
      }
      if (isDirty(ov, card)) {
        block(e);
        setAsk({
          proceed: () => {
            st.allowOnce = true;
            proceed();
          },
        });
        return true;
      }
      return false;
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest || target.closest("[data-no-guard]") || target.closest("[data-guard-veil]")) return;
      const ov = target.closest<HTMLElement>("[data-sheet-overlay]");
      if (!ov || ov !== topOverlay()) return;
      const card = cardOf(ov);
      if (!card) return;
      const inCard = card.contains(target);
      const btn = inCard ? target.closest<HTMLElement>("button") : null;
      // đánh dấu "đã sửa" khi chọn mục / bật công tắc
      if (inCard && target.closest("[role=option],[role=switch],[role=checkbox]")) stateOf(ov).dirty = true;

      if (!inCard) {
        // bấm ra ngoài thẻ (nền mờ)
        guardClose(ov, card, e, () => ov.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
        return;
      }
      if (!btn || !card.contains(btn)) return;
      const label = textOf(btn);
      if (isCloseButton(btn, label, card)) {
        guardClose(ov, card, e, () => btn.click());
        return;
      }
      if (btn.closest("[data-upload-zone]")) return;
      if (SAVE_TEXT.test(label) || btn.getAttribute("type") === "submit") {
        if (lockOf(card) === "upload") {
          block(e);
          toast.current("warning", "Đang tải ảnh lên — chờ tải xong rồi hãy lưu.", 4000);
          return;
        }
        if (SUBMIT_TEXT.test(label) || btn.getAttribute("type") === "submit") {
          const now = Date.now();
          if (now - (lastClick.current.get(btn) ?? 0) < 600) {
            block(e); // bấm đúp
            return;
          }
          lastClick.current.set(btn, now);
        }
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Esc đang để đóng danh sách thả xuống / lịch chọn ngày ⇒ không phải thoát hộp thoại
      if (document.querySelector('[aria-expanded="true"]')) return;
      if (askRef.current) {
        block(e);
        setAsk(null); // Esc trên hộp hỏi = Ở lại
        return;
      }
      const ov = topOverlay();
      const card = ov && cardOf(ov);
      if (!ov || !card) return;
      guardClose(ov, card, e, () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    };

    const onSubmit = (e: Event) => {
      const form = e.target as HTMLElement | null;
      const ov = form?.closest?.<HTMLElement>("[data-sheet-overlay]");
      const card = ov && cardOf(ov);
      if (!ov || !card || ov.hasAttribute("data-no-guard")) return;
      const lock = lockOf(card);
      if (lock) {
        block(e);
        if (lock === "upload") toast.current("warning", "Đang tải ảnh lên — chờ tải xong rồi hãy lưu.", 4000);
      }
    };

    const onInput = (e: Event) => {
      if (!e.isTrusted) return;
      const t = e.target as HTMLElement | null;
      if (!t?.closest || t.closest("[data-no-dirty]") || t.closest("[data-no-guard]")) return;
      if (t instanceof HTMLInputElement && (t.type === "search" || t.type === "file")) return;
      const ov = t.closest<HTMLElement>("[data-sheet-overlay]");
      if (ov) stateOf(ov).dirty = true;
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      let risky = !!document.querySelector('[data-uploading="1"]');
      if (!risky) {
        for (const ov of document.querySelectorAll<HTMLElement>("[data-sheet-overlay]")) {
          const card = cardOf(ov);
          if (card && !ov.hasAttribute("data-no-guard") && (lockOf(card) || isDirty(ov, card))) risky = true;
        }
      }
      if (risky) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isDirty, stateOf]);

  // Lớp phủ "Đang xử lý…" lên hộp thoại đang lưu (gắn bằng DOM thuần: hộp thoại là các component khác nhau)
  useEffect(() => {
    let raf = 0;
    const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
    const sync = () => {
      raf = 0;
      for (const ov of document.querySelectorAll<HTMLElement>("[data-sheet-overlay]")) {
        const card = cardOf(ov);
        if (!card || ov.hasAttribute("data-no-guard")) continue;
        const veil = card.querySelector<HTMLElement>(":scope > [data-guard-veil]");
        const saving = !card.hasAttribute("data-no-veil") && lockOf(card) === "saving";
        if (saving && !veil) {
          const el = document.createElement("div");
          el.setAttribute("data-guard-veil", "");
          el.setAttribute("role", "status");
          el.className = "absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2.5 bg-white/75 backdrop-blur-[1px] cursor-progress";
          el.innerHTML =
            '<span class="w-8 h-8 rounded-full border-[3px] border-primary/25 border-t-primary animate-spin"></span>' +
            '<span class="text-xs font-extrabold text-gray-800">Đang xử lý…</span>' +
            '<span class="text-[11px] text-gray-500 px-6 text-center">Vui lòng chờ, đừng thoát hoặc bấm lại.</span>';
          card.appendChild(el);
          // lối thoát khi treo quá lâu (máy chủ vẫn có thể đã lưu xong — kiểm tra lại danh sách sau khi đóng)
          timers.set(
            ov,
            setTimeout(() => {
              if (!el.isConnected) return;
              const b = document.createElement("button");
              b.type = "button";
              b.className = "mt-1 px-3.5 py-1.5 rounded-xl border border-gray-300 bg-white text-[11px] font-bold text-gray-700 hover:bg-gray-50";
              b.textContent = "Mất quá lâu? Đóng hộp thoại";
              b.setAttribute("data-guard-veil-exit", "");
              b.onclick = (ev) => {
                ev.stopPropagation();
                const s = states.current.get(ov) ?? { dirty: false, allowOnce: false };
                states.current.set(ov, s);
                s.allowOnce = true;
                el.remove();
                ov.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
              };
              el.appendChild(b);
            }, 20000)
          );
        } else if (!saving && veil) {
          veil.remove();
          const t = timers.get(ov);
          if (t) clearTimeout(t);
        }
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "data-uploading", "aria-busy"] });
    schedule();
    return () => {
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Hộp hỏi "Thoát mà chưa lưu?"
  const stay = useCallback(() => setAsk(null), []);
  const leave = useCallback(() => {
    const a = askRef.current;
    setAsk(null);
    a?.proceed();
  }, []);
  const stayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ask) stayRef.current?.focus();
  }, [ask]);

  if (!ask || typeof document === "undefined") return null;
  return createPortal(
    <div data-no-guard onClick={stay} className="fixed inset-0 z-[2500] bg-black/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center animate-fadeIn">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="guard-leave-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-gray-100 p-5 flex flex-col gap-4 animate-scaleIn"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 id="guard-leave-title" className="text-base font-black text-gray-900 leading-snug">
              Thoát mà chưa lưu?
            </h3>
            <p className="mt-1 text-xs text-gray-600 leading-relaxed font-medium">Những gì bạn đã nhập hoặc tải lên trong hộp thoại này sẽ bị mất nếu thoát bây giờ.</p>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-3 border-t border-gray-100">
          <button type="button" onClick={leave} className="px-4 py-2.5 sm:py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors">
            Thoát, bỏ thay đổi
          </button>
          <button ref={stayRef} type="button" onClick={stay} className="px-5 py-2.5 sm:py-2 rounded-xl text-xs font-bold bg-primary hover:bg-[#4d2dbf] text-white shadow-md shadow-purple-200 active:scale-95 transition">
            Tiếp tục chỉnh sửa
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
