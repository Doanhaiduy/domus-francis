"use client";

// Hộp thoại trên ĐIỆN THOẠI (< 640px) hiển thị dạng "tờ trượt từ đáy": bo tròn hai góc trên, áp sát mép dưới màn hình, có thanh nắm ở đỉnh và
// KÉO XUỐNG để đóng. Gần 50 hộp thoại có cùng kiểu (lớp phủ `fixed inset-0` nền mờ + thẻ trắng bo góc) nên làm một lần ở đây thay vì sửa từng nơi:
//   • bộ quan sát DOM đánh dấu lớp phủ / thẻ bằng thuộc tính data-sheet-* — phần bố cục nằm ở globals.css (khối "TỜ TRƯỢT");
//   • kéo xuống: chạm ở thẻ → kéo xuống > ~120px (hoặc vuốt nhanh) thì đóng bằng cách bấm vào lớp phủ (đúng như bấm ra ngoài hộp thoại, nên mọi
//     hộp thoại tự áp dụng logic "đang lưu thì không đóng" của riêng nó); không đóng được thì thẻ nảy về chỗ cũ.
//   • không kéo khi chạm vào ô nhập / vùng đang cuộn dở (để cuộn nội dung) — chỉ kéo được khi nội dung ở đầu trang.
// Hộp thoại KHÔNG muốn dạng tờ trượt (xem ảnh toàn màn hình, bảng lệnh…) đặt thuộc tính data-no-sheet trên lớp phủ.
import { useEffect } from "react";

const MOBILE = "(max-width: 639px)";
const attached = new WeakSet<HTMLElement>();

const cls = (el: Element) => (typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className : "");

function isModalOverlay(el: HTMLElement): boolean {
  if (el.hasAttribute("data-no-sheet")) return false;
  const c = cls(el);
  return c.includes("backdrop-blur") && /(^|\s)bg-(black|gray-900)\//.test(c);
}

/** Thẻ của hộp thoại: phần tử (sâu tối đa 3 tầng) bo góc có nền trắng / nền bề mặt của giao diện. */
function findCard(overlay: HTMLElement): HTMLElement | null {
  let level: Element[] = [...overlay.children];
  for (let depth = 0; depth < 3 && level.length; depth++) {
    for (const el of level) {
      const c = cls(el);
      if (/(^|\s)([a-z0-9]+:)*rounded(-[a-z0-9]+)*(\s|$)/.test(c) && /(^|\s)bg-(white|surface[a-z-]*|\[#)/.test(c)) return el as HTMLElement;
    }
    level = level.flatMap((e) => [...e.children]);
  }
  return null;
}

function nearestScroller(from: HTMLElement, stop: HTMLElement): HTMLElement | null {
  for (let el: HTMLElement | null = from; el; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
    if (el === stop) break;
  }
  return null;
}

function enhance(overlay: HTMLElement) {
  const card = findCard(overlay);
  if (!card) return;
  overlay.setAttribute("data-sheet-overlay", "");
  card.setAttribute("data-sheet-card", "");
  // các phần tử trung gian giữa lớp phủ và thẻ: bỏ căn giữa / lề tự động để thẻ áp sát đáy
  for (let el = card.parentElement; el && el !== overlay; el = el.parentElement) el.setAttribute("data-sheet-path", "");
  if (!attached.has(card)) {
    attached.add(card);
    attachDrag(overlay, card);
  }
}

function attachDrag(overlay: HTMLElement, card: HTMLElement) {
  let tracking = false;
  let dragging = false;
  let startY = 0;
  let startX = 0;
  let lastY = 0;
  let startT = 0;
  let scroller: HTMLElement | null = null;

  const reset = () => {
    card.style.transition = "transform .22s cubic-bezier(.16,1,.3,1)";
    card.style.transform = "";
    overlay.style.opacity = "";
    setTimeout(() => {
      card.style.transition = "";
    }, 240);
  };

  card.addEventListener(
    "touchstart",
    (e) => {
      if (!window.matchMedia(MOBILE).matches || e.touches.length !== 1) return;
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,[contenteditable='true'],canvas,video,[data-no-drag]")) return;
      tracking = true;
      dragging = false;
      startY = lastY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      startT = Date.now();
      scroller = nearestScroller(t, overlay);
    },
    { passive: true }
  );

  card.addEventListener(
    "touchmove",
    (e) => {
      if (!tracking) return;
      const y = e.touches[0].clientY;
      const dy = y - startY;
      const dx = e.touches[0].clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
          tracking = false; // vuốt ngang: không phải kéo đóng
          return;
        }
        if (dy < -6) {
          tracking = false; // vuốt lên: để cuộn nội dung
          return;
        }
        if (dy <= 8) return;
        if (scroller && scroller.scrollTop > 0) {
          tracking = false; // nội dung đang cuộn dở: để cuộn lên đầu trước
          return;
        }
        dragging = true;
        card.style.transition = "none";
      }
      e.preventDefault();
      lastY = y;
      const off = Math.max(0, dy);
      card.style.transform = `translateY(${off}px)`;
      overlay.style.opacity = String(Math.max(0.3, 1 - off / 420));
    },
    { passive: false }
  );

  const end = () => {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    const dy = lastY - startY;
    const velocity = dy / Math.max(1, Date.now() - startT);
    if (dy > 120 || (dy > 50 && velocity > 0.6)) {
      card.style.transition = "transform .2s ease-out";
      card.style.transform = "translateY(105%)";
      setTimeout(() => {
        // đóng như bấm ra ngoài hộp thoại; nếu hộp thoại không chịu đóng (đang lưu…) thì nảy về
        overlay.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        setTimeout(() => overlay.isConnected && reset(), 350);
      }, 190);
    } else {
      reset();
    }
  };
  card.addEventListener("touchend", end, { passive: true });
  card.addEventListener("touchcancel", end, { passive: true });
}

export function SheetEnhancer() {
  useEffect(() => {
    let raf = 0;
    const scan = () => {
      raf = 0;
      document.querySelectorAll<HTMLElement>(".fixed.inset-0").forEach((el) => {
        if (isModalOverlay(el)) enhance(el);
      });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(scan);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    schedule();
    return () => {
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
