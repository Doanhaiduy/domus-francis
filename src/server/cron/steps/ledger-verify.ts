import "server-only";
import { notifyAdminsOnce } from "../../ops";
import type { CronStep } from "../types";

// Bước cron "ledger-verify" — gói F — Thu chi.
// Kiểm toàn vẹn chuỗi băm sổ cái mỗi tối (app.fn_verify_ledger_chain — 35_fn_finance_ledger.sql / vá 75): tính lại SHA-256 từng bút toán,
// đối chiếu prev_hash với dòng trước, phát hiện hụt số thứ tự và đầu chuỗi lệch funds.head_hash. Chuỗi hỏng = có ai đó sửa/xóa sổ quỹ
// ngoài hệ thống (thẳng trong CSDL) ⇒ báo Admin (system.ops_alert) MỘT lần mỗi ngày + ghi chú vào lịch sử chạy. Xem trước (dry): không gửi.
export const ledgerVerifyStep: CronStep = {
  name: "ledger-verify",
  slots: ["evening"],
  timeoutMs: 15_000,
  async run(c) {
    const rows = (
      await c.W((tx) =>
        tx.query<{ fund_code: string; name: string | null; entries_checked: string; first_broken_seq: string | null; head_matches: boolean }>(
          `SELECT v.fund_code, f.name, v.entries_checked, v.first_broken_seq, v.head_matches
             FROM app.fn_verify_ledger_chain() v LEFT JOIN funds f ON f.id = v.fund_id
            ORDER BY v.fund_code`
        )
      )
    ).rows;
    const total = rows.reduce((s, r) => s + Number(r.entries_checked), 0);
    const broken = rows.filter((r) => r.first_broken_seq !== null || !r.head_matches);
    if (!broken.length) {
      c.note(`Sổ quỹ toàn vẹn: ${total} bút toán / ${rows.length} túi quỹ.`);
      return;
    }
    const detail = broken
      .map((r) =>
        r.first_broken_seq !== null
          ? `${r.name ?? r.fund_code} (${r.fund_code}): chuỗi băm hỏng từ bút toán số ${r.first_broken_seq}`
          : `${r.name ?? r.fund_code} (${r.fund_code}): đầu chuỗi không khớp số bút toán (${r.entries_checked})`
      )
      .join("; ");
    c.note(`⚠ Chuỗi băm sổ quỹ HỎNG — ${detail}.`);
    if (c.dry) return;
    const sent = await notifyAdminsOnce(
      `ledger-chain:${c.today}`,
      "⚠ Sổ quỹ có dấu hiệu bị sửa ngoài hệ thống",
      `Kiểm tra chuỗi băm sổ quỹ tối ${c.today.split("-").reverse().join("/")}: ${detail}. Đối chiếu với bản sao lưu gần nhất và nhật ký kiểm toán; không chốt sổ cho tới khi làm rõ.`,
      { type: "system.ops_alert", link: "/thu-chi?tab=so-quy" }
    );
    if (sent) c.note("Đã báo Admin.");
  },
};
