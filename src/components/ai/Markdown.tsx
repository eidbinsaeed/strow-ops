import React from "react";

function inline(s: string, keyBase: string): React.ReactNode[] {
  return s
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter((p) => p !== "")
    .map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
        return (
          <strong key={keyBase + i} className="font-semibold text-strow-ink">
            {p.slice(2, -2)}
          </strong>
        );
      if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
        return (
          <code key={keyBase + i} className="rounded bg-neutral-100 px-1 py-0.5 text-[13px]">
            {p.slice(1, -1)}
          </code>
        );
      return <React.Fragment key={keyBase + i}>{p}</React.Fragment>;
    });
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const isBullet = (l: string) => /^\s*[-*•]\s+/.test(l);
const isNumbered = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const isHeading = (l: string) => /^#{1,4}\s+/.test(l);

/** Small, safe markdown renderer for assistant answers (no HTML injection). */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push(
        <div key={k++} className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-neutral-50">
              <tr>
                {head.map((h, j) => (
                  <th key={j} className="px-3 py-2 text-start font-medium text-neutral-600">
                    {inline(h, `h${j}-`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-neutral-100">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-2 tabular-nums">
                      {inline(c, `c${ri}-${j}-`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      out.push(
        <p key={k++} className="pt-1 font-semibold text-strow-ink">
          {inline(h[2], `hd${k}-`)}
        </p>,
      );
      i++;
      continue;
    }
    if (isBullet(line) || isNumbered(line)) {
      const numbered = isNumbered(line);
      const items: string[] = [];
      while (i < lines.length && (numbered ? isNumbered(lines[i]) : isBullet(lines[i]))) {
        items.push(lines[i].replace(numbered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/, ""));
        i++;
      }
      const Tag = numbered ? "ol" : "ul";
      out.push(
        <Tag key={k++} className={`${numbered ? "list-decimal" : "list-disc"} space-y-1 ps-5 marker:text-neutral-400`}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `li${j}-`)}</li>
          ))}
        </Tag>,
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isBullet(lines[i]) &&
      !isNumbered(lines[i]) &&
      !isHeading(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isSep(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i++;
    }
    if (!para.length) {
      para.push(lines[i]);
      i++;
    }
    out.push(
      <p key={k++}>
        {para.map((p, j) => (
          <React.Fragment key={j}>
            {j > 0 ? <br /> : null}
            {inline(p, `p${j}-`)}
          </React.Fragment>
        ))}
      </p>,
    );
  }
  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed text-neutral-800" dir="auto">
      {out}
    </div>
  );
}
