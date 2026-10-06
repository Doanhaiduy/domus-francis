-- =====================================================================
-- 71_review_fixes_ai.sql — SỬA CỔNG CHẶN AI (sau kiểm định độc lập)
-- Chạy SAU 70_review_fixes_ddl.sql. Idempotent.
-- Xử lý: E-011 (trần theo tác vụ không được thi hành), E-012 (thiếu dòng ngân sách tháng ⇒ không có trần),
--        E-013 (bỏ trống subject_member_id ⇒ lách kiểm đồng ý).
-- Quy ước mới: ai_task_types.monthly_budget_vnd > 0 là trần chi phí riêng của tác vụ; 0 hoặc NULL = tác vụ không tốn phí bên ngoài
--              (luật, bộ giải, mô hình tự host) nên không áp trần riêng.
-- =====================================================================
BEGIN;

INSERT INTO settings (key, value, value_type, description, min_value, max_value, is_public)
VALUES ('ai.monthly_budget_default_vnd', '200000'::jsonb, 'vnd',
        '[GIẢ ĐỊNH] Ngân sách AI mặc định mỗi tháng; cổng AI tự tạo dòng ai_budgets của tháng mới bằng giá trị này (đóng khi thiếu).', 0, 10000000, false)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION app.ensure_ai_budget_month(p_month date)
RETURNS public.ai_budgets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_b public.ai_budgets%ROWTYPE;
BEGIN
  INSERT INTO public.ai_budgets (month, limit_vnd, hard_stop)
  VALUES (p_month, app.setting_int('ai.monthly_budget_default_vnd'), true)
  ON CONFLICT (month) DO NOTHING;
  SELECT * INTO v_b FROM public.ai_budgets b WHERE b.month = p_month FOR UPDATE;
  RETURN v_b;
