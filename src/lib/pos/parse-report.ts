/**
 * EZI POS daily report (.xlsx) -> payload for public.pos_import_report(p jsonb).
 *
 * Exact TypeScript port of scripts/pos_report.py (v1): same sheets, same checks, same
 * rejection messages, same numbers and the same transport checksum (chk). The daily email
 * import still runs the Python script; /api/pos/import uses this for files the owner uploads.
 * Change both together, and compare their output on a real report after any change.
 *
 * Server-only and dependency-free: the .xlsx (a zip) is read with node:zlib the way Python's
 * zipfile reads it, and its XML with a small namespace-aware tokenizer that follows
 * xml.etree.ElementTree. Python semantics the parser relies on (str.strip, int(), Decimal with
 * 28 digits, float repr, \d matching any Unicode digit) are reproduced by the helpers below.
 * Keep this file free of path aliases and non-node imports so it can run with
 * `node --experimental-strip-types` for that comparison.
 */
import { createHash } from "node:crypto";
import { constants as zlibConstants, inflateRawSync } from "node:zlib";

export type PosReportSummary = {
  date: string;
  generated: string;
  orders: number;
  paid: number;
  products: number;
  warnings: string[];
};

export type PosParseResult =
  | { ok: true; payload: Record<string, unknown>; summary: PosReportSummary }
  | { ok: false; reason: string };

/** pos_report.py fail(): the file was read but is not importable. The message is shown as is. */
class Rejected extends Error {}
/** Where pos_report.py would crash with a traceback: a broken or unexpected file. */
class Unreadable extends Error {}

function fail(msg: string): never {
  throw new Rejected(msg);
}

/** Never throws: bad files come back as { ok: false, reason }. */
export function parsePosReport(bytes: Buffer, opts?: { msgId?: string | null }): PosParseResult {
  try {
    // pos_report.py load(): anything that does not start with "PK" is not an .xlsx.
    if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { ok: false, reason: "not an .xlsx file" };
    return parse(bytes, opts?.msgId ?? null);
  } catch (e) {
    if (e instanceof Rejected) return { ok: false, reason: e.message };
    return { ok: false, reason: `unreadable .xlsx file (${e instanceof Error ? e.message : String(e)})` };
  }
}

// ================================================================ Python semantics

/** Characters Python's str.strip() removes (str.isspace), as code points. */
const PY_SPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
  0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

function strip(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && PY_SPACE.has(s.charCodeAt(a))) a++;
  while (b > a && PY_SPACE.has(s.charCodeAt(b - 1))) b--;
  return s.slice(a, b);
}

const ND = /^\p{Nd}$/u;

/** Value of any Unicode decimal digit (Python's \d, int() and Decimal() accept all of them). */
function digitValue(ch: string): number {
  const cp = ch.codePointAt(0)!;
  if (cp >= 48 && cp <= 57) return cp - 48;
  // Unicode encodes decimal digits only in contiguous runs of ten, 0 to 9.
  let start = cp;
  while (start > 0 && ND.test(String.fromCodePoint(start - 1))) start--;
  return (cp - start) % 10;
}

/** Python int(s), base 10. */
function pyInt(s: string | null): number {
  let t = "";
  for (const ch of strip(s ?? "")) t += ch.codePointAt(0)! > 127 && ND.test(ch) ? String(digitValue(ch)) : ch;
  const m = s === null ? null : /^([+-]?)([0-9](?:_?[0-9])*)$/.exec(t);
  if (!m) throw new Unreadable(`invalid literal for int(): ${repr(s)}`);
  return Number(m[1] + m[2].replace(/_/g, ""));
}

/** Python repr() of a str (or None), for the %r in rejection messages. */
function repr(s: string | null): string {
  if (s === null) return "None";
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = q;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ch === "\\" || ch === q) out += "\\" + ch;
    else if (ch === "\t") out += "\\t";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (cp !== 0x20 && /^[\p{C}\p{Z}]$/u.test(ch)) {
      const hex = cp.toString(16);
      out += cp < 0x100 ? `\\x${hex.padStart(2, "0")}` : cp < 0x10000 ? `\\u${hex.padStart(4, "0")}` : `\\U${hex.padStart(8, "0")}`;
    } else out += ch;
  }
  return out + q;
}

/**
 * A Python float. Python ints stay plain JS numbers. The payload only needs the value, but the
 * reconcile messages print Decimal(str(x)), where 734 and 734.0 read differently.
 */
class PyFloat {
  v: number;
  constructor(v: number) {
    this.v = v;
  }
}
type PyNum = number | PyFloat;
type Py = string | number | boolean | null | PyFloat | Py[] | { [key: string]: Py };

const val = (x: PyNum): number => (typeof x === "number" ? x : x.v);
/** Python `x or 0` for a number or None. */
const or0 = (x: PyNum | null): PyNum => (x === null || val(x) === 0 ? 0 : x);

// ---------------------------------------------------------------- decimal.Decimal, default context (28 digits, half-even)

type Dec = { neg: boolean; coef: bigint; exp: number }; // value = (-1)^neg * coef * 10^exp
const PREC = 28;
const DEC0: Dec = { neg: false, coef: 0n, exp: 0 };
const pow10 = (n: number): bigint => 10n ** BigInt(n);
const ndigits = (n: bigint): number => n.toString().length;

