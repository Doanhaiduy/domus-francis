import "server-only";
import { batch, type Tx } from "../db";
import { addDaysIso, liturgicalDay, liturgicalRange, type LitDay } from "@/lib/liturgy/engine";

// ---------------------------------------------------------------------
// "Thông tin thật" đưa cho AI viết bài: ngày phụng vụ tính bằng thuật toán (không để mô hình đoán), ngày Bổn mạng theo cấu hình,
// sự kiện sắp tới của nhà, các bài đã đăng (tránh trùng đề tài), và vài bài cũ cùng chuyên mục làm mẫu GIỌNG VĂN.
// Mọi thứ đọc dưới quyền người soạn (RLS) trong cùng giao dịch của cổng AI.
// ---------------------------------------------------------------------

export interface ArticleFacts {
  todayIso: string;
  /** Khối "THÔNG TIN THẬT" (văn bản thường; người gọi bọc trong <du_lieu>). */
  text: string;
  /** Thông tin liên hệ (hotline, địa chỉ) — CHỈ đưa vào prompt khi người soạn chọn kết bài kèm liên hệ. */
  contact: string;
  /** Ngày Bổn mạng cấu hình (nguyên văn trong settings, vd. "12-08"). */
  patronFeast: string | null;
  patronName: string | null;
  recentTitles: string[];
  /** Vài bài cũ cùng chuyên mục: chỉ để học giọng văn. */
  voice: { title: string; sample: string }[];
}

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const utcMs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Ngày Bổn mạng kế tiếp (hôm nay hoặc sau đó) từ "MM-DD" hoặc "DD/MM". */
export function nextFeast(todayIso: string, raw: string | null): { iso: string; days: number } | null {
  if (!raw) return null;
  let mm: string | null = null;
  let dd: string | null = null;
  let m = /^(\d{2})-(\d{2})$/.exec(raw.trim());
  if (m) [mm, dd] = [m[1], m[2]];
  else if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(raw.trim()))) [dd, mm] = [m[1].padStart(2, "0"), m[2].padStart(2, "0")];
  if (!mm || !dd) return null;
  let year = +todayIso.slice(0, 4);
  let iso = `${year}-${mm}-${dd}`;
  if (iso < todayIso) iso = `${++year}-${mm}-${dd}`;
  if (Number.isNaN(utcMs(iso))) return null;
  return { iso, days: Math.round((utcMs(iso) - utcMs(todayIso)) / 86_400_000) };
}

/** Ngày đáng nhắc trong ~30 ngày tới: lễ trọng/lễ kính/lễ buộc/Tết/lễ các linh hồn trước, thêm vài lễ nhớ. */
function upcomingLine(todayIso: string): string {
  let days: LitDay[] = [];
  try {
    days = liturgicalRange(addDaysIso(todayIso, 1), addDaysIso(todayIso, 30));
  } catch {
    return "";
  }
  const major = days.filter((d) => d.isSolemnity || d.isObligation || d.tet > 0 || ["solemnity", "feast_lord", "feast", "all_souls", "triduum"].includes(d.rank));
  const memorials = days.filter((d) => d.rank === "memorial" && !major.includes(d)).slice(0, 4);
  return [...major, ...memorials]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 9)
    .map((d) => `${dm(d.date)} ${d.title} (${d.rankLabel})`)
    .join("; ");
}

/** Cắt đoạn mẫu giọng: bỏ ảnh/tiêu đề/định dạng, lấy ~600 ký tự đầu, kết thúc ở cuối câu. */
function voiceSample(content: string): string {
  const plain = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= 600) return plain;
  const cut = plain.slice(0, 600);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 250 ? cut.slice(0, end + 1) : cut;
}

