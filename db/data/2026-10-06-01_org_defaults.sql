-- =====================================================================
-- DỮ LIỆU 2026-10-06 — Mặc định thông tin cộng đoàn: Bổn mạng 08/12 (Đức Mẹ Vô Nhiễm Nguyên Tội) và địa chỉ Đoàn Trần Nghiệp (Nha Trang).
-- Chỉ đổi default_value; value chỉ đổi khi người dùng CHƯA sửa (value còn bằng mặc định cũ). Idempotent.
-- =====================================================================
BEGIN;

UPDATE public.settings
   SET value = CASE WHEN value = default_value THEN to_jsonb('12-08'::text) ELSE value END,
       default_value = to_jsonb('12-08'::text)
 WHERE key = 'org.patron_feast';

UPDATE public.settings
   SET value = CASE WHEN value = default_value THEN to_jsonb('Đoàn Trần Nghiệp, Phường Bắc Nha Trang, Tỉnh Khánh Hòa'::text) ELSE value END,
       default_value = to_jsonb('Đoàn Trần Nghiệp, Phường Bắc Nha Trang, Tỉnh Khánh Hòa'::text)
 WHERE key = 'org.address';

UPDATE public.settings
   SET value = CASE WHEN value = default_value THEN to_jsonb('Đức Mẹ Vô Nhiễm Nguyên Tội'::text) ELSE value END,
       default_value = to_jsonb('Đức Mẹ Vô Nhiễm Nguyên Tội'::text)
 WHERE key = 'org.patron_name';

COMMIT;
