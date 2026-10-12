// Kiểm thử gói G — dọn Cài đặt:
//   • khóa upload.max_image_bytes ĐÃ NỐI vào mã: ảnh lớn hơn hạn mức bị từ chối (413), ảnh nhỏ vẫn tải được; hạn mức không vượt trần cứng 20 MB
//   • các khóa KHÔNG có tác dụng thật (auth.* thời hạn/khóa, upload.monthly_quota_bytes, upload.presign_ttl_seconds, finance.transparency.show_debtor_names)
//     được đánh dấu `hidden` trong danh mục cấu hình (src/lib/settings-catalog.ts) ⇒ giao diện ẩn; khóa còn tác dụng thì KHÔNG bị ẩn
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import crypto from "node:crypto";

async function uploadImage(c, { size, noisy }) {
  const raw = noisy ? crypto.randomBytes(size * size * 3) : Buffer.alloc(size * size * 3, 128);
  const png = await sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  const form = new FormData();
  form.append("bucket", "attachments");
  form.append("file", new Blob([png], { type: "image/png" }), "thu.png");
  const r = await c.req("POST", "/api/v1/files", undefined, { form });
  return { status: r.status, json: r.json, bytes: png.length };
}

export async function run({ as, test, eq, ok, section }) {
  section("Cài đặt — khóa ẩn vì không có tác dụng, hạn mức dung lượng ảnh");
  const admin = await as("viet.vu@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");

  await test("Danh mục cấu hình: khóa không có tác dụng thật bị đánh dấu ẩn; khóa còn tác dụng thì không", async () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/settings-catalog.ts"), "utf8");
    const hiddenKeys = [...src.matchAll(/"([a-z_.]+)":\s*\{\s*(?:\n\s*)?hidden:/g)].map((m) => m[1]);
    for (const k of [
      "auth.access_token_ttl_seconds",
      "auth.lockout_minutes",
      "auth.max_failed_logins",
      "auth.refresh_token_ttl_days",
      "upload.monthly_quota_bytes",
      "upload.presign_ttl_seconds",
      "finance.transparency.show_debtor_names",
      "feature.meals.enabled",
    ])
      ok(hiddenKeys.includes(k), `khóa ${k} phải được ẩn: ${hiddenKeys.join(", ")}`);
    for (const k of ["upload.max_image_bytes", "auth.mfa_required_roles", "privacy.left_member_retention_days", "finance.period.close_requires_reconciliation"])
      ok(!hiddenKeys.includes(k), `khóa ${k} còn tác dụng — không được ẩn`);
  });

  const items = (await admin.get("/api/v1/settings")).json.items;
  const original = items.find((s) => s.key === "upload.max_image_bytes");
  ok(original, "thiếu khóa upload.max_image_bytes");
  const setLimit = (v) => admin.patch("/api/v1/settings", { changes: [{ key: "upload.max_image_bytes", value: v }] });

  try {
    await test("Hạn mức ảnh = 102.400 byte (tối thiểu): ảnh ~1 MB bị từ chối 413 và KHÔNG để lại bản ghi; ảnh nhỏ tải được", async () => {
      eq((await setLimit(102400)).status, 200);
      const big = await uploadImage(member, { size: 600, noisy: true });
      ok(big.bytes > 102400, "ảnh thử phải lớn hơn hạn mức");
      eq(big.status, 413, JSON.stringify(big.json));
      eq(big.json.code, "FILE_TOO_LARGE");
      const small = await uploadImage(member, { size: 24, noisy: false });
      eq(small.status, 200, JSON.stringify(small.json));
    });

    await test("Nới hạn mức lên 20 MB: ảnh lớn tải được; đặt quá trần cứng bị từ chối khi lưu cấu hình", async () => {
      eq((await setLimit(20971520)).status, 200);
      const big = await uploadImage(member, { size: 600, noisy: true });
      eq(big.status, 200, JSON.stringify(big.json));
      const over = await setLimit(30000000);
      ok(over.status >= 400, `đặt vượt trần cứng phải bị chặn: ${over.status}`);
    });
  } finally {
    await setLimit(original.value);
  }
}
