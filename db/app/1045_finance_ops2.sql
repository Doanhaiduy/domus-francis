-- =====================================================================
-- 1045 — THU CHI (GÓI F): THÔNG BÁO PHIẾU CHI, CHỐT SỔ / ĐỐI SOÁT, KHOẢN THU MỘT LẦN, CẬP NHẬT NGƯỜI PHẢI ĐÓNG,
--        LIÊN KẾT THẲNG TRONG THÔNG BÁO QUỸ. Chạy SAU 1044. Idempotent (CREATE OR REPLACE / ON CONFLICT).
--   • Loại thông báo mới: finance.expense_paid (phiếu chi đã chi / đã hoàn ứng — báo người lập + người ứng tiền),
--     finance.period_closed (sổ quỹ tháng đã chốt xong / được mở lại). finance.expense_pending / _decided / period_pending có sẵn.
--   • app.fn_members_with_permission(quyền): thành viên đang ở có tài khoản đang dùng + có quyền (gồm vai trò ủy quyền, Admin) —
--     người nhận thông báo theo QUYỀN (người xác nhận chốt sổ, người ghi chi…). Chỉ worker/definer gọi.
--   • app.fn_expense_signers(phiếu): những người CÒN KÝ ĐƯỢC vòng duyệt hiện tại của phiếu chi — người nhận thông báo "chờ duyệt"
--     (cùng luật với trigger tg_expense_approval_rules: không phải người lập / người ứng tiền, chưa ký vòng này, phiếu 1 chữ ký do
--     Trưởng nhà hoặc Thủ quỹ với khoản ≤ hạn mức tự duyệt / chế độ ký chéo, phiếu 2 chữ ký: vai trò chưa dùng; Admin ký như Trưởng nhà/Thủ quỹ).
--     Câu hỏi "người đang đăng nhập còn ký được không" dùng app.fn_expense_can_sign(phiếu) của db/app/1044 (gói B — hộp việc + nút Duyệt).
--   • app.fn_reconcile_period(tháng, túi quỹ, số dư thực tế, giải trình): Thủ quỹ đối soát số dư cuối tháng (sao kê ngân hàng / kiểm đếm
--     tiền mặt) với sổ quỹ — số dư sổ quỹ do CSDL tính, chênh lệch ≠ 0 bắt buộc giải trình ≥ 10 ký tự; kỳ đã chốt thì không sửa được.
--     app.fn_period_unreconciled(kỳ) + app.fn_close_period_checked(kỳ, ghi chú): cấu hình finance.period.close_requires_reconciliation
--     áp cho quỹ ngân hàng VÀ quỹ chung duy nhất (gộp tiền mặt + ngân hàng) — trước đây chỉ quỹ loại ngân hàng nên ở môi trường một quỹ
--     cấu hình này không có tác dụng. Chốt kỳ / xác nhận / mở lại vẫn dùng app.fn_close_period / fn_confirm_period_close / fn_reopen_period.
--   • app.fn_create_onetime_plan(...): khoản thu MỘT LẦN cho những người được chọn (phí sự kiện/hành hương, tiền cọc, khoản khác) —
--     mức chung + (tùy chọn) mức riêng từng người, hạn nộp; sau đó ghi thu / "Tôi đã đóng" / nhắc quỹ chạy như khoản thường.
--   • app.fn_plan_sync_members(kế hoạch, [thành viên], dry): "Cập nhật người phải đóng" — thêm khoản phải thu cho người CÒN THIẾU
--     (người mới vào giữa kỳ quỹ định kỳ; người được thêm vào khoản thu một lần). Không bao giờ sửa/xóa khoản đã có (idempotent).
--     Khác app.fn_generate_contributions: người vào ở SAU hạn nộp vẫn được thêm (hạn riêng = hôm nay + 14 ngày nếu hạn chung đã qua).
--   • Liên kết trong thông báo quỹ trỏ thẳng chỗ xử lý: nhắc đóng quỹ ⇒ /thu-chi?tab=tong-quan&plan=<kế hoạch>&pay=<khoản> (mở ngay mã QR),
--     báo "đã đóng" / kết quả xác nhận ⇒ /thu-chi?tab=tong-quan&plan=<kế hoạch>, ủng hộ ⇒ /thu-chi?tab=ung-ho.
--     (CREATE OR REPLACE các hàm 1012/1014/1030 — GIỮ NGUYÊN mọi hành vi khác, chỉ đổi payload.link.)
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Loại thông báo
-- ---------------------------------------------------------------------
INSERT INTO public.notification_types (code, category, name_vi, default_channels, priority, requires_ack, is_mandatory) VALUES
  ('finance.expense_paid',  'finance', 'Phiếu chi đã chi / đã hoàn ứng',          ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false),
  ('finance.period_closed', 'finance', 'Sổ quỹ tháng đã chốt xong / được mở lại', ARRAY['in_app','web_push']::notification_channel_t[], 'normal', false, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Người nhận theo quyền
--    via_admin = true: người này có quyền CHỈ nhờ vai trò Admin (ứng dụng ưu tiên báo người giữ vai trò nghiệp vụ — Trưởng nhà, Thủ quỹ —
--    và chỉ báo Admin khi không còn ai khác, để Admin không bị ngập thông báo nghiệp vụ hằng ngày).
--    (Hàm mới của 1045 — DROP trước khi tạo để đổi được kiểu trả về khi chạy lại; không có đối tượng nào phụ thuộc.)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.fn_expense_signers(uuid);
DROP FUNCTION IF EXISTS app.fn_members_with_permission(text);

CREATE FUNCTION app.fn_members_with_permission(p_permission text)
RETURNS TABLE (member_id uuid, user_id uuid, via_admin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT m.id, u.id, NOT app.roles_have_permission(array_remove(r.roles, 'admin'), p_permission)
    FROM public.users u
    JOIN public.members m ON m.user_id = u.id AND m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')
   CROSS JOIN LATERAL (SELECT app.user_roles_of(u.id) AS roles) r
   WHERE u.deleted_at IS NULL AND u.status = 'active'
     AND ('admin' = ANY (r.roles) OR app.roles_have_permission(r.roles, p_permission))
$$;
ALTER FUNCTION app.fn_members_with_permission(text) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_members_with_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_members_with_permission(text) TO luuxa_worker, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_members_with_permission(text) IS
  'Thành viên đang ở (active/on_leave) có tài khoản đang dùng và có quyền p_permission (vai trò hiệu lực gồm ủy quyền; Admin luôn có). via_admin = chỉ có quyền nhờ vai trò Admin. Dùng chọn người nhận thông báo theo quyền. Chỉ worker/definer.';

-- ---------------------------------------------------------------------
-- 3. Ai còn ký được vòng duyệt hiện tại của một phiếu chi (đồng bộ luật với trigger tg_expense_approval_rules)
-- ---------------------------------------------------------------------
CREATE FUNCTION app.fn_expense_signers(p_voucher_id uuid)
RETURNS TABLE (user_id uuid, member_id uuid, role text, via_admin boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v          public.expense_vouchers%ROWTYPE;
  v_payee    uuid;
  v_used     text[];
  v_cross    boolean := COALESCE(app.setting_bool('finance.expense.cross_signer_mode'), false);
  v_head_inv boolean := false;
  v_solo     bigint  := app.setting_int('finance.expense.treasurer_solo_approve_max_vnd');
  v_me       uuid    := app.current_user_id();
BEGIN
  SELECT * INTO v FROM public.expense_vouchers ev WHERE ev.id = p_voucher_id;
  IF NOT FOUND OR v.status <> 'pending_approval' THEN RETURN; END IF;
  SELECT m.user_id INTO v_payee FROM public.members m WHERE m.id = v.paid_by_member_id;
  -- Người gọi từ ứng dụng chỉ hỏi được phiếu mình xem được (như RLS expense_vouchers)
  IF v_me IS NOT NULL AND NOT app.is_system_caller()
     AND v.requested_by <> v_me AND v_payee IS DISTINCT FROM v_me AND NOT app.has_permission('finance.expense.read_all') THEN
    RETURN;
  END IF;
  IF v_cross THEN
    v_head_inv := 'house_head' = ANY (app.user_roles_of(v.requested_by))
                  OR (v_payee IS NOT NULL AND 'house_head' = ANY (app.user_roles_of(v_payee)));
  END IF;
  SELECT COALESCE(array_agg(ea.approver_role), ARRAY[]::text[]) INTO v_used
    FROM public.expense_approvals ea
   WHERE ea.voucher_id = v.id AND ea.round = v.approval_round AND ea.decision = 'approved';

  RETURN QUERY
  WITH cand AS (
    SELECT u.id AS uid, m.id AS mid, r.roles AS own,
           CASE WHEN 'admin' = ANY (r.roles) THEN r.roles || ARRAY['house_head', 'treasurer'] ELSE r.roles END AS roles
      FROM public.users u
      JOIN public.members m ON m.user_id = u.id AND m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')
     CROSS JOIN LATERAL (SELECT app.user_roles_of(u.id) AS roles) r
     WHERE u.deleted_at IS NULL AND u.status = 'active'
       AND u.id <> v.requested_by AND u.id IS DISTINCT FROM v_payee
       AND NOT EXISTS (SELECT 1 FROM public.expense_approvals ea
                        WHERE ea.voucher_id = v.id AND ea.round = v.approval_round AND ea.approver_user_id = u.id)
  ), pick AS (
    SELECT c.uid, c.mid, c.own,
           CASE
             WHEN NOT app.roles_have_permission(c.roles, 'finance.expense.approve') THEN NULL
             WHEN v.required_approvals = 1 THEN
               CASE WHEN 'house_head' = ANY (c.roles) THEN 'house_head'
                    WHEN 'treasurer' = ANY (c.roles) AND (v.amount_vnd <= COALESCE(v_solo, 0) OR (v_cross AND v_head_inv)) THEN 'treasurer'
               END
             ELSE (SELECT x FROM unnest(ARRAY['house_head', 'treasurer', 'vice_head']) AS x
                    WHERE x = ANY (c.roles) AND NOT (x = ANY (v_used)) LIMIT 1)
           END AS role
      FROM cand c
  )
  SELECT p.uid, p.mid, p.role, NOT (p.role = ANY (p.own)) FROM pick p WHERE p.role IS NOT NULL;
END
$$;
ALTER FUNCTION app.fn_expense_signers(uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_expense_signers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_expense_signers(uuid) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_expense_signers(uuid) IS
  'Những người còn ký duyệt được vòng hiện tại của phiếu chi đang chờ duyệt (cùng luật trigger tg_expense_approval_rules: trừ người lập/người ứng tiền và người đã ký vòng này; phiếu 1 chữ ký: Trưởng nhà, hoặc Thủ quỹ khi ≤ hạn mức tự duyệt / chế độ chéo có Trưởng nhà liên quan; phiếu 2 chữ ký: vai trò chưa dùng; Admin ký như Trưởng nhà/Thủ quỹ — via_admin = true). Người gọi từ ứng dụng chỉ hỏi được phiếu mình xem được.';

-- ---------------------------------------------------------------------
-- 4. Đối soát số dư cuối tháng (period_reconciliations) — số dư sổ quỹ do CSDL tính, không tin số gửi lên
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_reconcile_period(p_month date, p_fund_id uuid, p_statement_vnd bigint, p_explanation text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid    uuid := app.current_user_id();
  v_month  date := date_trunc('month', p_month)::date;
  v_end    date;
  v_fund   public.funds%ROWTYPE;
  v_period public.financial_periods%ROWTYPE;
  v_ledger bigint;
  v_expl   text := NULLIF(btrim(COALESCE(p_explanation, '')), '');
  v_id     uuid;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.reconcile') THEN
    RAISE EXCEPTION 'Chỉ Thủ quỹ (hoặc Admin) được đối soát sổ quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_month IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn tháng đối soát.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_end := (v_month + interval '1 month' - interval '1 day')::date;
  IF app.local_today() < v_end THEN
    RAISE EXCEPTION 'Chưa hết tháng % — đối soát số dư cuối tháng từ ngày %.', to_char(v_month, 'MM/YYYY'), to_char(v_end, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_statement_vnd IS NULL OR p_statement_vnd < 0 OR p_statement_vnd > 100000000000 THEN
    RAISE EXCEPTION 'Số dư thực tế không hợp lệ (0 – 100.000.000.000 đ).' USING ERRCODE = 'check_violation';
  END IF;
  IF v_expl IS NOT NULL AND char_length(v_expl) > 1000 THEN
    RAISE EXCEPTION 'Giải trình tối đa 1.000 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_fund FROM public.funds f WHERE f.id = p_fund_id AND f.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Túi quỹ không tồn tại hoặc đã ngừng dùng.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_period FROM public.financial_periods fp WHERE fp.period_month = v_month FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tháng % chưa có phát sinh nào trong sổ quỹ — không cần đối soát hay chốt sổ.', to_char(v_month, 'MM/YYYY')
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_period.status <> 'open' THEN
    RAISE EXCEPTION 'BR-FIN-06: kỳ % đã chốt hoặc đang chờ xác nhận — không sửa được biên bản đối soát (mở lại kỳ nếu cần).', to_char(v_month, 'MM/YYYY')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  v_ledger := app.fn_fund_balance_at(p_fund_id, v_end);
  IF p_statement_vnd <> v_ledger AND (v_expl IS NULL OR char_length(v_expl) < 10) THEN
    RAISE EXCEPTION 'Số dư thực tế lệch sổ quỹ % — phải giải trình chênh lệch (tối thiểu 10 ký tự).', app.fn_vnd(p_statement_vnd - v_ledger)
      USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.period_reconciliations (period_id, fund_id, statement_balance_vnd, ledger_balance_vnd, explanation, reconciled_by)
  VALUES (v_period.id, p_fund_id, p_statement_vnd, v_ledger, v_expl, v_uid)
  ON CONFLICT (period_id, fund_id) DO UPDATE
     SET statement_balance_vnd = EXCLUDED.statement_balance_vnd,
         ledger_balance_vnd    = EXCLUDED.ledger_balance_vnd,
         explanation           = EXCLUDED.explanation,
         reconciled_by         = EXCLUDED.reconciled_by,
         reconciled_at         = now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'period_id', v_period.id, 'fund_id', p_fund_id, 'statement_vnd', p_statement_vnd,
                            'ledger_vnd', v_ledger, 'difference_vnd', p_statement_vnd - v_ledger);
END
$$;
ALTER FUNCTION app.fn_reconcile_period(date, uuid, bigint, text) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_reconcile_period(date, uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_reconcile_period(date, uuid, bigint, text) TO luuxa_app, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_reconcile_period(date, uuid, bigint, text) IS
  'Thủ quỹ (finance.reconcile) đối soát số dư cuối tháng của một túi quỹ: số dư thực tế (sao kê ngân hàng / kiểm đếm tiền mặt) so với số dư sổ quỹ tại ngày cuối tháng (CSDL tự tính). Chênh lệch ≠ 0 bắt buộc giải trình ≥ 10 ký tự. Chỉ khi đã hết tháng và kỳ còn mở; ghi đè biên bản cũ của cùng kỳ + túi quỹ.';

-- Túi quỹ PHẢI đối soát trước khi chốt kỳ nhưng chưa có biên bản / biên bản đã cũ. Áp cấu hình finance.period.close_requires_reconciliation
-- cho: quỹ ngân hàng (như app.fn_close_period) VÀ quỹ chung duy nhất của nhà (gộp tiền mặt + tài khoản ngân hàng — db/data 2026-10-07-05),
-- vì khi chỉ còn một túi quỹ đang dùng thì tiền trong tài khoản ngân hàng nằm trong chính túi đó.
CREATE OR REPLACE FUNCTION app.fn_period_unreconciled(p_period_id uuid)
RETURNS TABLE (fund_id uuid, fund_name text, missing boolean, ledger_vnd bigint, recorded_vnd bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_period public.financial_periods%ROWTYPE;
  v_end    date;
  v_single boolean;
BEGIN
  IF app.current_user_id() IS NOT NULL AND NOT app.is_system_caller()
     AND NOT app.has_any_permission(ARRAY['finance.ledger.read', 'finance.period.close', 'finance.period.confirm', 'finance.reconcile']) THEN
    RAISE EXCEPTION 'Không có quyền xem tình trạng đối soát sổ quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT COALESCE(app.setting_bool('finance.period.close_requires_reconciliation'), false) THEN RETURN; END IF;
  SELECT * INTO v_period FROM public.financial_periods fp WHERE fp.id = p_period_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_end := (v_period.period_month + interval '1 month' - interval '1 day')::date;
  SELECT count(*) = 1 INTO v_single FROM public.funds f WHERE f.deleted_at IS NULL AND f.is_active AND f.fund_type <> 'event';
  RETURN QUERY
  SELECT f.id, f.name, pr.id IS NULL, app.fn_fund_balance_at(f.id, v_end), pr.ledger_balance_vnd
    FROM public.funds f
    LEFT JOIN public.period_reconciliations pr ON pr.period_id = p_period_id AND pr.fund_id = f.id
   WHERE f.deleted_at IS NULL AND f.is_active
     AND (f.fund_type = 'bank' OR (v_single AND f.fund_type <> 'event'))
     AND (pr.id IS NULL OR pr.ledger_balance_vnd <> app.fn_fund_balance_at(f.id, v_end))
   ORDER BY f.code;
END
$$;
ALTER FUNCTION app.fn_period_unreconciled(uuid) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_period_unreconciled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_period_unreconciled(uuid) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_period_unreconciled(uuid) IS
  'Túi quỹ phải đối soát trước khi chốt kỳ (cấu hình finance.period.close_requires_reconciliation: quỹ ngân hàng + quỹ chung duy nhất gộp tiền mặt/ngân hàng) nhưng chưa có biên bản (missing) hoặc biên bản đã cũ (sổ quỹ đổi sau khi đối soát). Rỗng = đủ điều kiện.';

-- Bước 1 chốt sổ qua ứng dụng: kiểm thêm quỹ chung phải đối soát (app.fn_period_unreconciled) rồi gọi app.fn_close_period (thiết kế gốc).
CREATE OR REPLACE FUNCTION app.fn_close_period_checked(p_period_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  r       record;
  v_month text;
BEGIN
  IF app.lacks_permission('finance.period.close') THEN
    RAISE EXCEPTION 'Không có quyền chốt sổ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT to_char(fp.period_month, 'MM/YYYY') INTO v_month FROM public.financial_periods fp WHERE fp.id = p_period_id;
  SELECT * INTO r FROM app.fn_period_unreconciled(p_period_id) u LIMIT 1;
  IF FOUND THEN
    IF r.missing THEN
      RAISE EXCEPTION 'BR-FIN-09: túi quỹ "%" chưa được đối soát số dư cuối tháng % (cấu hình "Bắt buộc đối soát trước khi chốt sổ" đang bật).', r.fund_name, v_month
        USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'BR-FIN-09: biên bản đối soát của túi quỹ "%" đã cũ (sổ quỹ hiện % đ, biên bản ghi % đ) — hãy đối soát lại cho kỳ %.',
      r.fund_name, r.ledger_vnd, r.recorded_vnd, v_month USING ERRCODE = 'check_violation';
  END IF;
  RETURN app.fn_close_period(p_period_id, NULLIF(btrim(COALESCE(p_note, '')), ''));
END
$$;
ALTER FUNCTION app.fn_close_period_checked(uuid, text) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_close_period_checked(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_close_period_checked(uuid, text) TO luuxa_app, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_close_period_checked(uuid, text) IS
  'Chốt sổ bước 1 (Thủ quỹ) qua ứng dụng: như app.fn_close_period nhưng tôn trọng cấu hình bắt buộc đối soát cho cả quỹ chung duy nhất (gộp tiền mặt + ngân hàng), không chỉ quỹ loại ngân hàng.';

-- ---------------------------------------------------------------------
-- 5. Khoản thu MỘT LẦN cho những người được chọn (phí sự kiện / hành hương, tiền cọc, khoản khác)
--    p_members: [{"member_id": "<uuid>", "amount_vnd": <số | null = mức chung>}, …]
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_create_onetime_plan(
  p_name text, p_fee_type fee_type_t, p_amount_vnd bigint, p_due_date date, p_members jsonb,
  p_fund_id uuid DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid   uuid := app.current_user_id();
  v_name  text := btrim(COALESCE(p_name, ''));
  v_note  text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_today date := app.local_today();
  v_fund  uuid;
  v_code  text;
  v_id    uuid;
  v_n     integer;
  v_total bigint;
  v_cnt   integer;
  v_bad   text;
BEGIN
  IF app.lacks_permission('finance.contribution.plan.manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền lập khoản thu.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_fee_type IS NULL OR p_fee_type NOT IN ('event_fee', 'deposit', 'other') THEN
    RAISE EXCEPTION 'Loại khoản thu một lần phải là phí sự kiện, tiền cọc hoặc khoản khác.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_name) < 3 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Tên khoản thu từ 3 đến 120 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_amount_vnd IS NULL OR p_amount_vnd <= 0 OR p_amount_vnd > 100000000 THEN
    RAISE EXCEPTION 'Số tiền mỗi người phải lớn hơn 0 và tối đa 100.000.000 đ.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_due_date IS NULL OR p_due_date < v_today - 60 OR p_due_date > v_today + 366 THEN
    RAISE EXCEPTION 'Hạn nộp phải trong khoảng 60 ngày trước đến 1 năm tới.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Ghi chú tối đa 500 ký tự.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_members IS NULL OR jsonb_typeof(p_members) <> 'array' OR jsonb_array_length(p_members) = 0 THEN
    RAISE EXCEPTION 'Chọn ít nhất một người phải đóng.' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_array_length(p_members) > 200 THEN
    RAISE EXCEPTION 'Mỗi khoản thu tối đa 200 người.' USING ERRCODE = 'check_violation';
  END IF;

  -- Danh sách người: không trùng, đang ở nhà (đang ở / tạm vắng), mức riêng (nếu có) hợp lệ
  SELECT count(*), count(DISTINCT x.mid) INTO v_n, v_cnt
    FROM (SELECT (e ->> 'member_id')::uuid AS mid FROM jsonb_array_elements(p_members) e) x;
  IF v_cnt <> v_n OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_members) e WHERE NULLIF(e ->> 'member_id', '') IS NULL) THEN
    RAISE EXCEPTION 'Danh sách người phải đóng bị trùng hoặc thiếu người.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT string_agg(x.mid::text, ', ') INTO v_bad
    FROM (SELECT (e ->> 'member_id')::uuid AS mid FROM jsonb_array_elements(p_members) e) x
    LEFT JOIN public.members m ON m.id = x.mid AND m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')
   WHERE m.id IS NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Có người không còn ở nhà hoặc không tồn tại trong danh sách — tải lại trang rồi chọn lại.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_members) e
              WHERE NULLIF(e ->> 'amount_vnd', '') IS NOT NULL
                AND ((e ->> 'amount_vnd')::bigint <= 0 OR (e ->> 'amount_vnd')::bigint > 100000000)) THEN
    RAISE EXCEPTION 'Mức riêng của từng người phải lớn hơn 0 và tối đa 100.000.000 đ.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('contribution_plans:onetime'));
  v_fund := app.fn_plan_fund(p_fund_id);
  v_code := app.fn_next_plan_code(CASE p_fee_type WHEN 'event_fee' THEN 'SK-' WHEN 'deposit' THEN 'COC-' ELSE 'THU-' END || to_char(v_today, 'YYYY-MM'));
  INSERT INTO public.contribution_plans (code, name, fee_type, academic_year_id, period_month, amount_vnd, due_date, fund_id, created_by, note)
  VALUES (v_code, v_name, p_fee_type,
          (SELECT ay.id FROM public.academic_years ay WHERE v_today BETWEEN ay.starts_on AND ay.ends_on ORDER BY ay.starts_on LIMIT 1),
          date_trunc('month', v_today)::date, p_amount_vnd, p_due_date, v_fund, v_uid, v_note)
  RETURNING id INTO v_id;
  INSERT INTO public.contributions (plan_id, member_id, amount_due_vnd, due_date)
  SELECT v_id, (e ->> 'member_id')::uuid, COALESCE(NULLIF(e ->> 'amount_vnd', '')::bigint, p_amount_vnd), p_due_date
    FROM jsonb_array_elements(p_members) e;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.contribution_plans SET status = 'active', generated_at = now() WHERE id = v_id;
  SELECT COALESCE(sum(ct.amount_due_vnd), 0) INTO v_total FROM public.contributions ct WHERE ct.plan_id = v_id;
  RETURN jsonb_build_object('plan_id', v_id, 'code', v_code, 'name', v_name, 'generated', v_n, 'amount_vnd', p_amount_vnd,
                            'total_vnd', v_total, 'due_date', p_due_date);
END
$$;
ALTER FUNCTION app.fn_create_onetime_plan(text, fee_type_t, bigint, date, jsonb, uuid, text) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_create_onetime_plan(text, fee_type_t, bigint, date, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_create_onetime_plan(text, fee_type_t, bigint, date, jsonb, uuid, text) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_create_onetime_plan(text, fee_type_t, bigint, date, jsonb, uuid, text) IS
  'Lập khoản thu MỘT LẦN (event_fee / deposit / other) cho những thành viên được chọn (đang ở hoặc tạm vắng): mức chung + mức riêng từng người (tùy chọn), hạn nộp; tháng của kế hoạch = tháng lập. Cần finance.contribution.plan.manage. Sinh khoản phải thu ngay; ghi thu / báo đã đóng / nhắc quỹ dùng chung luồng của mọi kế hoạch.';

-- ---------------------------------------------------------------------
-- 6. "Cập nhật người phải đóng": thêm khoản phải thu cho người còn thiếu (idempotent — không sửa/xóa khoản đã có)
--    Quỹ định kỳ / quỹ tháng: mọi thành viên ĐANG Ở chưa có khoản (hoặc chỉ những người truyền vào), kỳ chưa kết thúc.
--    Khoản thu một lần: chỉ những người truyền vào (đang ở / tạm vắng). Tiền điện nước: không thêm (đã chia theo số người lúc lập).
--    p_dry = true: chỉ trả danh sách sẽ thêm (không ghi, không khóa — dùng được trong giao dịch chỉ đọc).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_plan_sync_members(p_plan_id uuid, p_member_ids uuid[] DEFAULT NULL, p_dry boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_plan    public.contribution_plans%ROWTYPE;
  v_today   date := app.local_today();
  v_end     date;
  v_due     date;
  v_list    jsonb;
  v_n       integer := 0;
  v_total   bigint := 0;
  v_dues    boolean;
BEGIN
  IF app.lacks_permission('finance.contribution.plan.manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền cập nhật người phải đóng.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_dry THEN
    SELECT * INTO v_plan FROM public.contribution_plans cp WHERE cp.id = p_plan_id;
  ELSE
    SELECT * INTO v_plan FROM public.contribution_plans cp WHERE cp.id = p_plan_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kế hoạch thu không tồn tại.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_plan.status IN ('cancelled', 'closed') THEN
    RAISE EXCEPTION 'Kế hoạch "%" đã hủy hoặc đã đóng.', v_plan.name USING ERRCODE = 'check_violation';
  END IF;
  IF v_plan.fee_type = 'utility' THEN
    RAISE EXCEPTION 'Tiền điện nước đã chia theo số người lúc lập — không thêm người (cần thì hủy kế hoạch khi chưa ai nộp rồi nhập lại).'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_plan.fee_type = 'donation' THEN
    RAISE EXCEPTION 'Kế hoạch quyên góp không có danh sách người phải đóng.' USING ERRCODE = 'check_violation';
  END IF;
  v_dues := v_plan.fee_type IN ('periodic_dues', 'monthly_dues');
  IF v_dues THEN
    v_end := (COALESCE(v_plan.period_end_month, v_plan.period_month, date_trunc('month', v_plan.due_date)::date) + interval '1 month' - interval '1 day')::date;
    IF v_end < v_today THEN
      RAISE EXCEPTION 'Kỳ "%" đã kết thúc — không thêm người phải đóng.', v_plan.name USING ERRCODE = 'check_violation';
    END IF;
  ELSIF p_member_ids IS NULL OR cardinality(p_member_ids) = 0 THEN
    RAISE EXCEPTION 'Khoản thu một lần: hãy chọn người cần thêm.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_member_ids IS NOT NULL AND cardinality(p_member_ids) > 200 THEN
    RAISE EXCEPTION 'Mỗi lần thêm tối đa 200 người.' USING ERRCODE = 'check_violation';
  END IF;
  -- Hạn nộp của người được thêm: hạn chung nếu chưa qua, không thì 14 ngày kể từ hôm nay
  v_due := CASE WHEN v_plan.due_date >= v_today THEN v_plan.due_date ELSE v_today + 14 END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('member_id', c.id, 'name', c.display_name, 'full_name', c.full_name, 'room', c.room,
                                               'amount_vnd', c.amount) ORDER BY c.room NULLS LAST, c.member_no), '[]'::jsonb),
         count(*), COALESCE(sum(c.amount), 0)
    INTO v_list, v_n, v_total
    FROM (
      SELECT m.id, m.display_name, m.full_name, m.member_no,
             (SELECT r.code FROM public.room_assignments ra JOIN public.rooms r ON r.id = ra.room_id
               WHERE ra.member_id = m.id AND ra.starts_on <= v_today AND (ra.ends_on IS NULL OR ra.ends_on > v_today) LIMIT 1) AS room,
             CASE WHEN v_plan.fee_type = 'periodic_dues' THEN app.fn_member_dues_amount(m.id, v_plan.amount_vnd) ELSE v_plan.amount_vnd END AS amount
        FROM public.members m
       WHERE m.deleted_at IS NULL
         AND (CASE WHEN p_member_ids IS NULL THEN m.status = 'active'
                   ELSE m.status IN ('active', 'on_leave') AND m.id = ANY (p_member_ids) END)
         AND (NOT v_dues OR m.joined_on <= v_end)
         AND NOT EXISTS (SELECT 1 FROM public.contributions ct WHERE ct.plan_id = v_plan.id AND ct.member_id = m.id)
    ) c;

  IF NOT p_dry AND v_n > 0 THEN
    INSERT INTO public.contributions (plan_id, member_id, amount_due_vnd, due_date)
    SELECT v_plan.id, (x ->> 'member_id')::uuid, (x ->> 'amount_vnd')::bigint, v_due
      FROM jsonb_array_elements(v_list) x
    ON CONFLICT (plan_id, member_id) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE public.contribution_plans SET status = 'active', generated_at = now() WHERE id = v_plan.id;
  END IF;
  RETURN jsonb_build_object('plan_id', v_plan.id, 'plan_name', v_plan.name, 'fee_type', v_plan.fee_type, 'due_date', v_due,
                            'added', v_n, 'total_vnd', v_total, 'members', v_list, 'dry', p_dry);
END
$$;
ALTER FUNCTION app.fn_plan_sync_members(uuid, uuid[], boolean) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.fn_plan_sync_members(uuid, uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fn_plan_sync_members(uuid, uuid[], boolean) TO luuxa_app, luuxa_worker, luuxa_definer, luuxa_owner;
COMMENT ON FUNCTION app.fn_plan_sync_members(uuid, uuid[], boolean) IS
  '"Cập nhật người phải đóng": thêm khoản phải thu cho người còn thiếu của kế hoạch (quỹ định kỳ: mọi người đang ở chưa có khoản, kỳ chưa kết thúc — cả người vào sau hạn nộp; khoản một lần: người được chọn). Mức = định mức của từng người (quỹ định kỳ) hoặc mức chung; hạn = hạn chung, hoặc hôm nay + 14 ngày nếu hạn chung đã qua. Không sửa/xóa khoản đã có. p_dry = xem trước. Cần finance.contribution.plan.manage (worker không gắn người dùng được phép — chạy tự động sau khi duyệt đơn vào nhà).';

-- ---------------------------------------------------------------------
-- 7. Liên kết thẳng trong thông báo quỹ (giữ nguyên hành vi 1012 / 1014 / 1030, chỉ đổi payload.link)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_contribution_claim(p_contribution_id uuid, p_method payment_method_t,
                                                     p_reference text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me   uuid := app.current_member_id();
  v_ct   record;
  v_id   uuid;
  v_name text;
BEGIN
  IF app.current_user_id() IS NULL OR v_me IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thành viên.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT ct.id, ct.member_id, ct.status::text AS status, (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) AS remaining,
         cp.name AS plan_name, cp.id AS plan_id
    INTO v_ct
    FROM public.contributions ct JOIN public.contribution_plans cp ON cp.id = ct.plan_id
   WHERE ct.id = p_contribution_id;
  IF NOT FOUND OR v_ct.member_id <> v_me THEN
    RAISE EXCEPTION 'Chỉ báo đã đóng được khoản của chính bạn.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_ct.status NOT IN ('unpaid', 'partial') OR v_ct.remaining <= 0 THEN
    RAISE EXCEPTION 'Khoản này không còn phải đóng.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contribution_claims c WHERE c.contribution_id = p_contribution_id AND c.status = 'pending') THEN
    RAISE EXCEPTION 'Bạn đã báo đã đóng khoản này — đang chờ Thủ quỹ xác nhận.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.contribution_claims (contribution_id, member_id, method, reference_code, note)
  VALUES (p_contribution_id, v_me, p_method, NULLIF(btrim(COALESCE(p_reference, '')), ''), NULLIF(btrim(COALESCE(p_note, '')), ''))
  RETURNING id INTO v_id;
  SELECT m.display_name INTO v_name FROM public.members m WHERE m.id = v_me;
  PERFORM app.fn_notify_roles(ARRAY['treasurer', 'house_head', 'admin'], 'finance.claim_pending',
    v_name || ' báo đã đóng ' || v_ct.plan_name,
    'Còn ' || app.fn_vnd(v_ct.remaining) || ' — hình thức: ' || CASE p_method WHEN 'cash' THEN 'tiền mặt' WHEN 'bank_transfer' THEN 'chuyển khoản' WHEN 'e_wallet' THEN 'ví điện tử' ELSE 'khác' END
      || '. Vào Thu chi để xác nhận.',
    jsonb_build_object('link', '/thu-chi?tab=tong-quan&plan=' || v_ct.plan_id::text), 'contribution_claims', v_id);
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION app.fn_contribution_claim_decide(p_claim_id uuid, p_approve boolean, p_fund_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid     uuid := app.current_user_id();
  v         public.contribution_claims%ROWTYPE;
  v_ct      record;
  v_payment uuid;
  v_link    text;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.contribution.record') THEN
    RAISE EXCEPTION 'Không có quyền xác nhận thu quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v FROM public.contribution_claims c WHERE c.id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy yêu cầu.' USING ERRCODE = 'no_data_found'; END IF;
  IF v.status <> 'pending' THEN
    RAISE EXCEPTION 'Yêu cầu này đã được xử lý.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT ct.status::text AS status, (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) AS remaining, cp.name AS plan_name, cp.id AS plan_id
    INTO v_ct
    FROM public.contributions ct JOIN public.contribution_plans cp ON cp.id = ct.plan_id
   WHERE ct.id = v.contribution_id;
  v_link := '/thu-chi?tab=tong-quan&plan=' || v_ct.plan_id::text;

  IF p_approve THEN
    IF p_fund_id IS NULL THEN RAISE EXCEPTION 'Chọn túi quỹ nhận tiền.' USING ERRCODE = 'invalid_parameter_value'; END IF;
    IF v_ct.status NOT IN ('unpaid', 'partial') OR v_ct.remaining <= 0 THEN
      RAISE EXCEPTION 'Khoản này không còn phải đóng (có thể đã được ghi thu).' USING ERRCODE = 'check_violation';
    END IF;
    v_payment := app.fn_record_contribution_payment(
      v.member_id, p_fund_id, v_ct.remaining, v.method, app.local_today(), v.reference_code,
      jsonb_build_array(jsonb_build_object('contribution_id', v.contribution_id, 'amount_vnd', v_ct.remaining)),
      NULL, COALESCE(NULLIF(btrim(p_note), ''), 'Xác nhận thành viên báo đã đóng'));
    UPDATE public.contribution_claims
       SET status = 'confirmed', decided_by = v_uid, decided_at = now(), decision_note = NULLIF(btrim(COALESCE(p_note, '')), ''), payment_id = v_payment
     WHERE id = p_claim_id;
    PERFORM app.fn_notify(v.member_id, 'finance.claim_decided', 'Đã xác nhận bạn đóng ' || v_ct.plan_name,
      'Thủ quỹ đã ghi nhận ' || app.fn_vnd(v_ct.remaining) || '. Cảm ơn bạn!', jsonb_build_object('link', v_link), 'contribution_claims', p_claim_id);
  ELSE
    UPDATE public.contribution_claims
       SET status = 'rejected', decided_by = v_uid, decided_at = now(), decision_note = NULLIF(btrim(COALESCE(p_note, '')), '')
     WHERE id = p_claim_id;
    PERFORM app.fn_notify(v.member_id, 'finance.claim_decided', 'Chưa ghi nhận bạn đóng ' || v_ct.plan_name,
      'Thủ quỹ chưa nhận được khoản này' || COALESCE(': ' || NULLIF(btrim(p_note), ''), '') || '. Vui lòng kiểm tra lại hoặc liên hệ Thủ quỹ.',
      jsonb_build_object('link', v_link), 'contribution_claims', p_claim_id);
  END IF;
  RETURN v_payment;
END
$$;

CREATE OR REPLACE FUNCTION app.fn_contribution_remind(p_contribution_ids uuid[], p_message text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid     uuid := app.current_user_id();
  v_row     record;
  v_sent    integer := 0;
  v_skipped integer := 0;
  v_late    integer;
BEGIN
  IF v_uid IS NULL OR NOT app.has_any_permission(ARRAY['finance.contribution.record', 'finance.contribution.plan.manage']) THEN
    RAISE EXCEPTION 'Không có quyền nhắc đóng quỹ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_contribution_ids IS NULL OR cardinality(p_contribution_ids) = 0 THEN RETURN jsonb_build_object('sent', 0, 'skipped', 0); END IF;
  IF cardinality(p_contribution_ids) > 200 THEN
    RAISE EXCEPTION 'Mỗi lần nhắc tối đa 200 khoản.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  FOR v_row IN
    SELECT ct.id, ct.member_id, ct.due_date, (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) AS remaining, cp.name AS plan_name, cp.id AS plan_id
      FROM public.contributions ct
      JOIN public.contribution_plans cp ON cp.id = ct.plan_id AND cp.status <> 'cancelled'
      JOIN public.members m ON m.id = ct.member_id AND m.deleted_at IS NULL
     WHERE ct.id = ANY (p_contribution_ids) AND ct.status IN ('unpaid', 'partial')
       AND (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) > 0
  LOOP
    IF EXISTS (SELECT 1 FROM public.contribution_reminders r
                WHERE r.contribution_id = v_row.id AND r.channel = 'in_app' AND r.sent_at > now() - interval '1 hour') THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    v_late := app.local_today() - v_row.due_date;
    PERFORM app.fn_notify(v_row.member_id,
      CASE WHEN v_late > 0 THEN 'finance.dues_overdue' ELSE 'finance.dues_reminder' END,
      'Nhắc đóng quỹ: ' || v_row.plan_name,
      'Bạn còn thiếu ' || app.fn_vnd(v_row.remaining) || ', hạn ' || to_char(v_row.due_date, 'DD/MM/YYYY')
        || CASE WHEN v_late > 0 THEN ' (quá hạn ' || v_late || ' ngày)' ELSE '' END || '.'
        || COALESCE(' ' || NULLIF(btrim(p_message), ''), ''),
      jsonb_build_object('link', '/thu-chi?tab=tong-quan&plan=' || v_row.plan_id::text || '&pay=' || v_row.id::text), 'contributions', v_row.id);
    INSERT INTO public.contribution_reminders (contribution_id, member_id, sent_by, channel) VALUES (v_row.id, v_row.member_id, v_uid, 'in_app');
    v_sent := v_sent + 1;
  END LOOP;
  RETURN jsonb_build_object('sent', v_sent, 'skipped', v_skipped);
END
$$;

CREATE OR REPLACE FUNCTION app.fn_dues_auto_remind(p_dry boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_before integer := COALESCE(app.setting_int('finance.reminder.days_before_due')::integer, 3);
  v_every  integer := GREATEST(1, COALESCE(app.setting_int('finance.reminder.overdue_every_days')::integer, 7));
  v_today  date    := app.local_today();
  r        record;
  v_kind   text;
  v_left   integer;
  v_out    jsonb   := '{}'::jsonb;
  v_cur    jsonb;
BEGIN
  FOR r IN
    SELECT ct.id, ct.member_id, ct.due_date, (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) AS remaining,
           cp.id AS plan_id, cp.name AS plan_name
      FROM public.contributions ct
      JOIN public.contribution_plans cp ON cp.id = ct.plan_id AND cp.status <> 'cancelled'
      JOIN public.members m ON m.id = ct.member_id AND m.deleted_at IS NULL AND m.status = 'active'
     WHERE ct.status IN ('unpaid', 'partial') AND (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) > 0
  LOOP
    v_left := r.due_date - v_today;
    v_kind := CASE
      WHEN v_left BETWEEN 0 AND v_before THEN 'soon'
      WHEN v_left < 0 AND ((-v_left - 1) % v_every) = 0 THEN 'overdue'
      ELSE NULL END;
    CONTINUE WHEN v_kind IS NULL;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.contribution_reminders x
                           WHERE x.contribution_id = r.id AND x.channel = 'in_app' AND x.sent_at > now() - interval '20 hours');
    IF NOT p_dry THEN
      PERFORM app.fn_notify(r.member_id,
        CASE WHEN v_kind = 'overdue' THEN 'finance.dues_overdue' ELSE 'finance.dues_reminder' END,
        left('Nhắc đóng quỹ: ' || r.plan_name, 200),
        'Bạn còn thiếu ' || app.fn_vnd(r.remaining) || ', hạn ' || to_char(r.due_date, 'DD/MM/YYYY')
          || CASE WHEN v_kind = 'overdue' THEN ' (quá hạn ' || (-v_left) || ' ngày)' WHEN v_left = 0 THEN ' (hôm nay)' ELSE ' (còn ' || v_left || ' ngày)' END || '.',
        jsonb_build_object('link', '/thu-chi?tab=tong-quan&plan=' || r.plan_id::text || '&pay=' || r.id::text), 'contributions', r.id);
      INSERT INTO public.contribution_reminders (contribution_id, member_id, sent_by, channel) VALUES (r.id, r.member_id, NULL, 'in_app');
    END IF;
    v_cur := COALESCE(v_out -> r.plan_id::text, jsonb_build_object('planId', r.plan_id, 'planName', r.plan_name, 'soon', 0, 'overdue', 0));
    v_cur := jsonb_set(v_cur, ARRAY[v_kind], to_jsonb(((v_cur ->> v_kind)::integer) + 1));
    v_out := jsonb_set(v_out, ARRAY[r.plan_id::text], v_cur, true);
  END LOOP;
  RETURN COALESCE((SELECT jsonb_agg(value) FROM jsonb_each(v_out)), '[]'::jsonb);
END
$$;

CREATE OR REPLACE FUNCTION app.fn_donation_record(
  p_donor_member_id uuid, p_donor_name text, p_amount_vnd bigint, p_donated_on date, p_method payment_method_t,
  p_fund_id uuid, p_reference text, p_note text, p_received boolean, p_client_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid    uuid := app.current_user_id();
  v_name   text;
  v_ledger uuid;
  v_id     uuid;
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.contribution.record') THEN
    RAISE EXCEPTION 'Chỉ Thủ quỹ, Trưởng nhà hoặc Admin được ghi nhận khoản ủng hộ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_amount_vnd IS NULL OR p_amount_vnd <= 0 THEN
    RAISE EXCEPTION 'Số tiền ủng hộ phải lớn hơn 0.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_donated_on IS NULL OR p_donated_on > app.local_today() THEN
    RAISE EXCEPTION 'Ngày ủng hộ không được ở tương lai.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_donor_member_id IS NOT NULL THEN
    SELECT COALESCE(m.display_name, m.full_name) INTO v_name FROM public.members m WHERE m.id = p_donor_member_id AND m.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy thành viên ủng hộ.' USING ERRCODE = 'no_data_found'; END IF;
  ELSE
    v_name := NULLIF(btrim(COALESCE(p_donor_name, '')), '');
    IF v_name IS NULL OR char_length(v_name) < 2 THEN
      RAISE EXCEPTION 'Hãy nhập tên người ủng hộ (hoặc ghi "Ẩn danh").' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_received THEN
    IF p_fund_id IS NULL THEN RAISE EXCEPTION 'Chọn túi quỹ nhận tiền.' USING ERRCODE = 'invalid_parameter_value'; END IF;
    v_ledger := app.fn_post_ledger_entry(p_fund_id, p_donated_on, 'in', p_amount_vnd, 'donation',
      'Ủng hộ quỹ nhà: ' || v_name || ' — ' || app.fn_vnd(p_amount_vnd) || COALESCE(' (' || NULLIF(btrim(p_reference), '') || ')', ''), p_client_request_id);
    SELECT d.id INTO v_id FROM public.donations d WHERE d.ledger_entry_id = v_ledger;
    IF FOUND THEN RETURN v_id; END IF; -- gọi lại cùng clientRequestId ⇒ không nhân đôi
  END IF;

  INSERT INTO public.donations (fund_id, donor_member_id, donor_name, amount_vnd, donated_on, method, reference_code, note, status, self_reported,
                                ledger_entry_id, recorded_by, decided_by, decided_at)
  VALUES (p_fund_id, p_donor_member_id, v_name, p_amount_vnd, p_donated_on, p_method,
          NULLIF(btrim(COALESCE(p_reference, '')), ''), NULLIF(btrim(COALESCE(p_note, '')), ''),
          CASE WHEN p_received THEN 'confirmed' ELSE 'pledged' END, false, v_ledger, v_uid,
          CASE WHEN p_received THEN v_uid END, CASE WHEN p_received THEN now() END)
  RETURNING id INTO v_id;

  IF p_donor_member_id IS NOT NULL THEN
    PERFORM app.fn_notify(p_donor_member_id, 'finance.donation_decided',
      CASE WHEN p_received THEN 'Quỹ nhà đã nhận khoản ủng hộ của bạn' ELSE 'Đã ghi nhận khoản ủng hộ của bạn' END,
      CASE WHEN p_received THEN 'Quỹ nhà đã nhận ' || app.fn_vnd(p_amount_vnd) || '. Xin cảm ơn bạn!' ELSE 'Khoản ' || app.fn_vnd(p_amount_vnd) || ' đang chờ nhận tiền — cảm ơn tấm lòng của bạn.' END,
      jsonb_build_object('link', '/thu-chi?tab=ung-ho'), 'donations', v_id);
  END IF;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION app.fn_donation_report(p_amount_vnd bigint, p_donated_on date, p_method payment_method_t, p_reference text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_me   uuid := app.current_member_id();
  v_name text;
  v_id   uuid;
BEGIN
  IF app.current_user_id() IS NULL OR v_me IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thành viên.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_amount_vnd IS NULL OR p_amount_vnd <= 0 THEN
    RAISE EXCEPTION 'Số tiền ủng hộ phải lớn hơn 0.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_donated_on IS NULL OR p_donated_on > app.local_today() THEN
    RAISE EXCEPTION 'Ngày ủng hộ không được ở tương lai.' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.donations d WHERE d.donor_member_id = v_me AND d.status = 'pending') >= 5 THEN
    RAISE EXCEPTION 'Bạn đang có quá nhiều khoản báo ủng hộ chờ xác nhận — hãy đợi Thủ quỹ xử lý.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(m.display_name, m.full_name) INTO v_name FROM public.members m WHERE m.id = v_me;
  INSERT INTO public.donations (donor_member_id, donor_name, amount_vnd, donated_on, method, reference_code, note, status, self_reported, recorded_by)
  VALUES (v_me, v_name, p_amount_vnd, p_donated_on, p_method, NULLIF(btrim(COALESCE(p_reference, '')), ''), NULLIF(btrim(COALESCE(p_note, '')), ''),
          'pending', true, app.current_user_id())
  RETURNING id INTO v_id;
  PERFORM app.fn_notify_roles(ARRAY['treasurer', 'house_head', 'admin'], 'finance.donation_pending',
    v_name || ' báo đã ủng hộ quỹ ' || app.fn_vnd(p_amount_vnd),
    'Hình thức: ' || CASE p_method WHEN 'cash' THEN 'tiền mặt' WHEN 'bank_transfer' THEN 'chuyển khoản' WHEN 'e_wallet' THEN 'ví điện tử' ELSE 'khác' END || '. Vào Thu chi → Ủng hộ để xác nhận.',
    jsonb_build_object('link', '/thu-chi?tab=ung-ho'), 'donations', v_id);
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION app.fn_donation_decide(p_id uuid, p_action text, p_fund_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid    uuid := app.current_user_id();
  v        public.donations%ROWTYPE;
  v_ledger uuid;
  v_note   text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF v_uid IS NULL OR NOT app.has_permission('finance.contribution.record') THEN
    RAISE EXCEPTION 'Chỉ Thủ quỹ, Trưởng nhà hoặc Admin được xử lý khoản ủng hộ.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v FROM public.donations d WHERE d.id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy khoản ủng hộ.' USING ERRCODE = 'no_data_found'; END IF;
  IF v.status NOT IN ('pledged', 'pending') THEN
    RAISE EXCEPTION 'Khoản ủng hộ này đã được xử lý.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_action = 'confirm' THEN
    IF p_fund_id IS NULL THEN RAISE EXCEPTION 'Chọn túi quỹ nhận tiền.' USING ERRCODE = 'invalid_parameter_value'; END IF;
    v_ledger := app.fn_post_ledger_entry(p_fund_id, v.donated_on, 'in', v.amount_vnd, 'donation',
      'Ủng hộ quỹ nhà: ' || v.donor_name || ' — ' || app.fn_vnd(v.amount_vnd) || COALESCE(' (' || v.reference_code || ')', ''), NULL);
    UPDATE public.donations SET status = 'confirmed', fund_id = p_fund_id, ledger_entry_id = v_ledger, decided_by = v_uid, decided_at = now(), decision_note = v_note WHERE id = p_id;
    IF v.donor_member_id IS NOT NULL THEN
      PERFORM app.fn_notify(v.donor_member_id, 'finance.donation_decided', 'Quỹ nhà đã nhận khoản ủng hộ của bạn',
        'Quỹ nhà đã nhận ' || app.fn_vnd(v.amount_vnd) || '. Xin cảm ơn bạn!', jsonb_build_object('link', '/thu-chi?tab=ung-ho'), 'donations', p_id);
    END IF;
  ELSIF p_action = 'reject' THEN
    IF v.status <> 'pending' THEN RAISE EXCEPTION 'Chỉ từ chối được khoản thành viên tự báo; khoản ghi nhận trước thì hãy hủy.' USING ERRCODE = 'check_violation'; END IF;
    IF v_note IS NULL OR char_length(v_note) < 5 THEN RAISE EXCEPTION 'Hãy ghi lý do từ chối (tối thiểu 5 ký tự).' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.donations SET status = 'rejected', decided_by = v_uid, decided_at = now(), decision_note = v_note WHERE id = p_id;
    IF v.donor_member_id IS NOT NULL THEN
      PERFORM app.fn_notify(v.donor_member_id, 'finance.donation_decided', 'Chưa ghi nhận khoản ủng hộ bạn báo',
        'Thủ quỹ chưa nhận được ' || app.fn_vnd(v.amount_vnd) || ': ' || v_note || '. Vui lòng kiểm tra lại hoặc liên hệ Thủ quỹ.', jsonb_build_object('link', '/thu-chi?tab=ung-ho'), 'donations', p_id);
    END IF;
  ELSIF p_action = 'cancel' THEN
    UPDATE public.donations SET status = 'cancelled', decided_by = v_uid, decided_at = now(), decision_note = v_note WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Thao tác không hợp lệ.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN p_id;
END
$$;

-- Quyền/chủ sở hữu các hàm thay thế (giữ như bản gốc 1012 / 1014 / 1030)
ALTER FUNCTION app.fn_contribution_claim(uuid, payment_method_t, text, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_contribution_claim_decide(uuid, boolean, uuid, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_contribution_remind(uuid[], text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_dues_auto_remind(boolean) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_donation_record(uuid, text, bigint, date, payment_method_t, uuid, text, text, boolean, uuid) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_donation_report(bigint, date, payment_method_t, text, text) OWNER TO luuxa_definer;
ALTER FUNCTION app.fn_donation_decide(uuid, text, uuid, text) OWNER TO luuxa_definer;

COMMIT;
