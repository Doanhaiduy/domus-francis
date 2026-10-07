// Danh sách tên thánh (tên Thánh bổn mạng) thường gặp ở Việt Nam — dùng cho ô "Tên Thánh" (chọn sẵn cho nhanh;
// tên không có trong danh sách thì người dùng tự nhập, cột `catholic_profiles.holy_name` là văn bản tự do 2–80 ký tự).
// Viết theo cách gọi phổ biến của Giáo hội Việt Nam. Thêm tên mới: chỉ cần thêm vào mảng tương ứng bên dưới.

import { foldVi } from "@/lib/geo";

export type SaintGender = "Nam" | "Nữ";

export const SAINT_GENDER_LABEL: Record<SaintGender, string> = { Nam: "Thánh nam", Nữ: "Thánh nữ" };

const MALE = [
  "Ambrôsiô",
  "Anrê",
  "Anrê Dũng Lạc",
  "Anrê Phú Yên",
  "Anphongsô",
  "Antôn",
  "Antôn Pađua",
  "Athanasiô",
  "Augustinô",
  "Barnaba",
  "Batôlômêô",
  "Basiliô",
  "Bênêđictô",
  "Bênađô",
  "Bônaventura",
  "Carôlô",
  "Carôlô Borrômêô",
  "Clêmentê",
  "Cônrađô",
  "Đaminh",
  "Đaminh Saviô",
  "Đavít",
  "Êlia",
  "Emmanuen",
  "Eugêniô",
  "Gabrien",
  "Giacôbê",
  "Gioakim",
  "Gioan",
  "Gioan Baotixita",
  "Gioan Bosco",
  "Gioan Kim Khẩu",
  "Gioan Maria Vianney",
  "Gioan Phaolô II",
  "Gioan Thánh Giá",
  "Giêrônimô",
  "Giorgiô",
  "Giuđa Tađêô",
  "Giuse",
  "Giuse Cupertinô",
  "Giustinô",
  "Grêgôriô",
  "Inhaxiô",
  "Inhaxiô Loyola",
  "Isidôrô",
  "Lazarô",
  "Lêô",
  "Lôrensô",
  "Lôrensô Ruiz",
  "Luca",
  "Luy Gonzaga",
  "Máccô",
  "Martinô",
  "Mátthêu",
  "Mátthia",
  "Maximilianô Kolbê",
  "Micae",
  "Nicôla",
  "Patriciô",
  "Phaolô",
  "Phanxicô",
  "Phanxicô Assisi",
  "Phanxicô Salêsiô",
  "Phanxicô Xaviê",
  "Phêrô",
  "Phêrô Claver",
  "Philípphê",
  "Piô",
  "Raphaen",
  "Rôbertô",
  "Rôcô",
  "Sêbastianô",
  "Simon",
  "Stêphanô",
  "Tađêô",
  "Timôthê",
  "Titô",
  "Tôma",
  "Tôma Aquinô",
  "Tôma Môrê",
  "Valentinô",
  "Vinh Sơn",
  "Vinh Sơn Phaolô",
  "Vitô",
];

const FEMALE = [
  "Âgata",
  "Anastasia",
  "Anê",
  "Anna",
  "Apôlônia",
  "Bácbara",
  "Bênêđicta",
  "Bernađét",
  "Brigita",
  "Catarina",
  "Cêcilia",
  "Clara",
  "Elisabét",
  "Faustina",
  "Giacinta",
  "Gioanna",
  "Giêtrudê",
  "Hêlêna",
  "Inê",
  "Lucia",
  "Lydia",
  "Mađalêna",
  "Mácta",
  "Margarita",
  "Maria",
  "Maria Goretti",
  "Maria Mađalêna",
  "Mônica",
  "Rita",
  "Rôsa",
  "Rôsa Lima",
  "Sophia",
  "Susanna",
  "Tabita",
  "Têrêsa",
  "Têrêsa Calcutta",
  "Têrêsa Hài Đồng Giêsu",
  "Úrsula",
  "Valêria",
  "Vêrônica",
  "Victoria",
];

export interface SaintName {
  name: string;
  gender: SaintGender;
  /** Khóa tìm kiếm: không dấu, chữ thường */
  key: string;
}

const build = (names: string[], gender: SaintGender): SaintName[] =>
  names.map((name) => ({ name, gender, key: foldVi(name) })).sort((a, b) => a.name.localeCompare(b.name, "vi"));

export const SAINT_NAMES: SaintName[] = [...build(MALE, "Nam"), ...build(FEMALE, "Nữ")];

/** Tìm tên thánh theo chữ gõ (bỏ dấu, nhiều từ khớp theo bất kỳ thứ tự); trống ⇒ cả danh sách. Khớp đúng/đầu chuỗi xếp trước. */
export function searchSaintNames(query: string): SaintName[] {
  const q = foldVi(query);
  if (!q) return SAINT_NAMES;
  const words = q.split(" ");
  const rank = (s: SaintName) => (s.key === q ? 0 : s.key.startsWith(q) ? 1 : 2);
  return SAINT_NAMES.filter((s) => words.every((w) => s.key.includes(w))).sort((a, b) => rank(a) - rank(b));
}

/** Chia kết quả thành hai nhóm nam/nữ, nhóm cùng giới với thành viên đứng trước. Nhóm rỗng bị bỏ. */
export function groupSaintNames(items: SaintName[], gender?: string | null): { gender: SaintGender; items: SaintName[] }[] {
  const order: SaintGender[] = gender === "Nữ" ? ["Nữ", "Nam"] : ["Nam", "Nữ"];
  return order.map((g) => ({ gender: g, items: items.filter((s) => s.gender === g) })).filter((g) => g.items.length > 0);
}

/** Giá trị đã lưu có nằm trong danh sách không (so không dấu, không phân biệt hoa thường)? */
export function isKnownSaintName(value: string): boolean {
  const k = foldVi(value);
  return !!k && SAINT_NAMES.some((s) => s.key === k);
}