/** Drop the last `drop` digits of the coefficient, ROUND_HALF_EVEN. */
function roundCoef(coef: bigint, drop: number): bigint {
  const p = pow10(drop);
  let q = coef / p;
  const r = coef % p;
  const half = p / 2n;
  if (r > half || (r === half && q % 2n === 1n)) q += 1n;
  return q;
}

/** Context rounding after an operation (Decimal._fix for in-range values). */
function fix(d: Dec): Dec {
  const drop = ndigits(d.coef) - PREC;
  if (drop <= 0) return d;
  let coef = roundCoef(d.coef, drop);
  let exp = d.exp + drop;
  if (ndigits(coef) > PREC) {
    coef /= 10n;
    exp += 1;
  }
  return { neg: d.neg, coef, exp };
}

function decAdd(a: Dec, b: Dec): Dec {
  const exp = Math.min(a.exp, b.exp);
  if (a.coef === 0n && b.coef === 0n) return { neg: a.neg && b.neg, coef: 0n, exp };
  const s = (a.neg ? -a.coef : a.coef) * pow10(a.exp - exp) + (b.neg ? -b.coef : b.coef) * pow10(b.exp - exp);
  if (s === 0n) return { neg: false, coef: 0n, exp };
  return fix({ neg: s < 0n, coef: s < 0n ? -s : s, exp });
}

/** a - b: Python adds b.copy_negate(). */
const decSub = (a: Dec, b: Dec): Dec => decAdd(a, { ...b, neg: !b.neg });
/** Unary minus: -Decimal('0') stays positive. */
const decNeg = (d: Dec): Dec => fix({ ...d, neg: d.coef === 0n ? false : !d.neg });

function decGt(a: Dec, b: Dec): boolean {
  const e = Math.min(a.exp, b.exp);
  return (a.neg ? -a.coef : a.coef) * pow10(a.exp - e) > (b.neg ? -b.coef : b.coef) * pow10(b.exp - e);
}

/** round(d, 2) = d.quantize(Decimal('0.01')), half-even. */
function decRound2(d: Dec): Dec {
  if (d.exp >= -2) return { neg: d.neg, coef: d.coef * pow10(d.exp + 2), exp: -2 };
  return { neg: d.neg, coef: roundCoef(d.coef, -2 - d.exp), exp: -2 };
}

/** float(d): correctly rounded. */
const decToFloat = (d: Dec): number => Number(`${d.neg ? "-" : ""}${d.coef}e${d.exp}`);

/** int(d): truncates toward zero. */
function decToInt(d: Dec): number {
  const v = d.exp >= 0 ? d.coef * pow10(d.exp) : d.coef / pow10(-d.exp);
  return Number(d.neg ? -v : v);
}

/** str(d): Decimal's to-scientific-string. */
function decStr(d: Dec): string {
  const ds = d.coef.toString();
  const left = d.exp + ds.length;
  const dot = d.exp <= 0 && left > -6 ? left : 1;
  let s: string;
  if (dot <= 0) s = "0." + "0".repeat(-dot) + ds;
  else if (dot >= ds.length) s = ds + "0".repeat(dot - ds.length);
  else s = ds.slice(0, dot) + "." + ds.slice(dot);
  if (left !== dot) s += "E" + (left - dot >= 0 ? "+" : "-") + Math.abs(left - dot);
  return (d.neg ? "-" : "") + s;
}

/** Decimal(str(x)) for a Python int or float (float repr: shortest digits, '734.0', '1e-05', '1e+16'). */
function decOf(x: PyNum): Dec {
  if (typeof x === "number") return { neg: x < 0, coef: BigInt(Math.abs(x)), exp: 0 };
  const v = x.v;
  if (v === 0) return { neg: Object.is(v, -0), coef: 0n, exp: -1 };
  const [mant, e] = Math.abs(v).toExponential().split("e");
  const ds = mant.replace(".", "");
  const sci = Number(e);
  const exp = sci - (ds.length - 1);
  if (sci < -4 || sci >= 16) return { neg: v < 0, coef: BigInt(ds), exp };
  const fixedExp = Math.min(exp, -1); // fixed notation always shows a decimal: 734.0
  return { neg: v < 0, coef: BigInt(ds) * pow10(exp - fixedExp), exp: fixedExp };
}

/** pos_report.py D(): Decimal(str(x or 0)). */
const D = (x: PyNum | null): Dec => decOf(or0(x));

const decSum = (xs: Dec[]): Dec => xs.reduce(decAdd, DEC0);

/** Decimal(s): null = invalid (InvalidOperation), "special" = NaN / Infinity. */
function decParse(s: string): Dec | "special" | null {
  let t = "";
  for (const ch of strip(s)) {
    if (ch === "_") continue; // Decimal ignores underscores anywhere
    const cp = ch.codePointAt(0)!;
    if (cp > 0 && cp <= 127) t += ch;
    else if (ND.test(ch)) t += String(digitValue(ch));
    else return null;
  }
  const m = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(t);
  if (!m) return /^[+-]?(?:inf(?:inity)?|s?nan\d*)$/i.test(t) ? "special" : null;
  const frac = m[3] ?? m[4] ?? "";
  return { neg: m[1] === "-", coef: BigInt((m[2] ?? "") + frac), exp: (m[5] ? Number(m[5]) : 0) - frac.length };
}