END
$$;
ALTER FUNCTION app.ensure_ai_budget_month(date) OWNER TO luuxa_definer;
REVOKE ALL ON FUNCTION app.ensure_ai_budget_month(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ensure_ai_budget_month(date) TO luuxa_worker, luuxa_definer;
COMMENT ON FUNCTION app.ensure_ai_budget_month(date) IS 'Trả về (và khóa FOR UPDATE) dòng ngân sách AI của tháng; tự tạo từ settings ai.monthly_budget_default_vnd nếu chưa có — cổng AI không bao giờ "mở khi thiếu" (E-012).';

CREATE OR REPLACE FUNCTION app.tg_ai_job_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_t         public.ai_task_types%ROWTYPE;
  v_b         public.ai_budgets%ROWTYPE;
  v_month     date := date_trunc('month', app.local_today())::date;
  v_task_used bigint;
  v_reason    text;
BEGIN
  SELECT * INTO v_t FROM public.ai_task_types t WHERE t.code = NEW.task_code;
  IF NOT FOUND OR NOT v_t.is_enabled THEN
    v_reason := 'Tính năng AI chưa được bật.';
  ELSIF NOT app.setting_bool('feature.ai.enabled') THEN
    v_reason := 'Tính năng AI đang tắt toàn hệ thống (settings feature.ai.enabled).';
  ELSIF NOT v_t.external_call_allowed AND COALESCE(NEW.provider, 'unspecified') NOT IN ('self_hosted', 'local', 'rule_based') THEN
    v_reason := 'BR-AI-02: dữ liệu loại ' || v_t.data_class || ' không được gửi tới dịch vụ AI bên thứ ba.';
  ELSIF v_t.required_consent_purpose IS NOT NULL AND NEW.subject_member_id IS NULL THEN
    -- E-013: tác vụ cần đồng ý thì PHẢI nêu chủ thể dữ liệu, không được bỏ trống để lách kiểm tra
    v_reason := 'BR-AI-03: tác vụ ' || v_t.code || ' xử lý dữ liệu cần đồng ý (' || v_t.required_consent_purpose || ') nên phải ghi rõ chủ thể dữ liệu.';
  ELSIF v_t.required_consent_purpose IS NOT NULL
        AND NOT app.has_active_consent(NEW.subject_member_id, v_t.required_consent_purpose) THEN
    v_reason := 'BR-AI-03: chủ thể dữ liệu chưa đồng ý mục đích ' || v_t.required_consent_purpose || '.';
  ELSE
    -- E-012: luôn có dòng ngân sách tháng (tự tạo từ settings) và khóa nó để hai job song song không cùng lọt khi sát trần
    v_b := app.ensure_ai_budget_month(v_month);
    IF v_b.hard_stop AND v_b.used_vnd >= v_b.limit_vnd THEN
      v_reason := 'BR-AI-04: đã vượt ngân sách AI tháng này.';
    ELSIF COALESCE(v_t.monthly_budget_vnd, 0) > 0 THEN
      -- E-011: trần riêng của tác vụ
      SELECT COALESCE(SUM(u.cost_vnd), 0) INTO v_task_used
        FROM public.ai_usage_daily u
       WHERE u.task_code = NEW.task_code AND u.usage_date >= v_month AND u.usage_date < (v_month + interval '1 month')::date;
      IF v_task_used >= v_t.monthly_budget_vnd THEN
        v_reason := 'BR-AI-04: tác vụ ' || v_t.code || ' đã dùng hết trần riêng ' || v_t.monthly_budget_vnd || ' đ của tháng.';
      END IF;
    END IF;
  END IF;
  IF v_reason IS NOT NULL THEN
    NEW.status := 'blocked';
    NEW.blocked_reason := v_reason;
    NEW.finished_at := now();
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION app.tg_ai_job_gate() IS 'BEFORE INSERT ai_jobs: chặn (status=blocked + lý do) nếu tác vụ chưa bật/công tắc tổng tắt, dữ liệu never_external gọi dịch vụ ngoài, tác vụ cần đồng ý mà không nêu chủ thể (E-013) hoặc chủ thể chưa đồng ý, vượt ngân sách tháng (dòng ngân sách tự tạo — E-012) hoặc vượt trần riêng của tác vụ (E-011).';

CREATE OR REPLACE FUNCTION app.tg_ai_job_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_b public.ai_budgets%ROWTYPE;
BEGIN
  IF NEW.status IN ('succeeded', 'failed') AND OLD.status NOT IN ('succeeded', 'failed') THEN
    INSERT INTO public.ai_usage_daily (usage_date, task_code, jobs, failed_jobs, tokens_in, tokens_out, cost_vnd)
    VALUES (app.local_today(), NEW.task_code, 1, CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END, NEW.tokens_in, NEW.tokens_out, NEW.cost_vnd)
    ON CONFLICT (usage_date, task_code) DO UPDATE
      SET jobs = public.ai_usage_daily.jobs + 1,
          failed_jobs = public.ai_usage_daily.failed_jobs + EXCLUDED.failed_jobs,
          tokens_in = public.ai_usage_daily.tokens_in + EXCLUDED.tokens_in,
          tokens_out = public.ai_usage_daily.tokens_out + EXCLUDED.tokens_out,
          cost_vnd = public.ai_usage_daily.cost_vnd + EXCLUDED.cost_vnd;
    -- E-012: job kết thúc sang tháng mới vẫn được cộng (dòng tháng tự tạo)
    v_b := app.ensure_ai_budget_month(date_trunc('month', app.local_today())::date);
    UPDATE public.ai_budgets SET used_vnd = used_vnd + NEW.cost_vnd, updated_at = now()
     WHERE month = v_b.month;
  END IF;
  RETURN NULL;
END
$$;
COMMENT ON FUNCTION app.tg_ai_job_usage() IS 'AFTER UPDATE OF status ai_jobs: cộng số liệu sử dụng theo ngày/tác vụ và cộng chi phí vào ngân sách tháng (tự tạo dòng tháng nếu thiếu — E-012).';

COMMIT;