export async function buildArticleFacts(tx: Tx, opts: { category?: string; withVoice?: boolean } = {}): Promise<ArticleFacts> {
  const [orgR, todayR, eventsR, recentR, voiceR] = await batch(tx, [
    ["SELECT app.fn_public_org_info() AS o"],
    ["SELECT app.local_today()::text AS d"],
    [
      `SELECT e.title, to_char(e.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') AS at, e.location_text
         FROM events e
        WHERE e.deleted_at IS NULL AND e.status = 'scheduled' AND e.starts_at >= now() AND e.starts_at < now() + interval '21 days'
        ORDER BY e.starts_at LIMIT 8`,
    ],
    ["SELECT title FROM public_articles WHERE deleted_at IS NULL AND status = 'published' ORDER BY published_at DESC NULLS LAST LIMIT 12"],
    opts.withVoice && opts.category
      ? [
          `SELECT title, content FROM public_articles
            WHERE deleted_at IS NULL AND status = 'published' AND category = $1 AND char_length(content) > 300
            ORDER BY is_featured DESC, published_at DESC NULLS LAST LIMIT 2`,
          [opts.category],
        ]
      : ["SELECT NULL::text AS title, NULL::text AS content WHERE false"],
  ]);
  const org = (orgR.rows[0] as { o?: Record<string, unknown> } | undefined)?.o ?? {};
  const s = (k: string) => (typeof org[k] === "string" && (org[k] as string).trim() ? (org[k] as string).trim() : null);
  const todayIso = (todayR.rows[0] as { d: string }).d;
  const patronFeast = s("org.patron_feast");
  const patronName = s("org.patron_name");

  const lit = liturgicalDay(todayIso);
  const lines: string[] = [];
  lines.push(`- Hôm nay: ${lit.weekdayLabel} ${dmy(todayIso)}. Phụng vụ: ${lit.title} (${lit.rankLabel}); ${lit.weekLabel ?? lit.seasonLabel}, ${lit.seasonLabel}.`);
  if (lit.intentions.length) lines.push(`- Ý cầu nguyện chung của Giáo hội hôm nay: ${lit.intentions.slice(0, 2).join("; ")}.`);
  const nf = nextFeast(todayIso, patronFeast);
  if (patronName || nf) {
    lines.push(
      `- Bổn mạng của nhà: ${patronName ?? "(chưa đặt tên)"}${nf ? `, mừng ngày ${dm(nf.iso)} (${nf.days === 0 ? "HÔM NAY" : `còn ${nf.days} ngày nữa`})` : ""}.${nf && nf.days !== 0 ? " HÔM NAY KHÔNG PHẢI ngày Bổn mạng — đừng nói hôm nay hay ngày khác là Bổn mạng." : ""}`,
    );
  }
  const up = upcomingLine(todayIso);
  if (up) lines.push(`- Lễ và ngày đặc biệt của Giáo hội trong 30 ngày tới: ${up}.`);
  const events = eventsR.rows as { title: string; at: string; location_text: string | null }[];
  if (events.length) lines.push(`- Sự kiện sắp tới của nhà (nội bộ — chỉ nhắc khi đề tài liên quan): ${events.map((e) => `${e.at} ${e.title}${e.location_text ? ` tại ${e.location_text}` : ""}`).join("; ")}.`);
  else lines.push("- Chưa có sự kiện nào của nhà được lên lịch trong 21 ngày tới (đừng bịa sự kiện).");
  const recentTitles = (recentR.rows as { title: string }[]).map((r) => r.title);
  if (recentTitles.length) lines.push(`- Các bài đã đăng gần đây (đừng viết trùng đề tài): ${recentTitles.join(" | ")}.`);

  const phone = s("org.contact_phone");
  const address = s("org.address");
  const contact = [phone && `Hotline: ${phone}`, address && `Địa chỉ: ${address}`].filter(Boolean).join("\n");

  return {
    todayIso,
    text: lines.join("\n"),
    contact,
    patronFeast,
    patronName,
    recentTitles,
    voice: (voiceR.rows as { title: string; content: string }[]).map((r) => ({ title: r.title, sample: voiceSample(r.content) })).filter((v) => v.sample.length > 80),
  };
}
