-- =====================================================================
-- 98 — Phân hệ CÀI ĐẶT (màn hình /cai-dat). Chạy SAU 01–52 + 70–75. Idempotent (chạy lại nhiều lần được).
--   1. Khóa cấu hình còn thiếu cho ô "Tài khoản nhận quỹ" của tab Cấu hình chung.
--   2. org.order_name / org.chaplain_name → công khai cho mọi thành viên: hai giá trị này được in trên sơ yếu lý lịch
--      mà CHÍNH thành viên tự xuất (MemberCVModal), không phải dữ liệu cá nhân; GET /api/v1/settings/public trả về chúng.
--   3. Bảo vệ danh mục hệ thống (categories.is_system) ở tầng DB: không đổi mã/phân hệ, không xóa mềm, không gỡ cờ
--      qua ứng dụng (RLS thiết kế chỉ chặn INSERT/DELETE dòng is_system, còn UPDATE … SET deleted_at/code thì lọt).
-- =====================================================================
BEGIN;

-- [1] Tài khoản nhận quỹ (STK • Ngân hàng • Chủ tài khoản) — hiển thị cho thành viên khi nộp quỹ.
--     Thuộc nhóm finance.* ⇒ chỉ người có finance.settings.write (Trưởng nhà) sửa được; Admin kỹ thuật không đổi được nơi nhận tiền.
--     Mặc định rỗng (đặc thù từng nhà); dữ liệu demo nạp ở scripts/db/seed/settings.mjs.
INSERT INTO public.settings (key, value, value_type, description, min_value, max_value, is_public, write_permission, default_value)
VALUES ('finance.dues_bank_account', to_jsonb(''::text), 'string',
        'Tài khoản nhận quỹ sinh hoạt hiển thị cho thành viên (STK • Ngân hàng • Chủ tài khoản). Nên trùng túi quỹ BANK_MAIN.',
        NULL, NULL, true, 'finance.settings.write', to_jsonb(''::text))
ON CONFLICT (key) DO NOTHING;

-- [2]
UPDATE public.settings SET is_public = true
 WHERE key IN ('org.order_name', 'org.chaplain_name') AND NOT is_public;

-- [3]
CREATE OR REPLACE FUNCTION app.tg_categories_system_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF OLD.is_system THEN
    IF NEW.code IS DISTINCT FROM OLD.code OR NEW.kind IS DISTINCT FROM OLD.kind THEN
      RAISE EXCEPTION 'BR-CAT-01: "%" là danh mục hệ thống — không được đổi mã hoặc phân hệ áp dụng.', OLD.name
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      RAISE EXCEPTION 'BR-CAT-02: "%" là danh mục hệ thống — không thể xóa, hãy chuyển sang "Tạm ẩn".', OLD.name
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.is_system IS DISTINCT FROM OLD.is_system AND current_user = 'luuxa_app' THEN
    RAISE EXCEPTION 'BR-CAT-03: không được đổi cờ "danh mục hệ thống" từ ứng dụng.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_categories_system_guard() IS
  'BEFORE UPDATE categories: danh mục is_system không đổi code/kind, không xóa mềm; luuxa_app không đổi được cờ is_system (BR-CAT-01..03).';
ALTER FUNCTION app.tg_categories_system_guard() OWNER TO luuxa_owner;
REVOKE EXECUTE ON FUNCTION app.tg_categories_system_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_categories_system_guard() TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;

DROP TRIGGER IF EXISTS trg_categories__system_guard ON public.categories;
CREATE TRIGGER trg_categories__system_guard
  BEFORE UPDATE OF code, kind, deleted_at, is_system ON public.categories
  FOR EACH ROW EXECUTE FUNCTION app.tg_categories_system_guard();

COMMIT;
