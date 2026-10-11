"use client";

// Tối ưu ảnh NGAY TRÊN TRÌNH DUYỆT trước khi tải lên: ảnh chụp điện thoại 5–12 MB (4000×3000) được thu nhỏ về cạnh dài ≤ 2048px, nén JPEG ~0,85
// ⇒ còn khoảng 0,5–1 MB. Nhờ vậy tải lên nhanh gấp nhiều lần trên mạng di động, máy chủ xử lý nhẹ hơn hẳn (không phải giải mã/nén lại ảnh 12 MP)
// và không vướng giới hạn thân yêu cầu 4,5 MB của Vercel. Ngày chụp trong EXIF (DateTimeOriginal) bị canvas xóa mất nên được đọc ra trước và gửi kèm
// (máy chủ dùng để cảnh báo ảnh check-in đi lễ chụp sai ngày). PDF, ảnh nhỏ sẵn, hoặc trình duyệt không giải mã được (vd. HEIC) ⇒ gửi nguyên bản.

export interface OptimizeResult {
  file: File;
  /** true nếu đã nén/thu nhỏ (file khác bản gốc) */
  optimized: boolean;
  /** Ngày chụp trong EXIF dạng "YYYY:MM:DD HH:MM:SS" (nếu có) */
  exifDate: string | null;
}

const MAX_SIDE = 2048;
const SKIP_UNDER_BYTES = 600 * 1024;
const JPEG_QUALITY = 0.85;

/** Đọc DateTimeOriginal (0x9003) từ EXIF của tệp JPEG — không cần thư viện. */
export async function readExifDate(file: File): Promise<string | null> {
  if (file.type !== "image/jpeg") return null;
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      const len = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
        const tiff = off + 10;
        const little = v.getUint16(tiff) === 0x4949;
        const u16 = (o: number) => v.getUint16(o, little);
        const u32 = (o: number) => v.getUint32(o, little);
        const ifd0 = tiff + u32(tiff + 4);
        const findTag = (ifd: number, tag: number): number | null => {
          const n = u16(ifd);
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12;
            if (u16(e) === tag) return e;
          }
          return null;
        };
        const exifPtr = findTag(ifd0, 0x8769);
        if (exifPtr === null) return null;
        const exifIfd = tiff + u32(exifPtr + 8);
        for (const tag of [0x9003, 0x9004]) {
          const e = findTag(exifIfd, tag);
          if (e === null) continue;
          const count = u32(e + 4);
          const valueOff = count > 4 ? tiff + u32(e + 8) : e + 8;
          let s = "";
          for (let i = 0; i < count - 1; i++) s += String.fromCharCode(v.getUint8(valueOff + i));
          if (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
        }
        return null;
      }
      if (marker === 0xffda || (marker & 0xff00) !== 0xff00) break;
      off += 2 + len;
    }
  } catch {
    /* EXIF hỏng: bỏ qua */
  }
  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url; // <img> áp dụng hướng xoay EXIF mặc định ⇒ vẽ lên canvas là ảnh đã đúng chiều
  });
}

const canvasBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((r) => c.toBlob((b) => r(b), type, q));

/** Thu nhỏ + nén ảnh. Không bao giờ ném lỗi: không tối ưu được thì trả bản gốc. */
export async function optimizeImage(file: File, opts: { maxSide?: number } = {}): Promise<OptimizeResult> {
  const exifDate = await readExifDate(file);
  const passthrough: OptimizeResult = { file, optimized: false, exifDate };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return passthrough;
  const maxSide = opts.maxSide ?? MAX_SIDE;
  try {
    const img = await loadImage(file);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return passthrough;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    // đã nhỏ cả về dung lượng lẫn kích thước ⇒ giữ nguyên
    if (scale === 1 && file.size <= SKIP_UNDER_BYTES) return passthrough;
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return passthrough;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, cw, ch);
    // PNG (ảnh chụp màn hình, có thể trong suốt) giữ PNG nếu còn nhẹ; quá nặng thì chuyển JPEG
    let blob: Blob | null = null;
    let type = "image/jpeg";
    if (file.type === "image/png") {
      const png = await canvasBlob(canvas, "image/png");
      if (png && png.size <= 1.5 * 1024 * 1024) {
        blob = png;
        type = "image/png";
      }
    }
    if (!blob) {
      // nền trắng cho vùng trong suốt khi chuyển sang JPEG
      if (file.type !== "image/jpeg") {
        const c2 = document.createElement("canvas");
        c2.width = cw;
        c2.height = ch;
        const x2 = c2.getContext("2d");
        if (x2) {
          x2.fillStyle = "#ffffff";
          x2.fillRect(0, 0, cw, ch);
          x2.drawImage(canvas, 0, 0);
          blob = await canvasBlob(c2, "image/jpeg", JPEG_QUALITY);
        }
      } else blob = await canvasBlob(canvas, "image/jpeg", JPEG_QUALITY);
    }
    if (!blob || blob.size >= file.size) return passthrough; // nén xong lại nặng hơn gốc ⇒ dùng gốc
    const ext = type === "image/png" ? "png" : "jpg";
    const name = file.name.replace(/\.[^.]+$/, "") + "." + ext;
    return { file: new File([blob], name, { type, lastModified: file.lastModified }), optimized: true, exifDate };
  } catch {
    return passthrough;
  }
}
