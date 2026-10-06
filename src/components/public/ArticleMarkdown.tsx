import React from "react";

// Trình hiển thị Markdown cho BÀI VIẾT CÔNG KHAI (cỡ chữ đọc báo, có ảnh). Không dùng hook ⇒ chạy được ở Server Component và
// cả trong bản xem trước của trình soạn. Chỉ hỗ trợ một tập nhỏ, đủ cho bài đăng:
//   # / ## tiêu đề lớn · ### tiêu đề nhỏ · đoạn văn · "- " và "1. " danh sách · "> " trích dẫn · "---" đường kẻ
//   ![chú thích](ảnh) ảnh riêng một dòng · **đậm** · *nghiêng* · `mã` · [chữ](liên kết)
// An toàn: KHÔNG chèn HTML thô; chỉ nhận ảnh từ máy chủ này (/api/v1/…) hoặc https://, liên kết /…, https://, mailto:, tel:.

const SAFE_HREF = /^(\/(?!\/)|https:\/\/|mailto:|tel:)/i;
const SAFE_IMG = /^(\/api\/v1\/(public\/)?files\/[0-9a-f-]{36}(\?v=(thumb|medium))?|https:\/\/\S+)$/i;

function inline(text: string, base: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${base}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k} className="font-bold text-gray-900">{inline(t.slice(2, -2), k)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="px-1.5 py-0.5 rounded bg-gray-100 text-[0.85em] font-mono">{t.slice(1, -1)}</code>);
    else if (t.startsWith("*")) out.push(<em key={k}>{t.slice(1, -1)}</em>);
    else {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      const href = mm[2].trim();
      const external = href.startsWith("https://");
      out.push(
        SAFE_HREF.test(href) ? (
          <a key={k} href={href} className="text-primary font-semibold underline underline-offset-4 decoration-primary/40 hover:decoration-primary" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {mm[1]}
          </a>
        ) : (
          mm[1]
        )
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BLOCK_START = /^(#{1,3} |> |[-*] |\d+\. |---+\s*$|!\[[^\]]*\]\([^)]+\)\s*$)/;

export function ArticleMarkdown({ source, className = "" }: { source: string; className?: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const k = `b${key++}`;
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,3}) (.+)$/.exec(line))) {
      const level = m[1].length;
      blocks.push(
        level === 3 ? (
          <h3 key={k} className="text-xl font-bold text-gray-900 mt-8 mb-2 leading-snug">{inline(m[2], k)}</h3>
        ) : (
          <h2 key={k} className="text-2xl sm:text-[1.7rem] font-extrabold text-gray-900 mt-11 mb-3 leading-tight tracking-tight">{inline(m[2], k)}</h2>
        )
      );
      i++;
    } else if (/^---+\s*$/.test(line)) {
      blocks.push(<hr key={k} className="my-9 border-purple-100" />);
      i++;
    } else if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line))) {
      const src = m[2];
      if (SAFE_IMG.test(src)) {
        blocks.push(
          <figure key={k} className="my-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={m[1]} loading="lazy" className="w-full rounded-2xl border border-purple-100 shadow-sm" />
            {m[1] && <figcaption className="mt-2.5 text-center text-sm text-gray-500 italic">{m[1]}</figcaption>}
          </figure>
        );
      }
      i++;
    } else if (/^> /.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) buf.push(lines[i++].slice(2));
      blocks.push(
        <blockquote key={k} className="my-7 pl-5 py-1 border-l-4 border-primary/60 text-lg italic text-gray-700 leading-8">
          {inline(buf.join(" "), k)}
        </blockquote>
      );
    } else if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) items.push(lines[i++].slice(2));
      blocks.push(
        <ul key={k} className="my-5 pl-6 list-disc space-y-2 marker:text-primary/70">
          {items.map((t, j) => <li key={j} className="pl-1">{inline(t, `${k}-${j}`)}</li>)}
        </ul>
      );
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ""));
      blocks.push(
        <ol key={k} className="my-5 pl-6 list-decimal space-y-2 marker:text-primary/70 marker:font-bold">
          {items.map((t, j) => <li key={j} className="pl-1">{inline(t, `${k}-${j}`)}</li>)}
        </ol>
      );
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) buf.push(lines[i++]);
      if (!buf.length) buf.push(lines[i++]); // dòng lạ không khớp khối nào: coi là đoạn văn một dòng, tránh lặp vô hạn
      blocks.push(<p key={k} className="my-5">{inline(buf.join(" "), k)}</p>);
    }
  }
  return <div className={`text-[17px] leading-8 text-gray-700 ${className}`}>{blocks}</div>;
}