// ================================================================ zip, as Python's zipfile reads it

type ZipInfo = { name: string; orig: string; flags: number; method: number; crc: number; csize: number; usize: number; offset: number; end: number };

const MAX_MEMBER = 64 * 1024 * 1024;
const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒ" +
  "áíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐" +
  "└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀" +
  "αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u{a0}";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = -1;
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const utf8 = (b: Uint8Array, keepBom = false): string => new TextDecoder("utf-8", { fatal: true, ignoreBOM: keepBom }).decode(b);

function zipName(b: Uint8Array, isUtf8: boolean): string {
  if (isUtf8) return utf8(b, true);
  let s = "";
  for (const c of b) s += c < 128 ? String.fromCharCode(c) : CP437_HIGH[c - 128];
  return s;
}

function u64(b: Buffer, at: number): number {
  const v = b.readBigUInt64LE(at);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Unreadable("zip64 value out of range");
  return Number(v);
}

const bad = (msg: string) => new Unreadable(msg);

function openZip(buf: Buffer): { names: string[]; read: (name: string) => Buffer } {
  const size = buf.length;
  // End of central directory: at the very end, or followed by an archive comment.
  let eocd = -1;
  if (size >= 22 && buf.readUInt32LE(size - 22) === 0x06054b50 && buf.readUInt16LE(size - 2) === 0) eocd = size - 22;
  else {
    const at = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (at >= Math.max(size - 65535 - 22, 0)) {
      if (at + 22 > size) throw bad("File is not a zip file");
      eocd = at;
    }
  }
  if (eocd < 0) throw bad("File is not a zip file");
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  let location = eocd;

  // ZIP64 end of central directory (zipfile._EndRecData64).
  let offset = eocd - 20;
  if (offset >= 0 && buf.readUInt32LE(offset) === 0x07064b50) {
    const diskno = buf.readUInt32LE(offset + 4);
    const reloff = u64(buf, offset + 8);
    const disks = buf.readUInt32LE(offset + 16);
    if (diskno !== 0 || disks > 1) throw bad("zipfiles that span multiple disks are not supported");
    offset -= 56;
    if (reloff > offset) throw bad("Corrupt zip64 end of central directory locator");
    let at = reloff;
    let extra = offset - reloff;
    const isRec = (p: number) => p >= 0 && p + 56 <= size && buf.readUInt32LE(p) === 0x06064b50;
    if (!isRec(at) && reloff !== offset) {
      at = offset;
      extra = 0;
    }
    if (!isRec(at)) throw bad("Zip64 end of central directory record not found");
    const recSize = u64(buf, at + 4);
    cdSize = u64(buf, at + 40);
    cdOffset = u64(buf, at + 48);
    if (cdOffset + cdSize !== reloff || recSize + 12 !== 56 + extra) throw bad("Corrupt zip64 end of central directory record");
    location = offset - extra;
  }

  // Central directory (zipfile._RealGetContents).
  const concat = location - cdSize - cdOffset;
  const start = cdOffset + concat;
  if (start < 0) throw bad("Bad offset for central directory");
  const cd = buf.subarray(start, start + cdSize);
  const list: ZipInfo[] = [];
  const byName = new Map<string, ZipInfo>();
  let pos = 0;
  while (pos < cdSize) {
    if (pos + 46 > cd.length) throw bad("Truncated central directory");
    if (cd.readUInt32LE(pos) !== 0x02014b50) throw bad("Bad magic number for central directory");
    const flags = cd.readUInt16LE(pos + 8);
    const nameLen = cd.readUInt16LE(pos + 28);
    const extraLen = cd.readUInt16LE(pos + 30);
    const commentLen = cd.readUInt16LE(pos + 32);
    const rawName = cd.subarray(pos + 46, pos + 46 + nameLen);
    let extra = cd.subarray(pos + 46 + nameLen, pos + 46 + nameLen + extraLen);
    if (cd[pos + 6] > 63) throw bad(`zip file version ${(cd[pos + 6] / 10).toFixed(1)}`);
    const orig = zipName(rawName, (flags & 0x800) !== 0);
    const info: ZipInfo = {
      name: orig.split("\0")[0],
      orig,
      flags,
      method: cd.readUInt16LE(pos + 10),
      crc: cd.readUInt32LE(pos + 16),
      csize: cd.readUInt32LE(pos + 20),
      usize: cd.readUInt32LE(pos + 24),
      offset: cd.readUInt32LE(pos + 42),
      end: 0,
    };
    // Extra fields: ZIP64 sizes / offset, Info-ZIP Unicode path.
    while (extra.length >= 4) {
      const tp = extra.readUInt16LE(0);
      const ln = extra.readUInt16LE(2);
      if (ln + 4 > extra.length) throw bad(`Corrupt extra field ${tp.toString(16).padStart(4, "0")} (size=${ln})`);
      let data = extra.subarray(4, ln + 4);
      if (tp === 0x0001) {
        const take = (field: string) => {
          if (data.length < 8) throw bad(`Corrupt zip64 extra field. ${field} not found.`);
          const v = u64(data, 0);
          data = data.subarray(8);
          return v;
        };
        if (info.usize === 0xffffffff) info.usize = take("File size");
        if (info.csize === 0xffffffff) info.csize = take("Compress size");
        if (info.offset === 0xffffffff) info.offset = take("Header offset");
      } else if (tp === 0x7075) {
        if (data.length < 5) throw bad("Corrupt unicode path extra field (0x7075)");
        if (data[0] === 1 && data.readUInt32LE(1) === crc32(rawName)) {
          let up: string;
          try {
            up = utf8(data.subarray(5), true);
          } catch {
            throw bad("Corrupt unicode path extra field (0x7075): invalid utf-8 bytes");
          }
          if (up) info.name = up.split("\0")[0];
        }
      }
      extra = extra.subarray(ln + 4);
    }
    info.offset += concat;
    list.push(info);
    byName.set(info.name, info);
    pos += 46 + nameLen + extraLen + commentLen;
  }
  // Each member must end before the next one starts (zip bomb guard).
  let end = start;
  for (const info of [...list].sort((a, b) => a.offset - b.offset).reverse()) {
    info.end = end;
    end = info.offset;
  }

  function read(name: string): Buffer {
    const info = byName.get(name);
    if (!info) throw bad(`There is no item named ${repr(name)} in the archive`);
    const h = info.offset;
    if (h < 0 || h + 30 > size) throw bad("Truncated file header");
    if (buf.readUInt32LE(h) !== 0x04034b50) throw bad("Bad magic number for file header");
    const localName = buf.subarray(h + 30, h + 30 + buf.readUInt16LE(h + 26));
    const dataStart = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
    if (info.flags & 0x20) throw bad("compressed patched data (flag bit 5)");
    if (info.flags & 0x40) throw bad("strong encryption (flag bit 6)");
    if (zipName(localName, (buf.readUInt16LE(h + 6) & 0x800) !== 0) !== info.orig) {
      throw bad(`File name in directory ${repr(info.orig)} and header ${repr(localName.toString("latin1"))} differ.`);
    }
    if (dataStart + info.csize > info.end && info.end !== info.offset) throw bad(`Overlapped entries: ${repr(info.orig)} (possible zip bomb)`);
    if (info.flags & 0x1) throw bad(`File ${repr(name)} is encrypted, password required for extraction`);
    if (info.method !== 0 && info.method !== 8) throw bad(`compression type ${info.method}`);
    if (info.usize > MAX_MEMBER) throw bad(`${name} is too large`);
    const raw = buf.subarray(dataStart, dataStart + info.csize);
    if (raw.length < info.csize) throw bad(`${name} is truncated`);
    let out: Buffer;
    if (info.method === 0) out = raw;
    else {
      try {
        // Like zlib.decompressobj(-15): trailing bytes are ignored, a cut stream gives what it has.
        out = inflateRawSync(raw, { finishFlush: zlibConstants.Z_SYNC_FLUSH, maxOutputLength: Math.max(1, info.usize) });
      } catch (e) {
        throw bad(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    out = out.subarray(0, info.usize);
    if (crc32(out) !== info.crc) throw bad(`Bad CRC-32 for file ${repr(name)}`);
    return out;
  }

  return { names: list.map((i) => i.name), read };
}

// ================================================================ XML, as xml.etree.ElementTree sees it

type XNode = { tag: string; attrs: Map<string, string>; kids: XNode[]; text: string | null };

const ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);
const XML_CHAR = /^[\t\n\r\x20-\u{d7ff}\u{e000}-\u{fffd}\u{10000}-\u{10ffff}]*$/u;
const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE(?:[^>[]|\[[\s\S]*?\])*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|[^<]+/y;
const ATTR = /\s+([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const REF = /&(?:#([0-9]+)|#x([0-9A-Fa-f]+)|([A-Za-z_:][\w.\-:]*))?(;)?/g;

function xmlText(bytes: Buffer): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return utf8(bytes.subarray(3), true);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le", { fatal: true }).decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be", { fatal: true }).decode(bytes.subarray(2));
  const decl = /^<\?xml[^>]*?\sencoding\s*=\s*["']([A-Za-z][\w.\-]*)["']/.exec(bytes.subarray(0, 300).toString("latin1"));
  const enc = decl ? decl[1].toLowerCase() : "utf-8";
  return enc === "utf-8" || enc === "utf8" ? utf8(bytes, true) : new TextDecoder(enc, { fatal: true }).decode(bytes);
}

function parseXml(bytes: Buffer, part: string): XNode {
  const err = (msg: string) => new Unreadable(`${part}: ${msg}`);
  const src = xmlText(bytes).replace(/\r\n?/g, "\n"); // XML end-of-line handling
  if (!XML_CHAR.test(src)) throw err("not well-formed (invalid token)");

  const refs = (s: string): string =>
    s.includes("&")
      ? s.replace(REF, (_m, dec: string | undefined, hex: string | undefined, name: string | undefined, semi: string | undefined) => {
          if (!semi || (!dec && !hex && !name)) throw err("not well-formed (invalid token)");
          if (name) {
            const v = ENTITIES.get(name);
            if (v === undefined) throw err(`undefined entity &${name};`);
            return v;
          }
          const cp = dec ? Number(dec) : parseInt(hex!, 16);
          const ch = cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
          if (!ch || !XML_CHAR.test(ch)) throw err("reference to invalid character number");
          return ch;
        })
      : s;

  type Frame = { node: XNode; raw: string; ns: Map<string, string> };
  const stack: Frame[] = [];
  const top = new Map([["xml", "http://www.w3.org/XML/1998/namespace"]]);
  let root: XNode | null = null;
  let done = false;

  const qname = (name: string, ns: Map<string, string>, element: boolean): string => {
    const i = name.indexOf(":");
    if (i < 0) {
      const d = element ? ns.get("") : undefined;
      return d ? `{${d}}${name}` : name;
    }
    const uri = ns.get(name.slice(0, i));
    if (uri === undefined) throw err(`unbound prefix ${name.slice(0, i)}`);
    return `{${uri}}${name.slice(i + 1)}`;
  };
  const addText = (s: string) => {
    const open = stack[stack.length - 1];
    if (!open) {
      if (/[^ \t\n]/.test(s)) throw err(done ? "junk after document element" : "syntax error");
      return;
    }
    if (open.node.kids.length === 0) open.node.text = (open.node.text ?? "") + s; // ElementTree .text; tails are not used
  };

  let pos = 0;
  while (pos < src.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw err(`not well-formed (invalid token) at ${pos}`);
    pos = TOKEN.lastIndex;
    const [tok, cdata, endName, startName, rawAttrs, selfClose] = m;
    if (cdata !== undefined) {
      if (!stack.length) throw err("syntax error");
      if (cdata) addText(cdata);
    } else if (endName !== undefined) {
      const open = stack.pop();
      if (!open || open.raw !== endName) throw err("mismatched tag");
      if (!stack.length) done = true;
    } else if (startName !== undefined) {
      if (done) throw err("junk after document element");
      const parent = stack.length ? stack[stack.length - 1].ns : top;
      let ns = parent;
      const plain: [string, string][] = [];
      const seen = new Set<string>();
      for (const a of (rawAttrs ?? "").matchAll(ATTR)) {
        const name = a[1];
        const rawVal = a[2] ?? a[3] ?? "";
        if (rawVal.includes("<")) throw err("not well-formed (invalid token)");
        if (seen.has(name)) throw err("duplicate attribute");
        seen.add(name);
        const v = refs(rawVal.replace(/[\t\n]/g, " "));
        if (name === "xmlns" || name.startsWith("xmlns:")) {
          if (ns === parent) ns = new Map(parent);
          ns.set(name === "xmlns" ? "" : name.slice(6), v);
        } else plain.push([name, v]);
      }
      const attrs = new Map<string, string>();
      for (const [name, v] of plain) {
        const q = qname(name, ns, false);
        if (attrs.has(q)) throw err("duplicate attribute");
        attrs.set(q, v);
      }
      const node: XNode = { tag: qname(startName, ns, true), attrs, kids: [], text: null };
      if (stack.length) stack[stack.length - 1].node.kids.push(node);
      else root = node;
      if (selfClose) {
        if (!stack.length) done = true;
      } else stack.push({ node, raw: startName, ns });
    } else if (tok[0] !== "<") {
      addText(refs(tok));
    }
    // Comments, processing instructions and the DOCTYPE carry no data.
  }
  if (!root || stack.length) throw err("no element found");
  return root;
}

function iter(n: XNode, tag: string, out: XNode[] = []): XNode[] {
  if (n.tag === tag) out.push(n);
  for (const k of n.kids) iter(k, tag, out);
  return out;
}
const find = (n: XNode, tag: string): XNode | null => n.kids.find((k) => k.tag === tag) ?? null;
const findall = (n: XNode, tag: string): XNode[] => n.kids.filter((k) => k.tag === tag);

// ================================================================ pos_report.py

const M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}";
const R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}";
const P = "{http://schemas.openxmlformats.org/package/2006/relationships}";
const MAX_CELLS = 2_000_000;

type Cell = string | null;
type Row = Cell[];

function ref(r: string | null): [number, number] {
  const m = r === null ? null : /^([A-Z]+)(\p{Nd}+)\n?$/u.exec(r);
  if (!m) throw new Unreadable(`bad cell reference ${repr(r)}`);
  let c = 0;
  for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64;
  return [pyInt(m[2]), c];
}

/** Every sheet as dense rows (null = empty cell), keyed by sheet name. */
function workbook(xlsx: Buffer): Map<string, Row[]> {
  const z = openZip(xlsx);
  const xml = (name: string) => parseXml(z.read(name), name);
  const ss: string[] = [];
  if (z.names.includes("xl/sharedStrings.xml")) {
    for (const si of findall(xml("xl/sharedStrings.xml"), M + "si")) ss.push(iter(si, M + "t").map((t) => t.text ?? "").join(""));
  }
  const rels = new Map<string | null, string | null>();
  for (const r of findall(xml("xl/_rels/workbook.xml.rels"), P + "Relationship")) rels.set(r.attrs.get("Id") ?? null, r.attrs.get("Target") ?? null);
  const sheets = find(xml("xl/workbook.xml"), M + "sheets");
  if (!sheets) throw new Unreadable("xl/workbook.xml has no sheet list");

  const out = new Map<string, Row[]>();
  for (const s of sheets.kids) {
    const rid = s.attrs.get(R + "id") ?? null;
    if (!rels.has(rid)) throw new Unreadable(`no workbook relationship ${repr(rid)}`);
    const target = rels.get(rid);
    if (target == null) throw new Unreadable(`workbook relationship ${repr(rid)} has no target`);
    const t = target.replace(/^\/+/, "");
    const grid = new Map<number, Map<number, string>>();
    let maxRow = 0;
    let maxCol = 0;
    for (const c of iter(xml(t.startsWith("xl/") ? t : "xl/" + t), M + "c")) {
      const kind = c.attrs.get("t");
      const v = find(c, M + "v");
      let value: string | null;
      if (kind === "s") {
        if (!v) throw new Unreadable("shared string cell without a value");
        let i = pyInt(v.text);
        if (i < 0) i += ss.length; // Python list index
        if (i < 0 || i >= ss.length) throw new Unreadable("shared string index out of range");
        value = ss[i];
      } else if (kind === "inlineStr") {
        value = iter(c, M + "t").map((x) => x.text ?? "").join("");
      } else {
        value = v ? v.text : null;
      }
      if (value !== null && strip(value) !== "") {
        const [row, col] = ref(c.attrs.get("r") ?? null);
        if (!grid.has(row)) grid.set(row, new Map());
        grid.get(row)!.set(col, value);
        maxRow = Math.max(maxRow, row);
        maxCol = Math.max(maxCol, col);
      }
    }
    if (maxRow * maxCol > MAX_CELLS) throw new Unreadable("sheet too large");
    const rows: Row[] = [];
    for (let r = 1; r <= maxRow; r++) {
      const cells = grid.get(r);
      rows.push(Array.from({ length: maxCol }, (_, i) => cells?.get(i + 1) ?? null));
    }
    const name = s.attrs.get("name");
    if (name === undefined) throw new Unreadable("sheet without a name");
    out.set(strip(name), rows);
  }
  return out;
}

/** "" or "-" -> null; a whole number unless the text has a "." (as in pos_report.py). */
function num(x: Cell): PyNum | null {
  const s = strip(x ?? "").replace(/,/g, "");
  if (s === "" || s === "-") return null;
  const d = decParse(s);
  if (d === null) return null;
  if (d === "special" || Math.abs(d.exp) > 400) throw new Unreadable(`unreadable number ${repr(x)}`);
  if (!s.includes(".")) return decToInt(d);
  const f = decToFloat(d);
  if (!Number.isFinite(f)) throw new Unreadable(`unreadable number ${repr(x)}`);
  return new PyFloat(f);
}

function txt(x: Cell): string | null {
  const s = strip(x ?? "");
  return s === "" || s === "-" ? null : s;
}

const cell = (row: Row, i: number): Cell => (i < row.length ? row[i] : null);

/** row[0].strip(): a missing cell is a crash in Python. */
function stripped(x: Cell): string {
  if (x === null) throw new Unreadable("empty name cell");
  return strip(x);
}

type OvRow = [string, PyNum | null, PyNum | null];

/** Sections of the "Store orders overview" sheet: title row, then (label, amount, qty) rows. */
function overview(rows: Row[]): Map<string, OvRow[]> {
  const sec = new Map<string, OvRow[]>();
  let cur: string | null = null;
  for (const r of rows) {
    const [a, b, c] = [cell(r, 0), cell(r, 1), cell(r, 2)];
    if (a && b === null && c === null) {
      cur = strip(a);
      sec.set(cur, []);
    } else if (strip(b ?? "") === "Amount" || !txt(a) || cur === null) {
      continue;
    } else {
      sec.get(cur)!.push([strip(a!), num(b), num(c)]);
    }
  }
  return sec;
}

/** Data rows of a titled block on the Product report sheet (after its header row, up to its Total row). */
function table(rows: Row[], title: string): Row[] {
  for (let i = 0; i < rows.length; i++) {
    if (strip(cell(rows[i], 0) ?? "") === title) {
      const out: Row[] = [];
      for (const r2 of rows.slice(i + 2)) {
        if (strip(cell(r2, 0) ?? "") === "Total") return out;
        if (r2.some((v) => v !== null)) out.push(r2);
      }
      return out;
    }
  }
  return [];
}

const range = (a: number, b: number): number[] => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

function parse(xlsx: Buffer, msgId: string | null): PosParseResult {
  const wb = workbook(xlsx);
  const need = ["Report Info", "Store orders overview", "Daily Report", "Product report", "Paid order list"];
  const missing = need.filter((s) => !wb.has(s));
  if (missing.length) fail(`not an EZI POS daily report (missing sheets: ${missing.join(", ")})`);
  const sheet = (name: string): Row[] => wb.get(name)!;

  const infoRows = sheet("Report Info");
  if (infoRows.length < 3) throw new Unreadable("Report Info has no data row");
  const info = infoRows[2];
  const store = txt(cell(info, 0));
  const gen = txt(cell(info, 1));
  const period = txt(cell(info, 2)) || "";
  if (!/^\p{Nd}{4}-\p{Nd}{2}-\p{Nd}{2} \p{Nd}{2}:\p{Nd}{2}:\p{Nd}{2}$/u.test(gen ?? "")) fail(`unreadable generation time ${repr(gen)}`);
  const days = sheet("Daily Report")
    .slice(1)
    .filter((r) => /^\p{Nd}{4}-\p{Nd}{2}-\p{Nd}{2}$/u.test(strip(cell(r, 0) ?? "")));
  if (days.length !== 1) fail(`report covers ${days.length} business days (only single-day reports are imported)`);
  const date = strip(days[0][0]!);
  if (!period.startsWith(date)) fail(`time period ${repr(period)} does not match business date ${date}`);

  const ov = overview(sheet("Store orders overview"));
  const section = (name: string): OvRow[] => ov.get(name) ?? [];
  const sales = new Map<string, [PyNum | null, PyNum | null]>();
  for (const [k, a, q] of section("Sales summary")) sales.set(k, [a, q]);
  const fees: [string, PyNum | null][] = section("Fee summary").map(([k, a]) => [k, a]);
  const fee = new Map(fees);
  const pay: [string, PyNum, PyNum][] = section("Payment Method Report")
    .filter(([k]) => k !== "Total")
    .map(([k, a, q]) => [k, or0(a), or0(q)]);
  const staff: Py[] = [
    ...section("Cashier Report")
      .filter(([k]) => k !== "Total")
      .map(([k, a, q]): Py => ["cashier", k, or0(a), or0(q)]),
    ...section("Order Placed By Report")
      .filter(([k]) => k !== "Total")
      .map(([k, a, q]): Py => ["waiter", k, or0(a), or0(q)]),
  ];
  const special: Py[] = [
    ...section("Special Case").map(([k, a, q]): Py => [k, or0(a), or0(q)]),
    ...section("Pay in/Pay out").map(([k, a]): Py => [k, or0(a), 0]),
  ];
  const disc = decNeg(decSum(["Dishes discount", "Order discount", "Discount voucher"].map((k) => D(fee.get(k) ?? null))));
  const sale = (k: string, dflt: [PyNum | null, PyNum | null]) => sales.get(k) ?? dflt;
  const summ = {
    orders: sale("Paid orders Qty", [null, null])[1],
    refunded: or0(sale("Refunded orders Qty", [null, 0])[1]),
    product: or0(fee.get("Product") ?? null),
    addon: or0(fee.get("Add-on") ?? null),
    discount: new PyFloat(decToFloat(disc)) as PyNum,
    tax: or0(sale("Tax", [0, null])[0]),
    paid: sale("Total paid", [null, null])[0],
    refund: or0(sale("Total refund", [0, null])[0]),
    net: fee.get("Net sales") ?? null,
    actual: sale("Actual sales", [null, null])[0],
  };
  if (summ.orders === null || summ.paid === null || summ.net === null || summ.actual === null) fail("sales summary incomplete");

  const pr = sheet("Product report");
  // [category, qty, gross, discount, net, tax, total, refund]
  const cats = table(pr, "Category report").map((r): [string, ...PyNum[]] => [stripped(r[0]), ...range(1, 8).map((i) => or0(num(cell(r, i))))]);
  // [product, variant, has variants, qty, gross, discount, net, tax, total, refund]
  type Prod = [string, string | null, boolean, ...PyNum[]];
  const prods: Prod[] = [];
  let parent: Prod | null = null;
  for (const r of table(pr, "Product report")) {
    const vals = range(2, 9).map((i) => or0(num(cell(r, i))));
    if (txt(cell(r, 0))) {
      parent = [stripped(r[0]), null, false, ...vals];
      prods.push(parent);
    } else if (parent !== null && txt(cell(r, 1))) {
      parent[2] = true;
      prods.push([parent[0], strip(cell(r, 1)!), false, ...vals]);
    }
  }
  const mods: Py[] = [];
  let mparent: string | null = null;
  for (const r of table(pr, "Modifier report")) {
    if (txt(cell(r, 0))) mparent = stripped(r[0]);
    else if (mparent && txt(cell(r, 1))) mods.push([mparent, strip(cell(r, 1)!), or0(num(cell(r, 2)))]);
  }
  const adds: Py[] = [];
  for (const r of table(pr, "Add-on report")) {
    if (txt(cell(r, 1))) adds.push([txt(cell(r, 0)), strip(cell(r, 1)!), or0(num(cell(r, 2))), or0(num(cell(r, 4)))]);
  }

  const ol = sheet("Paid order list");
  if (!ol.length) throw new Unreadable("Paid order list is empty");
  const head = ol[0].map((h) => strip(h ?? ""));
  const ix = new Map<string, number>();
  head.forEach((h, i) => ix.set(h, i));
  if (!ix.has("Cash voucher") || !ix.has("Transaction fee")) fail("order list columns changed");
  const pcols = range(ix.get("Cash voucher")! + 1, ix.get("Transaction fee")!);
  type Item = [string, string | null, PyNum];
  type Order = [string, string | null, string | null, PyNum, PyNum, PyNum, PyNum, [string, PyNum][], Item[], string | null, string | null, string | null];
  const orders: Order[] = [];
  const warn: string[] = [];
  for (const r of ol.slice(1)) {
    const oid = txt(cell(r, 0));
    if (!oid || oid.startsWith("Explanation")) continue;
    const g = (h: string): Cell => (ix.has(h) ? cell(r, ix.get(h)!) : null);
    const payments: [string, PyNum][] = [];
    for (const i of pcols) {
      const n = num(cell(r, i));
      if (n !== null) payments.push([head[i], n]);
    }
    const text = g("Products") || "";
    // Python: re.findall(r"(.+?)\(([^()]*)\) x (\d+),", text); "." excludes only "\n" there.
    let items = [...text.matchAll(/([^\n]+?)\(([^()]*)\) x (\p{Nd}+),/gu)].map((m): Item => [strip(m[1]), m[2], pyInt(m[3])]);
    if (items.reduce((t, it) => t + val(it[2]), 0) !== val(or0(num(g("Product Qty"))))) {
      warn.push(`order ${oid}: items text not fully read`);
      items = [[strip(text), null, or0(num(g("Product Qty")))]];
    }
    const src = g("Source") || "";
    const who = strip(src.includes(":") ? src.slice(src.indexOf(":") + 1) : src) || null;
    orders.push([
      oid,
      txt(g("Payment time")),
      txt(g("Take up number")),
      or0(num(g("Total paid"))),
      or0(num(g("Product Qty"))),
      or0(num(g("Product amount"))),
      or0(num(g("Order discount"))),
      payments,
      items,
      who,
      txt(g("Type/Channel")),
      txt(g("Status")),
    ]);
  }

  // Reconcile every total, exactly as pos_report.py does (Decimal, tolerance 0.01).
  const leaf = prods.filter((p) => !p[2]);
  const checks: [string, Dec, Dec][] = [
    ["payment methods add up to total paid", decSum(pay.map((p) => D(p[1]))), D(summ.paid)],
    ["orders per payment method add up to paid orders", decSum(pay.map((p) => D(p[2]))), D(summ.orders)],
    ["order list count equals paid orders", D(orders.length), D(summ.orders)],
    ["order totals add up to total paid", decSum(orders.map((o) => D(o[3]))), D(summ.paid)],
    ["category gross equals product amount", decSum(cats.map((c) => D(c[2]))), D(summ.product)],
    ["product net equals category net", decSum(leaf.map((p) => D(p[6]))), decSum(cats.map((c) => D(c[4])))],
    ["product qty equals category qty", decSum(leaf.map((p) => D(p[3]))), decSum(cats.map((c) => D(c[1])))],
  ];
  for (const p of prods) {
    if (p[2]) checks.push([`variants of ${p[0]} add up`, decSum(prods.filter((v) => v[0] === p[0] && v[1]).map((v) => D(v[3]))), D(p[3])]);
  }
  const cent: Dec = { neg: false, coef: 1n, exp: -2 };
  const bad = checks.filter(([, a, b]) => decGt({ ...decSub(a, b), neg: false }, cent)).map(([n, a, b]) => `${n} (${decStr(a)} vs ${decStr(b)})`);
  if (bad.length) fail("totals do not reconcile: " + bad.join("; "));

  const body: { [key: string]: Py } = {
    v: 1,
    store,
    date,
    gen,
    msg: msgId,
    sha: createHash("sha256").update(xlsx).digest("hex"),
    sum: summ,
    fees,
    pay,
    cat: cats,
    prod: prods,
    mod: mods,
    add: adds,
    ord: orders,
    staff,
    special,
    warn,
  };

  // Transport checksum, same walk and arithmetic as pos_report.py (and the DB re-check).
  let n = 0;
  let s = DEC0;
  let c = 0;
  let k = 0n;
  const stack: Py[] = [body];
  while (stack.length) {
    const x = stack.pop()!;
    if (x === null || typeof x === "boolean") continue;
    if (typeof x === "number" || x instanceof PyFloat) {
      n += 1;
      s = decAdd(s, decOf(x));
    } else if (typeof x === "string") {
      let i = 0;
      let acc = 0;
      for (const ch of x) {
        i += 1;
        acc += i * ch.codePointAt(0)!;
        if (acc > 4e15) {
          k += BigInt(acc);
          acc = 0;
        }
      }
      k += BigInt(acc);
      c += i;
    } else if (Array.isArray(x)) stack.push(...x);
    else stack.push(...Object.values(x));
  }
  if (k > BigInt(Number.MAX_SAFE_INTEGER)) throw new Unreadable("report too large to checksum");
  const payload = plain(body) as Record<string, unknown>;
  payload.chk = { n, s: decToFloat(decRound2(s)), c, k: Number(k) };
  if (JSON.stringify(payload).includes("$pos$")) fail("payload contains the SQL quote marker");

  return {
    ok: true,
    payload,
    summary: { date, generated: gen!, orders: val(summ.orders), paid: val(summ.paid), products: leaf.length, warnings: warn },
  };
}

/** The payload as plain JSON values (Python floats become numbers). */
function plain(x: Py): unknown {
  if (x instanceof PyFloat) return x.v;
  if (Array.isArray(x)) return x.map(plain);
  if (x !== null && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([key, v]) => [key, plain(v)]));
  return x;
}
