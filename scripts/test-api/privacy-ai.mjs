// Kiểm thử QUYỀN RIÊNG TƯ — Trợ lý Lưu Xá (community.policy_rag) — KHÔNG có lưu lượng ra ngoài: máy chủ thử trỏ AI_TEST_BASE_URL tới
// máy chủ GIẢ ở 127.0.0.1:3199 chạy ngay trong tiến trình này (như scripts/test-api/ai.mjs), đóng vai Groq/Gemini và ghi lại prompt nhận được.
//   • ngữ cảnh lấy từ LUẬT NHÀ CHÍNH THỨC (house_rule_sections: cổng đóng 22:00, nhãn [LỖI ĐỎ]) — không còn bản mẫu sai giờ (22:30) của policy_documents
//   • TÊN thành viên trong câu hỏi và trong tài liệu gửi kèm (thông báo) được thay bằng nhãn "Thành viên A/B…", SĐT bị che; cùng người ⇒ cùng nhãn
//   • từ thường trùng tên ("Đức Mẹ", "đức tin", "Thông báo", "Bảo mật") KHÔNG bị che
//   • câu trả lời có nhãn ⇒ được trả lại tên thật trước khi hiển thị
import http from "node:http";
import pg from "pg";

const MOCK_PORT = 3199;

function startMock() {
  const state = { calls: [] };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        /* để trống */
      }
      const isGroq = req.url.startsWith("/groq/");
      state.calls.push({ url: req.url, body });
      const user = isGroq ? body.messages?.find((m) => m.role === "user")?.content ?? "" : body.contents?.[0]?.parts?.[0]?.text ?? "";
      const answer = user.includes("[thử tên]")
        ? { answer: "Theo thông báo, Thành viên A đọc sách và thành viên B giúp lễ.", confident: true, sources: ["S1"], actions: [] }
        : { answer: "Cổng đóng lúc 22:00 theo Luật nhà.", confident: true, sources: ["S1"], actions: [] };
      const text = JSON.stringify(answer);
      res.writeHead(200, { "content-type": "application/json" });
      if (isGroq) res.end(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 900, completion_tokens: 120 } }));
      else res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 } }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(MOCK_PORT, "127.0.0.1", () => resolve({ state, server }));
  });
}

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Quyền riêng tư — Trợ lý Lưu Xá: Luật nhà chính thức + che tên (máy chủ AI giả, không ra ngoài)");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const admin = await as("viet.vu@luuxa.local");
  const member = await as("kiet.do@luuxa.local");
  const prevMaster = (await sql("SELECT value FROM settings WHERE key = 'feature.ai.enabled'")).rows[0]?.value ?? false;
  const prevTask = (await sql("SELECT is_enabled FROM ai_task_types WHERE code = 'community.policy_rag'")).rows[0]?.is_enabled ?? false;
  const { state: mock, server } = await startMock();
  const rag = (question) => member.post("/api/v1/ai/run", { task: "community.policy_rag", input: { question } });
  let annId = null;
  try {
    eq((await admin.patch("/api/v1/settings", { changes: [{ key: "feature.ai.enabled", value: true }] })).status, 200, "bật công tắc tổng");
    eq((await admin.patch("/api/v1/ai/tasks/community.policy_rag", { enabled: true })).status, 200, "bật trợ lý");
    eq((await member.req("PUT", "/api/v1/ai/consent", { granted: true })).status, 200, "đồng ý AI");

    await test("Bản nội quy MẪU (giờ giới nghiêm 22:30) đã gỡ khỏi tài liệu hiện hành (db/data 2026-10-12-50)", async () => {
      const n = (await sql("SELECT count(*)::int AS n FROM policy_documents WHERE is_current AND content_md LIKE '%(BẢN MẪU)%'")).rows[0].n;
      eq(n, 0);
    });

    await test("Hỏi giờ giới nghiêm ⇒ prompt có đoạn Luật nhà chính thức (22:00), KHÔNG có bản mẫu 22:30", async () => {
      mock.calls.length = 0;
      const r = await rag(`Giờ giới nghiêm của nhà là mấy giờ? (lần thử ${tag})`);
      eq(r.status, 200, JSON.stringify(r.json));
      eq(mock.calls.length, 1, "gọi nhà cung cấp đúng một lần");
      const u = mock.calls[0].body.messages?.[1]?.content ?? "";
      ok(/Luật nhà/.test(u) && /22:00/.test(u), "phải có đoạn Luật nhà với giờ đóng cổng 22:00: " + u.slice(0, 800));
      ok(!/22:30/.test(u) && !/BẢN MẪU/i.test(u), "không được còn bản nội quy mẫu (22:30)");
      ok(/Luật nhà là nội quy CHÍNH THỨC/.test(u), "chỉ dẫn ưu tiên Luật nhà");
      eq(r.json.output.sources[0]?.kind, "policy");
      ok(/^Luật nhà/.test(r.json.output.sources[0]?.title ?? ""), "nguồn là Luật nhà: " + JSON.stringify(r.json.output.sources));
    });

    await test("Điều khoản LỖI ĐỎ giữ nhãn [LỖI ĐỎ] trong ngữ cảnh", async () => {
      mock.calls.length = 0;
      const r = await rag(`Dẫn nữ giới vào Nhà Chung thì sao? Lỗi đỏ là gì? (${tag})`);
      eq(r.status, 200, JSON.stringify(r.json));
      const u = mock.calls[0]?.body.messages?.[1]?.content ?? "";
      ok(/\[LỖI ĐỎ\]/.test(u), "phải có nhãn [LỖI ĐỎ]: " + u.slice(0, 600));
    });

    // Thông báo có tên thành viên + SĐT (tài liệu gửi kèm)
    const names = (await sql("SELECT m.display_name, m.full_name FROM members m JOIN users u ON u.id = m.user_id WHERE u.email IN ('hieu.bui@luuxa.local', 'tuan.nguyen@luuxa.local') ORDER BY u.email")).rows;
    const hieu = names[0]; // hieu.bui
    const tuan = names[1]; // tuan.nguyen
    const cat = (await sql("SELECT id FROM categories WHERE kind = 'announcement' ORDER BY code LIMIT 1")).rows[0]?.id;
    const author = (await sql("SELECT m.id FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = 'duc.tran@luuxa.local'")).rows[0]?.id;
    annId = (
      await sql(
        `INSERT INTO announcements (title, content, category_id, category_kind, author_member_id, status, published_at, expires_at)
         VALUES ($1, $2, $3, 'announcement', $4, 'published', now(), now() + interval '2 hours') RETURNING id`,
        [
          `Phân công lễ đặc biệt ${tag}`,
          `Lễ đặc biệt ${tag}: ${hieu.full_name} đọc sách thánh, anh ${tuan.display_name} giúp lễ. Cần đổi thì gọi 0905 123 456.`,
          cat,
          author,
        ],
      )
    ).rows[0].id;

    await test("Tên thành viên trong câu hỏi + thông báo gửi kèm bị thay bằng nhãn; SĐT bị che; câu trả lời được trả lại tên thật", async () => {
      mock.calls.length = 0;
      const r = await rag(`Ai đọc sách trong lễ đặc biệt ${tag}? Anh ${tuan.display_name} có giúp lễ không? [thử tên]`);
      eq(r.status, 200, JSON.stringify(r.json));
      eq(mock.calls.length, 1);
      const u = mock.calls[0].body.messages?.[1]?.content ?? "";
      ok(u.includes(`Lễ đặc biệt ${tag}`), "thông báo phải được truy hồi: " + u.slice(0, 500));
      for (const n of [hieu.full_name, hieu.display_name, tuan.full_name, tuan.display_name]) ok(!u.includes(n), `tên "${n}" không được gửi đi`);
      ok(/Thành viên A/.test(u) && /Thành viên B/.test(u), "tên được thay bằng nhãn ẩn danh");
      ok(!/0905\s?123\s?456/.test(u), "SĐT phải bị che");
      // Cùng một người ⇒ cùng nhãn ở câu hỏi và ở tài liệu: "Anh <tên>" trong câu hỏi và "anh <tên>" trong thông báo
      const q = /Câu hỏi hiện tại: (.*)/.exec(u)?.[1] ?? "";
      const labelQ = /Anh (Thành viên [A-Z])/.exec(q)?.[1];
      ok(labelQ && u.includes(`anh ${labelQ} giúp lễ`), `cùng nhãn cho cùng người (${labelQ}): ` + q);
      const ans = r.json.output.answer;
      ok(!/Thành viên [AB]\b/i.test(ans), "câu trả lời không còn nhãn: " + ans);
      ok(ans.includes(hieu.full_name) || ans.includes(tuan.display_name), "câu trả lời có tên thật: " + ans);
    });

    await test("Từ thường trùng tên KHÔNG bị che: “Đức Mẹ”, “đức tin”, “Thông báo”, “Bảo mật”, “Việt Nam”", async () => {
      mock.calls.length = 0;
      const r = await rag(`Đức Mẹ và đời sống đức tin trong Luật nhà? Thông báo về Bảo mật tài khoản ở Việt Nam? (${tag}b)`);
      eq(r.status, 200, JSON.stringify(r.json));
      const q = /Câu hỏi hiện tại: (.*)/.exec(mock.calls[0]?.body.messages?.[1]?.content ?? "")?.[1] ?? "";
      for (const w of ["Đức Mẹ", "đức tin", "Thông báo", "Bảo mật", "Việt Nam"]) ok(q.includes(w), `"${w}" phải giữ nguyên: ${q}`);
      ok(!/Thành viên [A-Z]/.test(q), "không có nhãn nào trong câu hỏi này: " + q);
    });
  } finally {
    server.close();
    if (annId) await sql("DELETE FROM announcements WHERE id = $1", [annId]).catch(() => sql("UPDATE announcements SET deleted_at = now() WHERE id = $1", [annId]));
    await member.req("PUT", "/api/v1/ai/consent", { granted: false }).catch(() => {});
    await admin.patch("/api/v1/ai/tasks/community.policy_rag", { enabled: !!prevTask }).catch(() => {});
    await admin.patch("/api/v1/settings", { changes: [{ key: "feature.ai.enabled", value: prevMaster === true }] }).catch(() => {});
  }
}
