import React from "react";

// Trình hiển thị Markdown tối giản cho trang Hướng dẫn (không thêm thư viện): ##/### tiêu đề, đoạn văn, danh sách
// "- " và "1. ", > ghi chú, **đậm**, `mã`, [chữ](/duong-dan) (chỉ liên kết nội bộ hoặc https).

function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k} className="font-bold text-gray-900">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="px-1 py-0.5 rounded bg-gray-100 text-[0.85em] font-mono">{t.slice(1, -1)}</code>);
    else {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      const href = mm[2];
      const ok = href.startsWith("/") || href.startsWith("https://");
      out.push(
        ok ? (
          <a key={k} href={href} className="text-primary font-semibold underline underline-offset-2" {...(href.startsWith("https://") ? { target: "_blank", rel: "noreferrer" } : {})}>
            {mm[1]}
          </a>
        ) : (
          mm[1]
        ),
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MiniMarkdown({ source, className = "" }: { source: string; className?: string }) {
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
    if (line.startsWith("### ")) {
      blocks.push(<h4 key={k} className="text-sm font-bold text-gray-900 mt-4 mb-1">{inline(line.slice(4), k)}</h4>);
      i++;
    } else if (line.startsWith("## ")) {
      blocks.push(<h3 key={k} className="text-base font-extrabold text-gray-900 mt-5 mb-2">{inline(line.slice(3), k)}</h3>);
      i++;
    } else if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) buf.push(lines[i++].slice(2));
      blocks.push(
        <div key={k} className="my-2 px-3.5 py-2.5 rounded-xl bg-violet-50 border border-violet-100 text-[13px] text-violet-900 leading-relaxed">
          {inline(buf.join(" "), k)}
        </div>,
      );
    } else if (/^- /.test(line)) {
      // Danh sách, cho phép một cấp lồng ("  - ")
      const items: { text: string; sub: string[] }[] = [];
      while (i < lines.length && (/^- /.test(lines[i]) || (/^\s{2,}- /.test(lines[i]) && items.length))) {
        if (/^- /.test(lines[i])) items.push({ text: lines[i].slice(2), sub: [] });
        else items[items.length - 1].sub.push(lines[i].replace(/^\s+- /, ""));
        i++;
      }
      blocks.push(
        <ul key={k} className="my-1.5 pl-5 list-disc space-y-1 text-[13px] text-gray-700 leading-relaxed">
          {items.map((t, j) => (
            <li key={j}>
              {inline(t.text, `${k}-${j}`)}
              {t.sub.length > 0 && (
                <ul className="mt-1 pl-5 list-[circle] space-y-1">
                  {t.sub.map((x, n) => <li key={n}>{inline(x, `${k}-${j}-${n}`)}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>,
      );
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ""));
      blocks.push(
        <ol key={k} className="my-1.5 pl-5 list-decimal space-y-1 text-[13px] text-gray-700 leading-relaxed">
          {items.map((t, j) => <li key={j}>{inline(t, `${k}-${j}`)}</li>)}
        </ol>,
      );
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{2,3} |> |- |\d+\. )/.test(lines[i])) buf.push(lines[i++]);
      blocks.push(<p key={k} className="my-1.5 text-[13px] text-gray-700 leading-relaxed">{inline(buf.join(" "), k)}</p>);
    }
  }
  return <div className={className}>{blocks}</div>;
}
