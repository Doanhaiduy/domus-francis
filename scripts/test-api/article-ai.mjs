// Kiểm thử TRỢ LÝ VIẾT BÀI nâng cấp — KHÔNG có lưu lượng ra ngoài: máy chủ thử trỏ AI_TEST_BASE_URL tới một máy chủ GIẢ ở 127.0.0.1:3199 đóng vai
// Groq, Gemini (kể cả công cụ tìm kiếm Google), Cloudflare Workers AI (văn bản, tạo ảnh, đọc ảnh), Vatican News (RSS) và Wikipedia tiếng Việt.
//   • bảng THÔNG TIN THẬT trong prompt (ngày Bổn mạng cấu hình, "hôm nay không phải ngày Bổn mạng"); không tự đưa hotline/lời kêu gọi khi kết bài "không kêu gọi"
//   • dò đầu ra: ngày Bổn mạng sai, giờ/số/SĐT không có trong dữ kiện, cụm sáo rỗng, lời kêu gọi; bản nháp thiếu dữ kiện ⇒ chỉ viết khung (thin)
//   • văn AI: "không … mà …" lặp, cụm lặp ≥ 5 lần, lời chứng chung chung (claim) bị đánh dấu — trừ khi người soạn tự ghi trong dữ kiện
//   • "AI đề xuất chỗ chèn ảnh" (action illustrations): lọc số đoạn lạ/đoạn sát nhau/đoạn kề ảnh, bài không có đoạn hợp ⇒ rỗng không gọi mô hình
//   • không còn giới hạn lượt vẽ ảnh theo GIỜ (chỉ còn trần theo ngày của cả nhà)
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
<item><title>Tháng Mân Côi: các gia đình cùng lần chuỗi mỗi tối</title><link>https://www.vaticannews.va/vi/church/news/2026-10/man-coi-gia-dinh.html</link><description>Nhiều giáo xứ mời gọi lần chuỗi Mân Côi tại gia đình.</description><pubDate>Sat, 10 Oct 2026 08:00:00 +0000</pubDate></item>
<item><title>Kinh Mân Côi và hòa bình thế giới</title><link>https://www.vaticannews.va/vi/church/news/2026-10/man-coi-hoa-binh.html</link><description>Đức Thánh Cha mời gọi lần chuỗi Mân Côi cầu cho hòa bình.</description><pubDate>Fri, 09 Oct 2026 08:00:00 +0000</pubDate></item>
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
        content: "Hôm nay 17/03 là ngày Bổn mạng của nhà. Hãy cùng nhau lần chuỗi. Có 120 người tham dự lúc 19h45. Gọi hotline 0912 345 678 ngay.\n\n> “Ngày nào cũng học, cũng đi làm thêm, tối về lần chuỗi thấy lòng nhẹ đi.” - Một anh em chia sẻ.\n\nNhiều anh em kể rằng mỗi tối đều thấy lòng nhẹ đi. Đây không chỉ là một buổi lần chuỗi, mà là một mối dây liên kết. Đó không phải là thói quen, mà còn là nhịp sống. Ánh nến chiếu lên tường. Ánh nến tỏa ra sân. Ánh nến rọi qua cửa. Ánh nến cháy suốt buổi. Ánh nến lay trong gió.\n\nCuối bài [cần bổ sung: tên cha hướng dẫn].",
      };
    // Biên tập viên ảnh: cố tình trả cả số đoạn không có, đoạn sát nhau và đoạn trùng để kiểm tra việc lọc ở máy chủ
    if (user.includes("Bạn là biên tập viên ảnh")) {
      const nums = [...user.matchAll(/^\[(\d+)\] /gm)].map((m) => Number(m[1]));
      return { picks: [{ n: nums[0], reason: "Tả cảnh có nến và sân nhà" }, { n: nums[0] + 1, reason: "Sát đoạn trên" }, { n: 999, reason: "Số đoạn không có" }, { n: nums[nums.length - 1], reason: "Cảnh cuối buổi" }] };
    }
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
        state.calls.push({ kind: "text", provider: "groq", user, system: body.messages?.find((m) => m.role === "system")?.content, max: body.max_tokens });
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
                content: { parts: [{ text: "Dưới đây là kết quả:\n- Tháng 10 là tháng kính Đức Mẹ Mân Côi theo truyền thống Giáo hội.\n- Lễ Mân Côi được mừng ngày 7/10 hằng năm.\n- Kinh Mân Côi gồm bốn bộ mầu nhiệm: Vui, Sáng, Thương, Mừng.\n- Tháng Mân Côi gắn với chiến thắng Lepanto năm 1571 theo truyền thống.\n- Đức Giáo hoàng Lêô XIII đã khuyến khích việc lần chuỗi trong tháng Mười.\n- Nhiều giáo xứ tổ chức lần chuỗi chung mỗi tối trong tháng này.\n- Việc lần chuỗi giúp người tín hữu suy niệm đời sống Chúa Giêsu cùng Đức Mẹ.\n- Chuỗi Mân Côi truyền thống gồm năm chục kinh Kính Mừng chia theo mầu nhiệm.\n**Lưu ý** không có bằng chứng khác." }] },
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
      // Tìm kiếm Wikipedia hay trả trang lạc đề ("Hoa Kỳ") đứng đầu — hệ thống phải loại trang không có từ khóa của đề tài
      if (url.startsWith("/wikipedia/w/rest.php/v1/search/page")) {
        state.calls.push({ kind: "wikisearch", q: new URL(url, "http://x").searchParams.get("q") ?? "" });
        if (decodeURIComponent(url).includes("Đẳng")) return send(200, { pages: [{ key: "Hoa_Kỳ", title: "Hoa Kỳ" }, { key: "Lễ_Các_Đẳng", title: "Lễ Các Đẳng" }] });
        // "Tòa Thánh" / "Hội Thánh" cũng là chữ của đạo khác: Wikipedia thật trả trang Cao Đài đứng đầu
        if (decodeURIComponent(url).includes("Tòa Thánh")) return send(200, { pages: [{ key: "Hội_Thánh_Cao_Đài_Tòa_Thánh_Tây_Ninh", title: "Hội Thánh Cao Đài Tòa Thánh Tây Ninh" }, { key: "Tòa_Thánh", title: "Tòa Thánh" }] });
        return send(200, { pages: [{ key: "Hoa_Kỳ", title: "Hoa Kỳ" }, { key: "Kinh_Mân_Côi", title: "Kinh Mân Côi" }, { key: "Tháng_Mân_Côi", title: "Tháng Mân Côi" }] });
      }
      if (url.startsWith("/wikipedia/api/rest_v1/page/summary/")) {
        const key = decodeURIComponent(url.split("/summary/")[1].split("?")[0]);
        if (key === "Hoa_Kỳ") return send(200, { title: "Hoa Kỳ", extract: "Hợp chúng quốc Hoa Kỳ là một quốc gia ở châu Mỹ, nằm tại Tây Bán cầu, gồm 50 tiểu bang và một đặc khu liên bang." });
        if (key === "Hội_Thánh_Cao_Đài_Tòa_Thánh_Tây_Ninh") return send(200, { title: "Hội Thánh Cao Đài Tòa Thánh Tây Ninh", description: "Tổ chức tôn giáo", extract: "Hội Thánh Đại Đạo Tam Kỳ Phổ Độ Tòa Thánh Tây Ninh, còn được gọi tắt là Hội Thánh Cao Đài Tòa Thánh Tây Ninh, là tổ chức Hội Thánh nguyên thủy của đạo Cao Đài, được lập thành sau Đại lễ Khai Đạo Rằm tháng 10 năm 1926." });
        if (key === "Tòa_Thánh") return send(200, { title: "Tòa Thánh", extract: "Tòa Thánh là cơ quan trung ương điều hành Giáo hội Công giáo, đặt tại Vatican, do Giáo hoàng đứng đầu." });
        if (key === "Lễ_Các_Đẳng") return send(200, { title: "Lễ Các Đẳng", extract: "Lễ Các Đẳng là ngày Giáo hội Công giáo cầu nguyện cho các linh hồn đã qua đời." });
        return send(200, { title: key.replace(/_/g, " "), extract: `${key.replace(/_/g, " ")} là một hình thức cầu nguyện của người Công giáo, lần chuỗi hạt Mân Côi để suy niệm các mầu nhiệm.` });
      }
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
      for (const k of ["patron", "time", "number", "phone", "cliche", "cta", "quote", "claim", "repeat"]) ok(kinds.has(k), `thiếu cờ ${k}: ${JSON.stringify(o.flags)}`);
      // Văn AI: "không … mà …" lặp hai lần ⇒ cả hai câu bị đánh dấu sáo rỗng; "Ánh nến" lặp 5 lần ⇒ cờ repeat; lời chứng chung chung ⇒ claim
      ok(o.flags.filter((f) => f.kind === "cliche" && /không/i.test(f.text) && /mà/i.test(f.text)).length >= 2, "thiếu cờ cho cấu trúc 'không … mà …' lặp lại: " + JSON.stringify(o.flags));
      ok(o.flags.some((f) => f.kind === "repeat" && /ánh nến/i.test(f.text)), "thiếu cờ repeat cho 'ánh nến'");
      ok(o.flags.some((f) => f.kind === "claim" && /Nhiều anh em kể/i.test(f.text)), "thiếu cờ claim cho lời chứng chung chung");
      ok(o.flags.some((f) => f.kind === "patron" && /17\/03/.test(f.text) && /08\/12/.test(f.note ?? "")), "cờ patron phải nêu ngày đúng 08/12");
      ok(o.flags.some((f) => f.kind === "phone" && f.text.includes("0912")), "cờ SĐT");
      ok(!/\[.*\]\(/.test(o.content), "bản nháp không được có liên kết/ảnh");
    });

    await test("Viết nháp CÓ dữ kiện + kết bài kèm liên hệ + tư liệu: prompt có THÔNG TIN LIÊN HỆ, tư liệu; không còn cờ cta; không thin", async () => {
      reset();
      const r = await assist(head, {
        action: "draft",
        topic: `Buổi lần chuỗi ${suffix}`,
        keyPoints: "Tối thứ Sáu 9/10, 20 anh em lần chuỗi ở sân nhà, cha linh hướng nhắc lòng tin cậy vào Đức Mẹ. Nhiều anh em kể rằng mỗi tối đều thấy lòng nhẹ đi.",
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
      ok(!r.json.output.flags.some((f) => f.kind === "claim"), "lời chứng mà người soạn tự ghi trong dữ kiện thì không bị coi là bịa");
      ok(r.json.output.flags.some((f) => f.kind === "repeat"), "cụm lặp vẫn bị đánh dấu");
      const sys = lastText("groq").system ?? "";
      ok(/NGÔI KỂ/.test(sys) && /MỖI ĐOẠN MỘT Ý/.test(sys) && /THÔNG TIN THIẾT THỰC LÊN TRƯỚC/.test(sys), "prompt hệ thống phải có các luật giọng văn mới");
    });

    await test("Chỉnh văn: > 8.000 ký tự ⇒ 400; đoạn ~6.000 ký tự được cấp đủ token đầu ra; thêm ngày/số mới ⇒ bị đánh dấu", async () => {
      reset();
      eq((await assist(head, { action: "improve", text: "a".repeat(8001), mode: "polish" })).status, 400);
      // hậu tố ngẫu nhiên không được chứa chữ số (có thể ra "50"/"22" làm con số do AI thêm trông như đã có trong dữ kiện ⇒ test chập chờn)
      const text = ("Anh em trong nhà cùng nhau dọn dẹp sân và chuẩn bị bữa cơm chung. ".repeat(90)).slice(0, 6000) + suffix.replace(/\d/g, "x");
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

    // ------------------------------------------------------------------ AI đề xuất chỗ chèn ảnh
    const artParas = [
      "Sân nhà buổi tối có những ngọn nến nhỏ đặt dọc lối đi, gió thổi nhẹ làm ánh lửa lay động trên nền gạch cũ.", // 0
      "Anh em ngồi thành vòng tròn trên ghế gỗ, mỗi người cầm một chuỗi hạt và lần theo giọng đọc của người đứng đầu.", // 1
      "## Sau buổi lần chuỗi", // 2 (tiêu đề mục — không được đề xuất)
      "Bàn ăn chung được dọn ra ngay sau đó với nồi cháo nóng và đĩa dưa muối, ai cũng ngồi lại thêm một lúc.", // 3
      "Cuối buổi, mọi người dọn ghế vào và tắt từng ngọn nến rồi ai về phòng nấy chuẩn bị cho ngày mai đi học.", // 4
    ];
    await test("Đề xuất chỗ chèn ảnh: chỉ nhận đoạn hợp lệ (bỏ số lạ + đoạn sát nhau + tiêu đề mục), trả theo thứ tự bài; đoạn kề ảnh có sẵn không được chọn", async () => {
      reset();
      const title = `Tối lần chuỗi ${suffix}`;
      const r = await assist(head, { action: "illustrations", title, content: artParas.join("\n\n"), category: "hoat-dong", max: 3 });
      eq(r.status, 200, JSON.stringify(r.json));
      const spots = r.json.output.spots;
      eq(spots.map((s) => s.index).join(","), "0,4", "đoạn 1 sát đoạn 0 và số 999 phải bị loại: " + JSON.stringify(spots));
      ok(spots.every((s) => s.reason.length > 0 && s.reason.length <= 120), "mỗi chỗ phải kèm lý do ngắn");
      const p = lastText("groq").user;
      ok(p.includes("Các đoạn (đánh số)") && /^\[0\] Sân nhà/m.test(p) && /^\[3\] Bàn ăn/m.test(p), "prompt phải đánh số các đoạn");
      ok(!/^\[2\] /m.test(p), "tiêu đề mục không được đưa vào danh sách đoạn để minh họa");
      // đoạn 1 đã được thay bằng ảnh ⇒ đoạn 0 (kề ảnh) và chính ảnh không còn là ứng viên
      reset();
      const withImg = [artParas[0], "![(AI) Nến](/api/v1/public/files/00000000-0000-4000-8000-000000000001)", artParas[2], artParas[3], artParas[4]].join("\n\n");
      const r2 = await assist(head, { action: "illustrations", title: `${title} (có ảnh)`, content: withImg, category: "hoat-dong", max: 3 });
      eq(r2.status, 200, JSON.stringify(r2.json));
      const p2 = lastText("groq").user;
      ok(!/^\[0\] /m.test(p2) && !/^\[1\] /m.test(p2), "đoạn kề ảnh và ảnh không được liệt kê: " + p2.slice(-500));
      eq(r2.json.output.spots.map((s) => s.index).join(","), "3", JSON.stringify(r2.json.output.spots));
    });

    await test("Đề xuất chỗ chèn ảnh: bài chỉ có dòng ngắn (giờ giấc, địa chỉ) ⇒ trả danh sách rỗng NGAY, không gọi mô hình; nội dung < 80 ký tự ⇒ 400; người thường ⇒ 403", async () => {
      reset();
      const flat = ["Giờ lễ: 19h.", "Địa điểm: sân nhà.", "Mang theo chuỗi hạt.", "Mặc áo ấm.", "Đến đúng giờ nhé.", "Xin cảm ơn."].join("\n\n");
      const r = await assist(head, { action: "illustrations", title: `Thông báo ngắn ${suffix}`, content: flat, category: "tin-tuc" });
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.output.spots.length, 0);
      eq(mock.calls.length, 0, "không có đoạn hợp ⇒ không được gọi mô hình");
      eq((await assist(head, { action: "illustrations", title: `Quá ngắn ${suffix}`, content: "Một đoạn quá ngắn.", category: "tin-tuc" })).status, 400);
      eq((await assist(member, { action: "illustrations", title: `Người thường ${suffix}`, content: artParas.join("\n\n"), category: "tin-tuc" })).status, 403);
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
      // Lỗi người dùng gặp: tra cứu trả > 12 ghi chú rồi bản nháp bị từ chối "Dữ liệu không hợp lệ" ⇒ luôn ≤ 12; trang Wikipedia lạc đề bị loại
      eq(o.notes.length, 12, "8 ý Gemini + 3 tin Vatican + 2 trang Wikipedia đúng chủ đề = 13 ⇒ phải bị chặn ở 12");
      ok(o.sources.length <= 12, "nguồn ≤ 12");
      ok(!o.notes.some((n) => /Hoa Kỳ/.test(n)) && !o.sources.some((s) => /Hoa_K/.test(decodeURIComponent(s.url))), "trang Wikipedia lạc đề (Hoa Kỳ) phải bị loại");
      const s = mock.calls.find((c) => c.kind === "search");
      ok(s && /gemini-2\.5-flash/.test(s.url), "phải gọi mô hình tìm kiếm gemini-2.5-flash");
      const job = (await sql("SELECT provider, cost_vnd FROM ai_jobs WHERE id = $1", [r.json.jobId])).rows[0];
      eq(job.provider, "gemini");
      eq(Number(job.cost_vnd), 0);
    });

    await test("Tra cứu đúng chủ đề: đề tài 'Cầu nguyện cho các Đẳng' ⇒ giữ 'Lễ Các Đẳng', bỏ trang lạc đề (Hoa Kỳ) và tin Vatican về Mân Côi; mỗi tin gắn với một ý (noteIndex)", async () => {
      reset();
      const r = await ai(head, "content.article_research", { topic: "Cầu nguyện cho các Đẳng", category: "chia-se" }, true);
      eq(r.status, 200, JSON.stringify(r.json));
      const o = r.json.output;
      ok(o.notes.some((n) => n.startsWith("Wikipedia") && /Lễ Các Đẳng/.test(n)), "thiếu trang Wikipedia đúng chủ đề: " + JSON.stringify(o.notes));
      ok(!o.notes.some((n) => /Hoa Kỳ/.test(n)), "trang lạc đề phải bị loại");
      ok(!o.notes.some((n) => n.startsWith("Vatican News")), "tin Vatican về Mân Côi không liên quan đến đề tài này: " + JSON.stringify(o.notes));
      const wiki = o.sources.find((s) => s.kind === "wikipedia");
      ok(wiki && typeof wiki.noteIndex === "number" && /Lễ Các Đẳng/.test(o.notes[wiki.noteIndex]), "nguồn Wikipedia phải gắn đúng ý của nó: " + JSON.stringify(o.sources));
      ok(o.sources.filter((s) => s.kind === "web").every((s) => s.noteIndex === undefined), "nguồn web của Google không gắn với ý cụ thể");
    });

    await test("Tra cứu chỉ lấy Wikipedia thuộc Công giáo: tìm 'Tòa Thánh' ra cả trang Cao Đài (đạo khác) ⇒ bị loại, trang Tòa Thánh (Công giáo) được giữ", async () => {
      reset();
      const r = await ai(head, "content.article_research", { topic: "Tòa Thánh và Hội Thánh ở Việt Nam", category: "chia-se" }, true);
      eq(r.status, 200, JSON.stringify(r.json));
      const o = r.json.output;
      ok(!o.notes.some((n) => /Cao Đài/.test(n)) && !o.sources.some((s) => /Cao_%C4%90%C3%A0i|Cao_Đài/.test(s.url)), "trang đạo Cao Đài không được lọt vào tư liệu: " + JSON.stringify(o.notes));
      ok(o.notes.some((n) => n.startsWith("Wikipedia") && /Tòa Thánh là cơ quan trung ương/.test(n)), "trang Tòa Thánh của Công giáo phải được giữ: " + JSON.stringify(o.notes));
      // mỗi lượt tìm kiếm Wikipedia gửi 2 truy vấn: đúng chủ đề + kèm "Công giáo"
      const searches = mock.calls.filter((c) => c.kind === "wikisearch");
      ok(searches.length >= 2 && searches.some((c) => /Công giáo/.test(c.q)), "phải có lượt tìm kèm 'Công giáo': " + JSON.stringify(searches));
    });

    await test("Viết nháp nhận được toàn bộ kết quả tra cứu (kể cả 14–20 ghi chú) — không còn lỗi 'Dữ liệu gửi cho AI không hợp lệ'", async () => {
      reset();
      const notes = Array.from({ length: 14 }, (_, i) => `Ghi chú tư liệu số ${i + 1} về Lễ Các Đẳng ${suffix}.`);
      const sources = Array.from({ length: 14 }, (_, i) => ({ title: `Nguồn ${i + 1}`, url: `https://example.com/nguon-${i + 1}` }));
      const r = await assist(head, { action: "draft", topic: `Cầu nguyện cho các đẳng ${suffix}`, keyPoints: "Chia sẻ ý nghĩa của Thánh lễ cầu nguyện cho các linh hồn.", research: { notes, sources }, category: "chia-se", tone: "plain", length: "long", ending: "none" });
      eq(r.status, 200, JSON.stringify(r.json));
      eq((await assist(head, { action: "draft", topic: "Chủ đề thử quá nhiều ghi chú", research: { notes: Array.from({ length: 21 }, () => "x ghi chú"), sources: [] }, category: "chia-se" })).status, 400, "quá 20 ghi chú vẫn bị chặn");
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

    await test("Không còn giới hạn số lượt vẽ ảnh mỗi GIỜ (chỉ còn trần theo ngày): ≥ 8 lượt trong một giờ vẫn không bị RATE_LIMITED", async () => {
      reset();
      for (let i = 0; i < 4; i++) {
        // mỗi vòng: bỏ trạng thái tạm dừng để lượt sau vẫn đi tới nhà cung cấp ⇒ tạo thêm một job (thất bại, không tính vào trần ảnh)
        await sql("DELETE FROM ai_provider_state WHERE provider = 'cloudflare_image'");
        mock.cf = "quota";
        const r = await ai(head, "content.article_image", { ...baseImg, title: `Bài thử không giới hạn giờ ${i} ${suffix}`, count: 1 });
        eq(r.status, 429, JSON.stringify(r.json));
        eq(code(r), "AI_QUOTA", `lượt ${i + 1} phải hết hạn mức Cloudflare chứ không phải RATE_LIMITED`);
      }
      const n = Number((await sql("SELECT count(*)::int AS n FROM ai_jobs WHERE task_code = 'content.article_image' AND created_at > now() - interval '1 hour'")).rows[0].n);
      ok(n >= 7, `phải có ≥ 7 lượt vẽ ảnh trong giờ qua để phép thử có nghĩa (có ${n})`);
      await sql("DELETE FROM ai_provider_state WHERE provider = 'cloudflare_image'");
      mock.cf = "ok";
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
