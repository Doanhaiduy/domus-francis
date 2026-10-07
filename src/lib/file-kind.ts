// Nhận diện loại tệp (từ MIME + phần mở rộng của tên) để hiển thị xem trước đúng: ảnh → ảnh, PDF → trình xem PDF, còn lại → thẻ tệp có biểu tượng.

export type FileKind = "image" | "pdf" | "word" | "excel" | "powerpoint" | "text" | "archive" | "video" | "audio" | "other";

const BY_EXT: Record<string, FileKind> = {
  jpg: "image", jpeg: "image", png: "image", webp: "image", gif: "image", heic: "image", heif: "image", bmp: "image", svg: "image", avif: "image",
  pdf: "pdf",
  doc: "word", docx: "word", odt: "word", rtf: "word",
  xls: "excel", xlsx: "excel", csv: "excel", ods: "excel",
  ppt: "powerpoint", pptx: "powerpoint", odp: "powerpoint",
  txt: "text", md: "text", json: "text", log: "text",
  zip: "archive", rar: "archive", "7z": "archive", gz: "archive",
  mp4: "video", mov: "video", webm: "video", mkv: "video", avi: "video",
  mp3: "audio", m4a: "audio", wav: "audio", ogg: "audio", aac: "audio",
};

export function fileExt(name?: string | null): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec((name ?? "").trim());
  return m ? m[1].toLowerCase() : "";
}

/** Ưu tiên MIME (do máy chủ kiểm bằng magic bytes), không rõ thì dựa vào đuôi tên tệp. */
export function fileKind(mime?: string | null, name?: string | null): FileKind {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m.includes("wordprocessingml") || m === "application/msword") return "word";
  if (m.includes("spreadsheetml") || m === "application/vnd.ms-excel" || m === "text/csv") return "excel";
  if (m.includes("presentationml") || m === "application/vnd.ms-powerpoint") return "powerpoint";
  if (m.startsWith("text/")) return "text";
  if (m.includes("zip") || m.includes("rar") || m.includes("compressed")) return "archive";
  return BY_EXT[fileExt(name)] ?? "other";
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  image: "Hình ảnh",
  pdf: "Tài liệu PDF",
  word: "Tài liệu Word",
  excel: "Bảng tính",
  powerpoint: "Bài trình chiếu",
  text: "Tệp văn bản",
  archive: "Tệp nén",
  video: "Video",
  audio: "Âm thanh",
  other: "Tệp đính kèm",
};
