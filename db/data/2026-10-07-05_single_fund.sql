-- =====================================================================
-- DỮ LIỆU 2026-10-07 — Gộp quỹ tiền mặt và tài khoản ngân hàng thành MỘT quỹ chung "Quỹ Lưu Xá".
--   Chỉ làm khi túi quỹ ngân hàng (BANK_MAIN) CHƯA có bút toán sổ cái và CHƯA có dòng sao kê nào (môi trường mới triển khai):
--   khi đó ngưng BANK_MAIN (xóa mềm) và đổi tên CASH thành "Quỹ Lưu Xá". Sổ cái bất biến nên môi trường đã có giao dịch ở cả hai túi
--   quỹ được GIỮ NGUYÊN (chỉ báo NOTICE) — không tự chuyển tiền. Idempotent.
-- =====================================================================
BEGIN;

DO $$
DECLARE
  v_bank_id  uuid;
  v_bank_seq bigint;
  v_lines    bigint;
  v_cash_id  uuid;
BEGIN
  SELECT id, last_seq INTO v_bank_id, v_bank_seq FROM public.funds WHERE code = 'BANK_MAIN' AND deleted_at IS NULL;
  SELECT id INTO v_cash_id FROM public.funds WHERE code = 'CASH' AND deleted_at IS NULL AND is_active;
  IF v_bank_id IS NULL THEN
    RAISE NOTICE 'Không còn túi quỹ BANK_MAIN đang dùng — bỏ qua.';
    RETURN;
  END IF;
  IF v_cash_id IS NULL THEN
    RAISE NOTICE 'Không có túi quỹ CASH đang dùng để làm quỹ chung — giữ nguyên BANK_MAIN.';
    RETURN;
  END IF;
  SELECT count(*) INTO v_lines FROM public.bank_statement_lines WHERE fund_id = v_bank_id;
  IF v_bank_seq <> 0 OR v_lines <> 0 THEN
    RAISE NOTICE 'BANK_MAIN đã có % bút toán và % dòng sao kê — giữ nguyên hai túi quỹ (cần chuyển quỹ thủ công nếu muốn gộp).', v_bank_seq, v_lines;
    RETURN;
  END IF;

  UPDATE public.funds
     SET name = 'Quỹ Lưu Xá',
         description = 'Quỹ chung của nhà: gộp tiền mặt Thủ quỹ giữ và tiền trong tài khoản ngân hàng thành một sổ.'
   WHERE id = v_cash_id;
  UPDATE public.funds SET is_active = false, deleted_at = now() WHERE id = v_bank_id;
  RAISE NOTICE 'Đã gộp quỹ: dùng một túi quỹ chung "Quỹ Lưu Xá" (CASH); ngưng BANK_MAIN.';
END
$$;

COMMIT;
