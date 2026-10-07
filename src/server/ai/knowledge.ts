import "server-only";
import { GUIDE_SECTIONS, type GuideBlock } from "@/content/guide";
import { TOGGLEABLE_MODULES } from "@/lib/modules";

// ---------------------------------------------------------------------
// Kiến thức cho Trợ lý Lưu Xá: (1) sách hướng dẫn sử dụng của chính ứng dụng (src/content/guide.ts) cắt thành các đoạn ngắn để truy hồi,
// (2) danh sách trang được phép gợi ý mở. Hướng dẫn là tài liệu công khai trong ứng dụng (/huong-dan), không chứa dữ liệu cá nhân.
// ---------------------------------------------------------------------

export interface KnowledgeChunk {
  title: string;
  text: string;
}

const plain = (s: string) =>
  s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

/** Biến một danh sách khối hướng dẫn thành các dòng chữ thuần (giữ cấu trúc: bước, đường đi menu, bảng). */
function lines(blocks: GuideBlock[], depth = 0): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case "md":
        out.push(plain(b.text));
        break;
      case "heading":
        break; // xử lý ở vòng ngoài
      case "callout":
        out.push(`${b.title ? `${b.title}: ` : "Lưu ý: "}${plain(b.text)}`);
        break;
      case "steps":
        if (b.title) out.push(`${b.title}:`);
        b.items.forEach((it, i) => out.push(`${i + 1}. ${it.title}${it.path?.length ? ` (mở: ${it.path.join(" → ")})` : ""}${it.text ? ` — ${plain(it.text)}` : ""}`));
        break;
      case "path":
        out.push(`${b.label ?? "Mở ở"}: ${b.items.join(" → ")}`);
        break;
      case "cards":
        for (const c of b.items) out.push(`${c.title}: ${plain(c.text)}`);
        break;
      case "table":
        out.push(b.head.join(" | "));
        for (const r of b.rows) out.push(r.map(plain).join(" | "));
        break;
      case "tabs":
        for (const t of b.tabs) {
          out.push(`[${t.label}]`);
          out.push(...lines(t.blocks, depth + 1));
        }
        break;
      case "accordion":
        for (const it of b.items) {
          out.push(`Hỏi: ${it.title}`);
          out.push(...lines(it.blocks, depth + 1));
        }
        break;
      case "demo":
        break;
    }
  }
  return out.filter(Boolean);
}

/** Gói các dòng thành đoạn ≤ max ký tự, không cắt giữa dòng (dòng quá dài thì cắt cứng). */
function pack(ls: string[], max = 850): string[] {
  const out: string[] = [];
  let cur = "";
  for (let l of ls) {
    while (l.length > max * 1.4) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      out.push(l.slice(0, max));
      l = l.slice(max);
    }
    if (cur && cur.length + l.length + 1 > max) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n${l}` : l;
  }
  if (cur) out.push(cur);
  return out;
}

let cache: KnowledgeChunk[] | null = null;

/** Các đoạn hướng dẫn sử dụng (tính một lần, giữ trong bộ nhớ tiến trình). */
export function guideChunks(): KnowledgeChunk[] {
  if (cache) return cache;
  const out: KnowledgeChunk[] = [];
  for (const s of GUIDE_SECTIONS) {
    // Cắt theo tiêu đề con (heading) trong từng mục
    let heading = "";
    let buf: GuideBlock[] = [];
    const flush = () => {
      const ls = lines(buf);
      buf = [];
      if (!ls.length) return;
      const head = heading ? `${s.title} — ${heading}` : s.title;
      for (const text of pack(ls)) out.push({ title: head, text });
    };
    for (const b of s.blocks) {
      if (b.t === "heading") {
        flush();
        heading = plain(b.text);
      } else {
        buf.push(b);
      }
    }
    flush();
  }
  cache = out;
  return out;
}

/** Trang trợ lý được phép gợi ý mở (nút bấm cho người dùng). Đường dẫn ngoài danh sách này bị loại khỏi câu trả lời. */
export const AI_LINKS: { href: string; label: string; hint: string }[] = [
  { href: "/", label: "Tổng quan", hint: "Màn hình chính, việc cần làm hôm nay" },
  ...TOGGLEABLE_MODULES.map((m) => ({ href: m.href, label: m.label, hint: m.description })),
  { href: "/cai-dat?tab=profile", label: "Cài đặt → Hồ sơ cá nhân", hint: "Sửa hồ sơ, giao diện sáng/tối, cỡ chữ, tài khoản nhận tiền" },
  { href: "/cai-dat?tab=security", label: "Cài đặt → Bảo mật", hint: "Đổi mật khẩu, đổi email đăng nhập, xác thực 2 bước, quyền riêng tư" },
  { href: "/cai-dat?tab=notifications", label: "Cài đặt → Thông báo", hint: "Cài ứng dụng ra màn hình chính, bật thông báo đẩy, giờ yên tĩnh" },
  { href: "/huong-dan", label: "Hướng dẫn sử dụng", hint: "Sách hướng dẫn đầy đủ theo từng vai trò" },
  { href: "/chinh-sach-bao-mat", label: "Chính sách bảo mật", hint: "Dữ liệu cá nhân nào được thu thập, dùng, bảo vệ, lưu bao lâu và quyền của bạn" },
  { href: "/dieu-khoan-su-dung", label: "Điều khoản sử dụng", hint: "Quy tắc dùng hệ thống: tài khoản, quỹ chung, nội dung, trách nhiệm" },
  { href: "/bai-viet", label: "Bài viết công khai", hint: "Viết bài, hỏi đáp, đăng ký tìm hiểu (người có quyền đăng bài)" },
  { href: "/bao-cao", label: "Báo cáo hoạt động", hint: "Báo cáo quý/năm (người quản lý, Thủ quỹ)" },
];

/** Tên hiển thị cho vai trò hệ thống (khi CSDL chưa trả tên). */
export const ROLE_HINT: Record<string, string> = {
  admin: "Admin (toàn quyền)",
  house_head: "Trưởng nhà",
  vice_head: "Phó nhà",
  treasurer: "Thủ quỹ",
  member: "Thành viên",
  liturgy_lead: "Trưởng ban Phụng vụ",
  kitchen_lead: "Trưởng ban Ẩm thực",
  media_lead: "Trưởng ban Truyền thông",
};
