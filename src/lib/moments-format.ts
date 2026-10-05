// Định dạng dùng cho trang Khoảnh khắc (client): ngày, hashtag, tin nhắn Zalo (chỉ sao chép clipboard, không gọi mạng)
import type { MomentAlbumDto } from "./types/moments";

/** "YYYY-MM-DD" ↔ "DD/MM/YYYY" */
export const isoToDmy = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");
export const dmyToIso = (dmy: string): string | null => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(dmy) ? dmy : null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};

/** Hôm nay theo giờ Việt Nam, dạng DD/MM/YYYY */
export function todayDmyVN(): string {
  const d = new Date(Date.now() + 7 * 3600e3);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** Chữ viết tắt cho avatar: "Nguyễn Minh Tuấn" → "MT" */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** "#a, b ,#c" → ["#a", "#b", "#c"] */
export const parseTags = (s: string): string[] =>
  s
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/\s+/g, ""))
    .filter((t) => t.replace(/^#+/, "").length > 0)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));

/** Tóm tắt album để dán vào Zalo — lấy từ dữ liệu thật (số ảnh, người tham gia đã xác nhận). */
export function formatAlbumZalo(album: MomentAlbumDto, photosCount?: number): string {
  const people = album.participants.filter((p) => p.status === "accepted").map((p) => p.fullName);
  const lines = [
    `📸 KHOẢNH KHẮC LƯU XÁ: ${album.title}`,
    `📍 Địa điểm: ${album.location || "Lưu Xá Phanxicô"} (${album.date})`,
    `🏷️ Thể loại: ${album.category}`,
    `✍️ Người đăng: ${album.author.fullName} (${album.author.role})`,
  ];
  if (people.length) lines.push(`👥 Thành viên tham gia (${people.length}): ${people.join(", ")}`);
  lines.push(`🖼️ Thư mục: ${photosCount ?? album.photosCount} hình ảnh kỷ niệm · ❤️ ${album.likesCount} lượt yêu thích`);
  if (album.tags.length) lines.push(`🔖 ${album.tags.join(" ")}`);
  if (album.description) lines.push(`📝 ${album.description}`);
  lines.push("", "Xem album trên phần mềm Lưu Xá → mục Khoảnh khắc.", "Pax et Bonum - Lưu Xá Sinh Viên Phanxicô");
  return lines.join("\n");
}
