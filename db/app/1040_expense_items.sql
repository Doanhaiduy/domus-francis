-- =====================================================================
-- 1040 — CHI TIẾT TỪNG MÓN CỦA PHIẾU CHI (đi chợ nhiều món: tên món · số lượng · đơn vị · đơn giá · thành tiền). Chạy SAU 1039. Idempotent.
--   • expense_voucher_items: mỗi dòng một món của một phiếu chi. Thành tiền = làm tròn(số lượng × đơn giá) do trigger tự tính (không tin giá trị gửi lên).
--   • Phiếu CÓ món ⇒ số tiền phiếu (expense_vouchers.amount_vnd) BẮT BUỘC bằng tổng các món — kiểm bằng constraint trigger DEFERRABLE
--     (kiểm lúc COMMIT trên trạng thái cuối nên ứng dụng thêm/sửa món rồi mới chỉnh tổng trong cùng giao dịch được). Phiếu không có món
--     (chi một khoản) hoạt động như cũ.
--   • Chỉ thêm/sửa/xóa món khi phiếu đang ở trạng thái NHÁP (sửa phiếu đã gửi duyệt phải rút về nháp trước — đúng luồng sẵn có); phiếu đã gửi duyệt /
--     đã duyệt / đã chi / đã đảo thì món bất biến cùng phiếu. Riêng xóa vĩnh viễn phiếu ĐÃ HỦY (app.fn_admin_delete, cờ app.purge_expense) được xóa món theo.
--   • Chỉ người lập phiếu ghi được (RLS); ai xem được phiếu thì xem được món.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.expense_voucher_items (
  id             uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  voucher_id     uuid          NOT NULL REFERENCES public.expense_vouchers (id) ON DELETE CASCADE,
  position       smallint      NOT NULL,
  name           text          NOT NULL,
  quantity       numeric(12,3) NOT NULL,
  unit           text,
  unit_price_vnd bigint        NOT NULL,
  amount_vnd     bigint        NOT NULL,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ux_expense_voucher_items__position UNIQUE (voucher_id, position),
  CONSTRAINT ck_expense_voucher_items__position CHECK (position BETWEEN 1 AND 100),
  CONSTRAINT ck_expense_voucher_items__name     CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT ck_expense_voucher_items__quantity CHECK (quantity > 0 AND quantity <= 1000000),
  CONSTRAINT ck_expense_voucher_items__unit     CHECK (unit IS NULL OR char_length(btrim(unit)) BETWEEN 1 AND 30),
  CONSTRAINT ck_expense_voucher_items__price    CHECK (unit_price_vnd > 0 AND unit_price_vnd <= 1000000000),
  CONSTRAINT ck_expense_voucher_items__amount   CHECK (amount_vnd > 0 AND amount_vnd <= 1000000000)
);
COMMENT ON TABLE public.expense_voucher_items IS 'Chi tiết từng món của phiếu chi (đi chợ nhiều món). Thành tiền = làm tròn(số lượng × đơn giá), do trigger tính. Phiếu có món thì tổng món phải bằng số tiền phiếu (constraint trigger hoãn); chỉ sửa được khi phiếu còn nháp.';
COMMENT ON COLUMN public.expense_voucher_items.quantity IS 'Số lượng, tối đa 3 chữ số thập phân (vd. 1,5 kg).';
COMMENT ON COLUMN public.expense_voucher_items.amount_vnd IS 'Thành tiền của món = làm tròn(quantity × unit_price_vnd) — luôn do trigger tính lại.';
CREATE INDEX IF NOT EXISTS ix_expense_voucher_items__voucher ON public.expense_voucher_items (voucher_id, position);

-- ---------------------------------------------------------------------
-- Trigger quy tắc: chỉ khi phiếu ở trạng thái nháp; tự tính thành tiền; chuẩn hóa chữ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_expense_items_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_status text;
  v_vid    uuid;
BEGIN
  -- (IF thay vì CASE một biểu thức: plpgsql phân tích cả hai nhánh OLD/NEW của biểu thức nên sẽ lỗi ở INSERT/DELETE)
  IF TG_OP = 'DELETE' THEN
    v_vid := OLD.voucher_id;
    -- Xóa vĩnh viễn phiếu đã hủy (app.fn_admin_delete đặt cờ) ⇒ món bị xóa theo
    IF current_setting('app.purge_expense', true) = v_vid::text THEN
      RETURN OLD;
    END IF;
  ELSE
    v_vid := NEW.voucher_id;
  END IF;

  SELECT status::text INTO v_status FROM public.expense_vouchers WHERE id = v_vid;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'BR-FIN-05: chỉ thêm/sửa/xóa món khi phiếu chi đang ở trạng thái nháp (hiện: %). Rút phiếu về nháp để sửa.', COALESCE(v_status, 'không tồn tại')
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.voucher_id IS DISTINCT FROM OLD.voucher_id THEN
    RAISE EXCEPTION 'Không được chuyển món sang phiếu chi khác.' USING ERRCODE = 'check_violation';
  END IF;

  NEW.name := btrim(NEW.name);
  NEW.unit := NULLIF(btrim(COALESCE(NEW.unit, '')), '');
  NEW.amount_vnd := round(NEW.quantity * NEW.unit_price_vnd)::bigint;
  RETURN NEW;
END
$$;
ALTER FUNCTION app.tg_expense_items_rules() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_expense_items_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_expense_items_rules() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

DROP TRIGGER IF EXISTS trg_expense_voucher_items__rules ON public.expense_voucher_items;
CREATE TRIGGER trg_expense_voucher_items__rules BEFORE INSERT OR UPDATE OR DELETE ON public.expense_voucher_items
  FOR EACH ROW EXECUTE FUNCTION app.tg_expense_items_rules();

