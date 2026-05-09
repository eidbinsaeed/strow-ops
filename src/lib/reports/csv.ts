/**
 * Tiny CSV writer. Returns an RFC-4180-flavored CSV string.
 *
 * Excel/Numbers/Sheets all open .csv natively, so we ship this as the
 * "Excel export" path - no exceljs dependency needed.
 */

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(escape).join(",")).join("\r\n") + "\r\n";
}

function escape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
