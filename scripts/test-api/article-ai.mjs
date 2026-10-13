// Kiểm thử TRỢ LÝ VIẾT BÀI nâng cấp — KHÔNG có lưu lượng ra ngoài: máy chủ thử trỏ AI_TEST_BASE_URL tới một máy chủ GIẢ ở 127.0.0.1:3199 đóng vai
// Groq, Gemini (kể cả công cụ tìm kiếm Google), Cloudflare Workers AI (văn bản, tạo ảnh, đọc ảnh), Vatican News (RSS) và Wikipedia tiếng Việt.
//   • bảng THÔNG TIN THẬT trong prompt (ngày Bổn mạng cấu hình, "hôm nay không phải ngày Bổn mạng"); không tự đưa hotline/lời kêu gọi khi kết bài "không kêu gọi"
//   • dò đầu ra: ngày Bổn mạng sai, giờ/số/SĐT không có trong dữ kiện, cụm sáo rỗng, lời kêu gọi; bản nháp thiếu dữ kiện ⇒ chỉ viết khung (thin)
//   • phỏng vấn (questions), tra cứu (Gemini + Vatican News + Wikipedia; hết hạn mức tìm kiếm ⇒ vẫn còn nguồn công khai)
//   • chỉnh văn: đoạn dài được cấp đủ token đầu ra; thêm ngày/số mới ⇒ bị đánh dấu; quá 8.000 ký tự ⇒ 400
//   • tạo ảnh bìa/minh họa: lưu như ảnh người dùng tải lên, nhãn (AI), mô tả không an toàn ⇒ dùng mô tả dựng sẵn, mô hình dự phòng, hết hạn mức Cloudflare
//     (tạm dừng, không gọi lại), trần ảnh mỗi ngày của cả nhà; chú thích ảnh chỉ cho ảnh bài viết; quyền article.manage cho mọi tác vụ
//   • Cloudflare làm văn bản dự phòng khi Groq + Gemini lỗi; cờ ảnh bìa AI (coverIsAi) + nhãn ở trang công khai; chọn ảnh từ Khoảnh khắc
import http from "node:http";
import pg from "pg";
import sharp from "sharp";

const MOCK_PORT = 3199;

async function jpeg(w, h, color) {
  return (await sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg({ quality: 70 }).toBuffer()).toString("base64");
}

const RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Vatican News</title>
<item><title><![CDATA[Tháng Mân Côi: Đức Thánh Cha kêu gọi lần chuỗi cầu cho hòa bình]]></title><link>https://www.vaticannews.va/vi/thanh-pho-vatican/news/2026-10/man-coi.html</link><description><![CDATA[<p>Nhân tháng Mân Côi, ĐTC mời gọi mọi người lần chuỗi.</p>]]></description><pubDate>Mon, 12 Oct 2026 08:00:00 +0000</pubDate></item>
<item><title>Tin khác không liên quan</title><link>https://www.vaticannews.va/vi/khac.html</link><description>Nội dung khác</description><pubDate>Sun, 11 Oct 2026 08:00:00 +0000</pubDate></item>
</channel></rss>`;

/** Máy chủ giả: hành vi theo state; ghi lại mọi yêu cầu (kèm prompt) để kiểm. Xuất ra để scripts/e2e/article-ai-ui.mjs dùng lại. */
export async function startMock() {
  const state = { groq: "ok", gemini: "ok", cftext: "ok", cf: "ok", search: "ok", calls: [] };
  const jpgKlein = await jpeg(1280, 800, { r: 120, g: 80, b: 200 });
  const jpgSchnell = await jpeg(1024, 1024, { r: 220, g: 160, b: 60 });

  const answer = (user) => {
    if (user.includes("Gợi ý 5 đề tài"))
      return { ideas: [{ title: "Tháng Mân Côi ở nhà", angle: "Kể một buổi lần chuỗi tối thứ Sáu", basis: "Tháng Mân Côi" }, { title: "Chuẩn bị mùa Vọng", angle: "Vài việc nhỏ trong nhà", basis: "Mùa Vọng sắp tới" }] };
    if (user.includes("CÂU HỎI NGẮN")) return { questions: ["Buổi lần chuỗi diễn ra khi nào và ở đâu?", "Ai hướng dẫn và có khoảng bao nhiêu anh em?", "Chi tiết nào bạn nhớ nhất?"] };
    if (user.includes("Viết một bài đăng cho trang tin"))
      return {
        title: "Tối thứ Sáu lần chuỗi ở sân nhà",
        summary: "Một buổi tối yên tĩnh của anh em.",
        content: "Hôm nay 17/03 là ngày Bổn mạng của nhà. Hãy cùng nhau lần chuỗi. Có 120 người tham dự lúc 19h45. Gọi hotline 0912 345 678 ngay.\n\n> “Ngày nào cũng học, cũng đi làm thêm, tối về lần chuỗi thấy lòng nhẹ đi.” - Một anh em chia sẻ.\n\nCuối bài [cần bổ sung: tên cha hướng dẫn].",
      };
    if (user.includes("Nhiệm vụ:")) return { text: "Đoạn đã chỉnh, thêm 50 người tham dự vào 22/09." };
    if (user.includes("Đọc bài viết dưới đây")) return { titles: ["Tiêu đề một", "Tiêu đề hai", "Tiêu đề ba", "Tiêu đề bốn"], summary: "Tóm tắt ngắn gọn." };
    if (user.includes("Write the image prompt")) {
      if (user.includes("ep-nguoi")) return { prompt: "A priest praying with raised hands beside a statue of Jesus in a church", alt: "Cha đang cầu nguyện" };
      return { prompt: "A calm stone church courtyard with a wooden bench and a bell tower at golden hour, wide composition", alt: "Sân nhà thờ có tháp chuông" };
    }
    return { message: "không rõ" };
  };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const url = req.url ?? "";
      const send = (status, obj, type = "application/json") => {
        res.writeHead(status, { "content-type": type });
        res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
      };
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        /* không phải JSON (multipart / GET) */
      }

      // ---- Groq
      if (url.startsWith("/groq/")) {
        const user = body.messages?.find((m) => m.role === "user")?.content ?? "";
        state.calls.push({ kind: "text", provider: "groq", user, max: body.max_tokens });
        if (state.groq === "down") return send(503, { error: "down" });
        return send(200, { choices: [{ message: { content: JSON.stringify(answer(user)) } }], usage: { prompt_tokens: 800, completion_tokens: 200 } });
      }
      // ---- Gemini (có/không công cụ tìm kiếm)
      if (url.startsWith("/gemini/")) {
        const user = body.contents?.[0]?.parts?.[0]?.text ?? "";
        if (body.tools?.[0]?.google_search) {
          state.calls.push({ kind: "search", provider: "gemini", url, user });
          if (state.search === "429") return send(429, { error: "quota" });
          return send(200, {
            candidates: [
              {
                content: { parts: [{ text: "Dưới đây là kết quả:\n- Tháng 10 là tháng kính Đức Mẹ Mân Côi theo truyền thống Giáo hội.\n- Lễ Mân Côi được mừng ngày 7/10 hằng năm.\n**Lưu ý** không có bằng chứng khác." }] },
                groundingMetadata: {
                  webSearchQueries: ["tháng mân côi 2026"],
                  groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123", title: "vaticannews.va" } }, { web: { uri: "http://khong-https.example/x", title: "bỏ" } }],
                },
              },
            ],
          });
        }
        state.calls.push({ kind: "text", provider: "gemini", user });
        if (state.gemini === "down") return send(503, { error: "down" });
        return send(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(answer(user)) }] } }], usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 200 } });
      }
      // ---- Cloudflare Workers AI
      if (url.startsWith("/cloudflare/")) {
        if (/\/ai\/v1\/chat\/completions$/.test(url)) {
          const userMsg = body.messages?.find((m) => m.role === "user");
          if (Array.isArray(userMsg?.content)) {
            state.calls.push({ kind: "vision", model: body.model, system: body.messages[0].content, hasImage: userMsg.content.some((p) => p.type === "image_url" && String(p.image_url?.url).startsWith("data:image/jpeg;base64,")) });
            if (state.cf === "quota") return send(429, { success: false, errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons" }] });
            return send(200, { choices: [{ message: { content: "Sân trong có đài phun nước và tháp chuông phía xa." } }] });
          }
          const user = userMsg?.content ?? "";
          state.calls.push({ kind: "text", provider: "cloudflare", user, model: body.model });
          if (state.cftext === "down") return send(503, { error: "down" });
          return send(200, { choices: [{ message: { content: JSON.stringify(answer(user)) } }], usage: { prompt_tokens: 800, completion_tokens: 200 } });
        }
        const model = /\/ai\/run\/(.+)$/.exec(url)?.[1] ?? "";
        const klein = model.includes("flux-2");
        const prompt = klein ? /name="prompt"\r\n\r\n([\s\S]*?)\r\n--/.exec(raw)?.[1] : body.prompt;
        const width = klein ? Number(/name="width"\r\n\r\n(\d+)/.exec(raw)?.[1]) : undefined;
        const height = klein ? Number(/name="height"\r\n\r\n(\d+)/.exec(raw)?.[1]) : undefined;
        state.calls.push({ kind: "image", model, prompt, width, height });
        if (state.cf === "quota") return send(429, { success: false, errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons" }] });
        if (state.cf === "klein-500" && klein) return send(500, { success: false, errors: [{ code: 7000, message: "boom" }] });
        return send(200, { success: true, errors: [], result: { image: klein ? jpgKlein : jpgSchnell } });
      }
      // ---- Vatican News + Wikipedia
      if (url.startsWith("/vaticannews/")) return send(200, RSS, "application/xml");
      if (url.startsWith("/wikipedia/w/rest.php/v1/search/page")) return send(200, { pages: [{ key: "Kinh_Mân_Côi", title: "Kinh Mân Côi", description: "Kinh nguyện" }] });
      if (url.startsWith("/wikipedia/api/rest_v1/page/summary/")) return send(200, { title: "Kinh Mân Côi", extract: "Kinh Mân Côi là một hình thức cầu nguyện của người Công giáo, lần chuỗi hạt để suy niệm các mầu nhiệm." });
      return send(404, { error: "không có" });
    });
  });
  await new Promise((resolve) => server.listen(MOCK_PORT, "127.0.0.1", resolve));
  return { state, server };
}

export async function run({ as, test, eq, ok, section, BASE, Client, pgConfig }) {
  section("Trợ lý viết bài — thông tin thật, dò đầu ra, ảnh AI, tra cứu (máy chủ giả, không ra ngoài)");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const { state: mock, server } = await startMock();
  const suffix = Date.now().toString(36);
  const head = await as("duc.tran@luuxa.local"); // Trưởng nhà: article.manage + ai.use
  const member = await as("tuan.nguyen@luuxa.local");
  const admin = await as("viet.vu@luuxa.local");
  const code = (r) => r.json?.code ?? "";
  const ai = (c, task, input, force) => c.post("/api/v1/ai/run", { task, input, ...(force ? { force: true } : {}) });
  const assist = (c, input, force) => ai(c, "content.article_assist", input, force);
  const lastText = (provider) => [...mock.calls].reverse().find((c) => c.kind === "text" && (!provider || c.provider === provider));
  const reset = () => {
    mock.groq = mock.gemini = mock.cftext = mock.cf = "ok";
    mock.search = "ok";
    mock.calls.length = 0;
  };
  const cleanState = async () => {
    // ảnh/nhật ký của lượt chạy trước (cùng DB) không được tính vào hạn mức hôm nay + bỏ trạng thái hết hạn mức/ngắt mạch
    await sql("UPDATE ai_jobs SET created_at = created_at - interval '2 days' WHERE task_code IN ('content.article_image','content.image_caption','content.article_research','content.article_assist') AND created_at > now() - interval '1 day'");
    await sql("DELETE FROM ai_provider_state WHERE provider IN ('groq','gemini','cloudflare','cloudflare_image')");
    await sql("UPDATE ai_budgets SET used_vnd = 0 WHERE month = date_trunc('month', app.local_today())::date");
  };

  try {
    await cleanState();
    eq((await admin.patch("/api/v1/settings", { changes: [{ key: "feature.ai.enabled", value: true }] })).status, 200, "bật công tắc tổng");
    for (const t of ["content.article_assist", "content.article_research", "content.article_image", "content.image_caption"]) {
      eq((await admin.patch(`/api/v1/ai/tasks/${t}`, { enabled: true })).status, 200, `bật ${t}`);
    }
    reset();

    // ------------------------------------------------------------------ trạng thái + quyền
    await test("Trạng thái AI: có Cloudflare, 3 tác vụ mới dùng được, khóa không lộ ra client", async () => {
      const r = await head.get("/api/v1/ai/status");
      eq(r.status, 200);
      const cf = r.json.providers.find((p) => p.id === "cloudflare");
      ok(cf && cf.configured === true, "Cloudflare phải ở trạng thái đã cấu hình");
      for (const t of ["content.article_research", "content.article_image", "content.image_caption"]) {
        ok(r.json.available.includes(t), `${t} phải dùng được`);
        ok(r.json.tasks.find((x) => x.code === t)?.configured === true, `${t}.configured`);
      }
      ok(!JSON.stringify(r.json).includes("offline-test-cf-token"), "token Cloudflare bị lộ trong /ai/status");
    });

    await test("Thành viên thường (không có article.manage) ⇒ 403 cho mọi tác vụ của trợ lý viết bài", async () => {
      eq((await assist(member, { action: "ideas", category: "tin-tuc" })).status, 403);
      eq((await ai(member, "content.article_research", { topic: "Kinh Mân Côi", category: "chia-se" })).status, 403);
      eq((await ai(member, "content.article_image", { purpose: "cover", title: "Tiêu đề thử", category: "tin-tuc", style: "flat", count: 1 })).status, 403);
      eq((await ai(member, "content.image_caption", { fileId: "00000000-0000-4000-8000-000000000000" })).status, 403);
      eq(mock.calls.length, 0, "bị chặn thì không được gọi ra ngoài");
    });

    // ------------------------------------------------------------------ thông tin thật + dò đầu ra
    await test("Gợi ý đề tài: prompt có bảng THÔNG TIN THẬT (Bổn mạng 08/12, hôm nay không phải ngày Bổn mạng); đề tài có cơ sở (basis)", async () => {
      reset();
      const r = await assist(head, { action: "ideas", category: "hoat-dong", note: `thử ${suffix}` });
      eq(r.status, 200, JSON.stringify(r.json));
      ok(r.json.output.ideas.length >= 2 && r.json.output.ideas[0].basis, "mỗi đề tài có cơ sở");
      const p = lastText("groq").user;
      ok(p.includes("THÔNG TIN THẬT"), "thiếu bảng thông tin thật");
      ok(/Bổn mạng của nhà: .*mừng ngày 08\/12/.test(p), "ngày Bổn mạng theo cấu hình phải là 08/12:\n" + p.slice(0, 900));
      if (new Date().toISOString().slice(5, 10) !== "12-08") ok(p.includes("HÔM NAY KHÔNG PHẢI ngày Bổn mạng"), "phải nói rõ hôm nay không phải ngày Bổn mạng");
      ok(/Hôm nay: .* \d{2}\/\d{2}\/\d{4}/.test(p), "thiếu ngày hôm nay do hệ thống tính");
    });

    await test("Phỏng vấn: AI trả 2–5 câu hỏi để người soạn kể dữ kiện thật", async () => {
      reset();
      const r = await assist(head, { action: "questions", topic: `Buổi lần chuỗi tối thứ Sáu ${suffix}`, category: "hoat-dong" });
      eq(r.status, 200, JSON.stringify(r.json));
      ok(r.json.output.questions.length >= 2 && r.json.output.questions.length <= 5, "số câu hỏi");
    });

    await test("Viết nháp KHÔNG có dữ kiện ⇒ thin (chỉ khung), không đưa hotline vào prompt; đầu ra bị đánh dấu patron/giờ/số/SĐT/sáo rỗng/kêu gọi", async () => {
      reset();
      const r = await assist(head, { action: "draft", topic: `Lần chuỗi tối thứ Sáu ${suffix}`, category: "hoat-dong" });
      eq(r.status, 200, JSON.stringify(r.json));
      const o = r.json.output;
      eq(o.thin, true, "thiếu dữ kiện ⇒ thin");
      const p = lastText("groq").user;
      ok(p.includes("CHƯA cung cấp dữ kiện thật"), "prompt phải bảo AI chỉ viết khung");
      ok(!p.includes("THÔNG TIN LIÊN HỆ") && !/Hotline:/.test(p), "kết bài 'không kêu gọi' thì không đưa thông tin liên hệ vào prompt");
      ok(p.includes("KẾT BÀI: khép bài tự nhiên") && p.includes("KHÔNG kêu gọi"), "prompt phải nêu kiểu kết bài");
      const kinds = new Set(o.flags.map((f) => f.kind));
      for (const k of ["patron", "time", "number", "phone", "cliche", "cta", "quote"]) ok(kinds.has(k), `thiếu cờ ${k}: ${JSON.stringify(o.flags)}`);
      ok(o.flags.some((f) => f.kind === "patron" && /17\/03/.test(f.text) && /08\/12/.test(f.note ?? "")), "cờ patron phải nêu ngày đúng 08/12");
      ok(o.flags.some((f) => f.kind === "phone" && f.text.includes("0912")), "cờ SĐT");
      ok(!/\[.*\]\(/.test(o.content), "bản nháp không được có liên kết/ảnh");
    });

    await test("Viết nháp CÓ dữ kiện + kết bài kèm liên hệ + tư liệu: prompt có THÔNG TIN LIÊN HỆ, tư liệu; không còn cờ cta; không thin", async () => {
      reset();
      const r = await assist(head, {
        action: "draft",
        topic: `Buổi lần chuỗi ${suffix}`,
        keyPoints: "Tối thứ Sáu 9/10, 20 anh em lần chuỗi ở sân nhà, cha linh hướng nhắc lòng tin cậy vào Đức Mẹ.",
        answers: [{ q: "Ai hướng dẫn?", a: "Cha linh hướng" }],
        research: { notes: ["Lễ Mân Côi được mừng ngày 7/10 hằng năm."], sources: [{ title: "vaticannews.va", url: "https://www.vaticannews.va/vi/x.html" }] },
        category: "hoat-dong",
        tone: "plain",
        length: "short",
        ending: "contact",
      });
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.output.thin, false);
      const p = lastText("groq").user;
      ok(p.includes("THÔNG TIN LIÊN HỆ"), "thiếu mục thông tin liên hệ");
      ok(p.includes("Tư liệu đã tra cứu") && p.includes("Lễ Mân Côi được mừng ngày 7/10"), "thiếu tư liệu đã chọn");
      ok(p.includes("Đáp: Cha linh hướng"), "thiếu câu trả lời phỏng vấn");
      ok(!r.json.output.flags.some((f) => f.kind === "cta"), "đã chọn kết bài kèm liên hệ thì không đánh dấu cta");
    });

    await test("Chỉnh văn: > 8.000 ký tự ⇒ 400; đoạn ~6.000 ký tự được cấp đủ token đầu ra; thêm ngày/số mới ⇒ bị đánh dấu", async () => {
      reset();
      eq((await assist(head, { action: "improve", text: "a".repeat(8001), mode: "polish" })).status, 400);
      const text = ("Anh em trong nhà cùng nhau dọn dẹp sân và chuẩn bị bữa cơm chung. ".repeat(90)).slice(0, 6000) + suffix;
      const r = await assist(head, { action: "improve", text, mode: "longer" });
      eq(r.status, 200, JSON.stringify(r.json));
      const call = lastText("groq");
      ok(call.max > 3500, `giới hạn token đầu ra phải đủ cho đoạn dài (nhận ${call.max})`);
      const kinds = r.json.output.flags.map((f) => f.kind);
      ok(kinds.includes("number") && kinds.includes("date"), "số/ngày mới do AI thêm phải bị đánh dấu: " + JSON.stringify(r.json.output.flags));
    });

    await test("Gợi ý tiêu đề + tóm tắt vẫn chạy", async () => {
      reset();
      const r = await assist(head, { action: "meta", content: `Nội dung bài viết thử đủ dài để AI gợi ý tiêu đề và tóm tắt ${suffix}.`, title: "Tiêu đề" });
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.output.titles.length, 4);
    });

    // ------------------------------------------------------------------ tra cứu
    await test("Tra cứu: Gemini + tìm kiếm Google + Vatican News + Wikipedia; nguồn http bị bỏ; ghi nhật ký job gemini, chi phí 0", async () => {
      reset();
      const r = await ai(head, "content.article_research", { topic: `Kinh Mân Côi tháng mười ${suffix}`, category: "chia-se" });
      eq(r.status, 200, JSON.stringify(r.json));
      const o = r.json.output;
      eq(o.webSearch, "ok");
      ok(o.notes.some((n) => n.startsWith("Tháng 10 là tháng kính Đức Mẹ")), "ghi chú từ Gemini phải được tách theo gạch đầu dòng: " + JSON.stringify(o.notes));
      ok(o.notes.some((n) => n.startsWith("Vatican News")), "thiếu tin Vatican News");
      ok(o.notes.some((n) => n.startsWith("Wikipedia")), "thiếu Wikipedia");
      ok(o.sources.some((s) => s.kind === "web" && s.url.startsWith("https://vertexaisearch.cloud.google.com/")), "thiếu nguồn web (https)");
      ok(!o.sources.some((s) => s.url.startsWith("http://")), "nguồn http phải bị bỏ");
      ok(o.sources.some((s) => s.kind === "vatican") && o.sources.some((s) => s.kind === "wikipedia"));
      const s = mock.calls.find((c) => c.kind === "search");
      ok(s && /gemini-2\.5-flash/.test(s.url), "phải gọi mô hình tìm kiếm gemini-2.5-flash");
      const job = (await sql("SELECT provider, cost_vnd FROM ai_jobs WHERE id = $1", [r.json.jobId])).rows[0];
      eq(job.provider, "gemini");
      eq(Number(job.cost_vnd), 0);
    });

    await test("Tra cứu khi Gemini hết lượt (429) ⇒ webSearch 'unavailable' nhưng vẫn có Vatican News + Wikipedia", async () => {
      reset();
      mock.search = "429";
      const r = await ai(head, "content.article_research", { topic: `Kinh Mân Côi lần chuỗi ${suffix}x`, category: "chia-se" });
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.output.webSearch, "unavailable");
      ok(r.json.output.notes.some((n) => n.startsWith("Vatican News")), "còn Vatican News");
      ok(r.json.output.sources.length >= 2, "còn nguồn công khai");
    });

    // ------------------------------------------------------------------ ảnh AI
    const baseImg = { purpose: "cover", category: "tin-tuc", style: "flat" };
    let aiFileId;
    await test("Tạo ảnh bìa: 2 phương án, đúng 1280×800, lưu như ảnh người dùng tải lên (đọc được), nhãn (AI), job Cloudflare chi phí 0", async () => {
      reset();
      const r = await ai(head, "content.article_image", { ...baseImg, title: `Sân nhà thờ ${suffix}`, summary: "Một buổi chiều yên tĩnh", count: 2 });
      eq(r.status, 200, JSON.stringify(r.json));
      const o = r.json.output;
      eq(o.images.length, 2);
      ok(o.images.every((i) => i.alt.startsWith("(AI) ")), "alt phải có tiền tố (AI)");
      eq(o.fallback, false);
      aiFileId = o.images[0].fileId;
      const imgs = mock.calls.filter((c) => c.kind === "image");
      eq(imgs.length, 2);
      ok(/flux-2-klein/.test(imgs[0].model) && imgs[0].width === 1280 && imgs[0].height === 800, "kích thước ảnh bìa 1280×800: " + JSON.stringify(imgs[0]));
      ok(/Do not include any text/.test(imgs[0].prompt) && /bell tower/.test(imgs[0].prompt), "prompt gửi mô hình ảnh");
      const f = await head.get(`/api/v1/files/${aiFileId}`, { raw: true });
      eq(f.status, 200);
      ok((f.headers.get("content-type") ?? "").startsWith("image/"), "phải là ảnh");
      const sf = (await sql("SELECT bucket, status, width_px, height_px FROM storage_files WHERE id = $1", [aiFileId])).rows[0];
      eq(sf.bucket, "attachments");
      eq(sf.status, "ready");
      const job = (await sql("SELECT provider, model, cost_vnd, input_ref FROM ai_jobs WHERE id = $1", [r.json.jobId])).rows[0];
      eq(job.provider, "cloudflare");
      eq(Number(job.cost_vnd), 0);
      eq(Number(job.input_ref.images), 2);
    });

    await test("Mô tả ảnh không an toàn (cha/Chúa) ⇒ dùng mô tả dựng sẵn theo chuyên mục, KHÔNG gửi 'priest'/'Jesus' cho mô hình ảnh", async () => {
      reset();
      const r = await ai(head, "content.article_image", { ...baseImg, title: `Bài thử an toàn ${suffix}`, hint: "ep-nguoi", count: 1 });
      eq(r.status, 200, JSON.stringify(r.json));
      const img = mock.calls.find((c) => c.kind === "image");
      ok(!/priest|jesus/i.test(img.prompt), "prompt gửi đi vẫn còn chủ thể cấm: " + img.prompt);
      ok(/bougainvillea/.test(img.prompt), "phải dùng mô tả dựng sẵn của chuyên mục tin-tuc: " + img.prompt);
    });

    await test("Mô hình chính lỗi ⇒ dùng mô hình dự phòng (ảnh vuông được cắt về 1280×800), fallback = true", async () => {
      reset();
      mock.cf = "klein-500";
      const r = await ai(head, "content.article_image", { ...baseImg, title: `Bài thử dự phòng ${suffix}`, count: 1 });
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.output.fallback, true);
      ok(mock.calls.some((c) => c.kind === "image" && /flux-1-schnell/.test(c.model)), "phải gọi mô hình dự phòng");
      const sf = (await sql("SELECT width_px, height_px FROM storage_files WHERE id = $1", [r.json.output.images[0].fileId])).rows[0];
      eq(sf.width_px, 1280);
      eq(sf.height_px, 800);
    });

    await test("Cloudflare hết hạn mức ngày ⇒ 429 AI_QUOTA (nêu 07:00); lần sau KHÔNG gọi lại Cloudflare cho tới khi qua ngày mới", async () => {
      reset();
      mock.cf = "quota";
      const r1 = await ai(head, "content.article_image", { ...baseImg, title: `Bài thử hết quota ${suffix}`, count: 1 });
      eq(r1.status, 429, JSON.stringify(r1.json));
      eq(code(r1), "AI_QUOTA");
      ok(/07:00/.test(r1.json.detail), "thông báo phải nêu 07:00");
      const before = mock.calls.filter((c) => c.kind === "image").length;
      const r2 = await ai(head, "content.article_image", { ...baseImg, title: `Bài thử hết quota hai ${suffix}`, count: 1 });
      eq(r2.status, 429);
      eq(mock.calls.filter((c) => c.kind === "image").length, before, "đang tạm dừng thì không được gọi lại Cloudflare");
      const st = (await sql("SELECT open_until > now() AS paused FROM ai_provider_state WHERE provider = 'cloudflare_image'")).rows[0];
      ok(st?.paused === true, "phải ghi trạng thái tạm dừng vào ai_provider_state");
      await sql("DELETE FROM ai_provider_state WHERE provider = 'cloudflare_image'");
    });

    await test("Trần ảnh AI mỗi ngày của cả nhà (6 ảnh trong bộ thử): đủ ⇒ 429 AI_QUOTA, không gọi Cloudflare", async () => {
      reset();
      // đã tạo 2 + 1 + 1 = 4 ảnh ở các ca trước ⇒ còn đúng 2 ảnh
      const ok2 = await ai(head, "content.article_image", { ...baseImg, title: `Bài thử trần ngày ${suffix}`, count: 2 });
      eq(ok2.status, 200, JSON.stringify(ok2.json));
      mock.calls.length = 0;
      const r = await ai(head, "content.article_image", { ...baseImg, title: `Bài thử vượt trần ${suffix}`, count: 1 });
      eq(r.status, 429, JSON.stringify(r.json));
      eq(code(r), "AI_QUOTA");
      eq(mock.calls.length, 0, "vượt trần thì không được gọi ra ngoài");
    });

    // ------------------------------------------------------------------ chú thích ảnh
    await test("Chú thích ảnh: chỉ ảnh của bài viết (attachments); ảnh thu nhỏ gửi Cloudflare; ảnh khác bucket ⇒ 404", async () => {
      reset();
      const r = await ai(head, "content.image_caption", { fileId: aiFileId });
      eq(r.status, 200, JSON.stringify(r.json));
      ok(/^Sân trong có đài phun nước/.test(r.json.output.caption), r.json.output.caption);
      const v = mock.calls.find((c) => c.kind === "vision");
      ok(v?.hasImage, "ảnh phải gửi dạng data:image/jpeg;base64");
      ok(/Chỉ mô tả những gì NHÌN THẤY/.test(v.system), "system prompt chú thích");
      // ảnh ở bucket 'moments' (không phải ảnh bài viết) tuyệt đối không được gửi cho AI
      const jpg = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 150, b: 90 } } }).jpeg().toBuffer();
      const form = new FormData();
      form.append("bucket", "moments");
      form.append("file", new Blob([jpg], { type: "image/jpeg" }), `thu-${suffix}.jpg`);
      const up = await head.req("POST", "/api/v1/files", undefined, { form });
      eq(up.status, 200, JSON.stringify(up.json));
      mock.calls.length = 0;
      eq((await ai(head, "content.image_caption", { fileId: up.json.id })).status, 404);
      eq(mock.calls.length, 0, "ảnh không thuộc bài viết thì không được gửi đi");
    });

    // ------------------------------------------------------------------ Cloudflare làm văn bản dự phòng
    await test("Groq + Gemini cùng lỗi ⇒ Cloudflare trả lời (văn bản dự phòng), job ghi provider cloudflare chi phí 0", async () => {
      reset();
      mock.groq = "down";
      mock.gemini = "down";
      const r = await assist(head, { action: "meta", content: `Nội dung dự phòng Cloudflare đủ dài để gợi ý tiêu đề ${suffix} ${suffix}.` });
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.provider, "cloudflare");
      ok(mock.calls.some((c) => c.kind === "text" && c.provider === "cloudflare"), "phải gọi Cloudflare");
      eq(Number((await sql("SELECT cost_vnd FROM ai_jobs WHERE id = $1", [r.json.jobId])).rows[0].cost_vnd), 0);
      await sql("DELETE FROM ai_provider_state WHERE provider IN ('groq','gemini','cloudflare')");
    });

    // ------------------------------------------------------------------ bài viết: cờ ảnh bìa AI + trang công khai
    await test("Bài viết: coverIsAi lưu/đổi được, tự về false khi không có ảnh bìa; trang công khai gắn nhãn 'Ảnh minh họa do AI tạo' (bìa + ảnh trong bài)", async () => {
      const slug = `ai-thu-${suffix}`;
      const noCover = await head.post("/api/v1/articles", { title: `Bài không bìa ${suffix}`, slug: `${slug}-a`, content: "Nội dung", category: "tin-tuc", status: "draft", coverIsAi: true });
      eq(noCover.status, 201, JSON.stringify(noCover.json));
      eq(noCover.json.coverIsAi, false, "không có ảnh bìa thì không thể là ảnh AI");
      const coverId = aiFileId; // ảnh AI đã tạo ở ca trên (đã gần trần ảnh trong ngày nên không tạo thêm)
      const body = {
        title: `Bài ảnh AI ${suffix}`,
        slug,
        summary: "Tóm tắt",
        content: `Đoạn mở đầu.\n\n![(AI) Sân nhà thờ có tháp chuông](/api/v1/public/files/${coverId})\n\nĐoạn kết.`,
        category: "tin-tuc",
        coverFileId: coverId,
        coverIsAi: true,
        status: "published",
      };
      const c = await head.post("/api/v1/articles", body);
      eq(c.status, 201, JSON.stringify(c.json));
      eq(c.json.coverIsAi, true);
      const html = await (await fetch(`${BASE}/tin-tuc/${slug}`)).text();
      ok(html.includes("Ảnh minh họa do AI tạo"), "trang công khai phải gắn nhãn ảnh AI");
      const patched = await head.patch(`/api/v1/articles/${c.json.id}`, { coverIsAi: false });
      eq(patched.status, 200, JSON.stringify(patched.json));
      eq(patched.json.coverIsAi, false);
      await head.del(`/api/v1/articles/${c.json.id}`);
      await head.del(`/api/v1/articles/${noCover.json.id}`);
    });

    await test("Chọn ảnh từ Khoảnh khắc làm ảnh bìa: sao chép sang attachments thành ảnh MỚI; chỉ ảnh moments; người thường 403", async () => {
      const jpg = await sharp({ create: { width: 640, height: 400, channels: 3, background: { r: 200, g: 60, b: 90 } } }).jpeg().toBuffer();
      const form = new FormData();
      form.append("bucket", "moments");
      form.append("file", new Blob([jpg], { type: "image/jpeg" }), `moment-${suffix}.jpg`);
      const up = await head.req("POST", "/api/v1/files", undefined, { form });
      eq(up.status, 200, JSON.stringify(up.json));
      const r = await head.post("/api/v1/articles/media/from-file", { fileId: up.json.id });
      eq(r.status, 201, JSON.stringify(r.json));
      ok(r.json.fileId && r.json.fileId !== up.json.id, "phải là tệp mới");
      eq((await sql("SELECT bucket FROM storage_files WHERE id = $1", [r.json.fileId])).rows[0].bucket, "attachments");
      eq((await head.post("/api/v1/articles/media/from-file", { fileId: aiFileId })).status, 400, "ảnh không thuộc Khoảnh khắc");
      eq((await head.post("/api/v1/articles/media/from-file", { fileId: "00000000-0000-4000-8000-000000000000" })).status, 404);
      eq((await member.post("/api/v1/articles/media/from-file", { fileId: up.json.id })).status, 403);
    });
  } finally {
    // trả về trạng thái "tắt hết" như các bộ kiểm thử AI khác mong đợi; dọn nhật ký ảnh để lượt chạy sau không bị tính vào hạn mức hôm nay
    await cleanState().catch(() => {});
    await admin.patch("/api/v1/settings", { changes: [{ key: "feature.ai.enabled", value: false }] }).catch(() => {});
    for (const t of ["content.article_assist", "content.article_research", "content.article_image", "content.image_caption"]) {
      await admin.patch(`/api/v1/ai/tasks/${t}`, { enabled: false }).catch(() => {});
    }
    await new Promise((r) => server.close(r));
  }
}