-- ---------------------------------------------------------------------
-- Tổng các món phải bằng số tiền phiếu (kiểm lúc COMMIT)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_expense_items_total_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_vid uuid;
  v_sum bigint;
  v_cnt integer;
  v_amt bigint;
BEGIN
  -- Hàm dùng cho cả hai bảng; phải tách bằng IF vì OLD/NEW của hai bảng có cột khác nhau
  IF TG_TABLE_NAME = 'expense_vouchers' THEN
    v_vid := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_vid := OLD.voucher_id;
  ELSE
    v_vid := NEW.voucher_id;
  END IF;
  SELECT amount_vnd INTO v_amt FROM public.expense_vouchers WHERE id = v_vid;
  IF NOT FOUND THEN
    RETURN NULL; -- phiếu đã bị xóa (xóa vĩnh viễn phiếu đã hủy)
  END IF;
  SELECT count(*), COALESCE(sum(amount_vnd), 0) INTO v_cnt, v_sum FROM public.expense_voucher_items WHERE voucher_id = v_vid;
  IF v_cnt > 0 AND v_sum <> v_amt THEN
    RAISE EXCEPTION 'Tổng các món (% đ) không khớp số tiền phiếu chi (% đ).', v_sum, v_amt USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;
ALTER FUNCTION app.tg_expense_items_total_check() OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.tg_expense_items_total_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tg_expense_items_total_check() TO luuxa_app, luuxa_worker, luuxa_auth, luuxa_definer, luuxa_owner;

DROP TRIGGER IF EXISTS trg_expense_voucher_items__total ON public.expense_voucher_items;
CREATE CONSTRAINT TRIGGER trg_expense_voucher_items__total AFTER INSERT OR UPDATE OR DELETE ON public.expense_voucher_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.tg_expense_items_total_check();

DROP TRIGGER IF EXISTS trg_expense_vouchers__items_total ON public.expense_vouchers;
CREATE CONSTRAINT TRIGGER trg_expense_vouchers__items_total AFTER UPDATE OF amount_vnd ON public.expense_vouchers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.tg_expense_items_total_check();

-- ---------------------------------------------------------------------
-- Kiểm toán + RLS + quyền
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_expense_voucher_items__audit ON public.expense_voucher_items;
CREATE TRIGGER trg_expense_voucher_items__audit AFTER INSERT OR UPDATE OR DELETE ON public.expense_voucher_items
  FOR EACH ROW EXECUTE FUNCTION app.tg_audit('id');

ALTER TABLE public.expense_voucher_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_voucher_items FORCE ROW LEVEL SECURITY;

-- Xem: ai xem được phiếu thì xem được món (chính sách của expense_vouchers áp lên truy vấn con)
DROP POLICY IF EXISTS expense_voucher_items__select ON public.expense_voucher_items;
CREATE POLICY expense_voucher_items__select ON public.expense_voucher_items FOR SELECT TO luuxa_app
  USING (EXISTS (SELECT 1 FROM public.expense_vouchers v WHERE v.id = expense_voucher_items.voucher_id));
-- Ghi: chỉ người lập phiếu, phiếu còn nháp (trigger kiểm lại)
DROP POLICY IF EXISTS expense_voucher_items__insert ON public.expense_voucher_items;
CREATE POLICY expense_voucher_items__insert ON public.expense_voucher_items FOR INSERT TO luuxa_app
  WITH CHECK (EXISTS (SELECT 1 FROM public.expense_vouchers v WHERE v.id = expense_voucher_items.voucher_id AND v.requested_by = (SELECT app.current_user_id()) AND v.status = 'draft'));
DROP POLICY IF EXISTS expense_voucher_items__update ON public.expense_voucher_items;
CREATE POLICY expense_voucher_items__update ON public.expense_voucher_items FOR UPDATE TO luuxa_app
  USING (EXISTS (SELECT 1 FROM public.expense_vouchers v WHERE v.id = expense_voucher_items.voucher_id AND v.requested_by = (SELECT app.current_user_id()) AND v.status = 'draft'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.expense_vouchers v WHERE v.id = expense_voucher_items.voucher_id AND v.requested_by = (SELECT app.current_user_id()) AND v.status = 'draft'));
DROP POLICY IF EXISTS expense_voucher_items__delete ON public.expense_voucher_items;
CREATE POLICY expense_voucher_items__delete ON public.expense_voucher_items FOR DELETE TO luuxa_app
  USING (EXISTS (SELECT 1 FROM public.expense_vouchers v WHERE v.id = expense_voucher_items.voucher_id AND v.requested_by = (SELECT app.current_user_id()) AND v.status = 'draft'));
-- Nơi vai trò nền không có BYPASSRLS (Supabase): worker/definer vẫn đọc ghi được
DROP POLICY IF EXISTS expense_voucher_items__system ON public.expense_voucher_items;
CREATE POLICY expense_voucher_items__system ON public.expense_voucher_items FOR ALL TO luuxa_worker, luuxa_definer USING (true) WITH CHECK (true);

ALTER TABLE public.expense_voucher_items OWNER TO luuxa_owner;
REVOKE ALL ON public.expense_voucher_items FROM luuxa_app;
GRANT SELECT ON public.expense_voucher_items TO luuxa_app;
GRANT INSERT (voucher_id, position, name, quantity, unit, unit_price_vnd) ON public.expense_voucher_items TO luuxa_app;
GRANT UPDATE (position, name, quantity, unit, unit_price_vnd) ON public.expense_voucher_items TO luuxa_app;
GRANT DELETE ON public.expense_voucher_items TO luuxa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_voucher_items TO luuxa_worker, luuxa_definer;

COMMIT;
