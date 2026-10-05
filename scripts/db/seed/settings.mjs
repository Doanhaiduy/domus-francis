// Seed phân hệ Cài đặt: điền các cấu hình tổ chức mà giao diện cũ đã có giá trị (thiết kế để mặc định rỗng),
// và làm sạch ghi chú kỹ thuật "(FE …)" trong mô tả danh mục seed. Chỉ ghi khi còn ở giá trị gốc ⇒ chạy lại an toàn.
export async function seed(ctx) {
  const head = ctx.ids?.userByRole?.house_head ?? null;
  await ctx.as(head);

  // Giá trị lấy từ giao diện cũ: hotline in trên sơ yếu lý lịch (MemberCVModal) và ô "Tài khoản nhận quỹ" (Cài đặt) —
  // khớp túi quỹ BANK_MAIN (Techcombank, …9999, Trần Văn Đức) của 52_seed_lookup.
  const demo = {
    "org.contact_phone": "0903 112 451",
    "finance.dues_bank_account": "1903688889999 - Techcombank (Trần Văn Đức)",
  };
  for (const [key, value] of Object.entries(demo)) {
    await ctx.q(`UPDATE settings SET value = to_jsonb($2::text) WHERE key = $1 AND value = '""'::jsonb`, [key, value]);
  }

  await ctx.q(
    `UPDATE categories
        SET description = NULLIF(btrim(regexp_replace(description, '\\s*\\(FE[^)]*\\)', '', 'g')), '')
      WHERE description ~ '\\(FE'`
  );
  await ctx.as(null);
}
