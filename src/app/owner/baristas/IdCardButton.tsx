"use client";

import { useState } from "react";

type Props = {
  name: string;
  code: string | null;
  role: string;
  photoUrl: string | null;
  cafe: string;
};

const CARD_CSS = `
.qcard{position:relative;width:27em;height:17.03em;background:#3A2A21;border-radius:.9em;overflow:hidden;color:#EFE8DB;font-family:ui-sans-serif,system-ui,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.qcard .art{position:absolute;right:-1em;bottom:-1.3em;width:17em;opacity:.13;pointer-events:none}
.qcard .wm{position:absolute;left:1.4em;top:1.15em;height:2.05em}
.qcard .ar{position:absolute;right:1.4em;top:1.25em;height:1.5em}
.qcard .photo{position:absolute;left:1.7em;top:5em;width:6em;height:6em;border-radius:50%;border:.17em solid #C4A676;overflow:hidden;background:#4A372B;display:flex;align-items:center;justify-content:center}
.qcard .photo img{width:100%;height:100%;object-fit:cover}
.qcard .photo svg{width:3.4em;height:3.4em}
.qcard .info{position:absolute;left:9.3em;top:5.1em}
.qcard .nm{font-family:Georgia,'Times New Roman',serif;font-size:2em;line-height:1;color:#EFE8DB}
.qcard .rl{font-size:.72em;letter-spacing:.28em;color:#C4A676;margin-top:.55em}
.qcard .rule{width:8em;border-top:.06em solid #C4A676;margin:.6em 0}
.qcard .lbl{font-size:.6em;letter-spacing:.34em;color:#A8957C}
.qcard .code{font-family:Georgia,serif;font-size:1.85em;letter-spacing:.12em;color:#EFE8DB;margin-top:.1em}
.qcard .foot{position:absolute;left:1.7em;right:1.7em;bottom:.8em;display:flex;justify-content:space-between;font-size:.55em;letter-spacing:.14em;color:#A8957C}
.qcard.back{display:flex;flex-direction:column;align-items:center;text-align:center}
.qcard.back .wmc{height:2.2em;margin-top:1.6em}
.qcard.back .arc{height:1.5em;margin-top:.5em}
.qcard.back .ruleb{width:11em;border-top:.06em solid #5A4636;margin:.9em 0 .7em}
.qcard.back .terms{font-size:.62em;line-height:1.65;color:#D8CDBC;max-width:21em;margin:0 1em}
.qcard.back .bf{position:absolute;left:1.8em;right:1.8em;bottom:1em;display:flex;justify-content:space-between;align-items:flex-end;font-size:.55em;letter-spacing:.12em;color:#A8957C;text-align:left}
.qcard.back .bf b{font-family:Georgia,serif;font-size:2em;letter-spacing:.06em;color:#EFE8DB;display:block;margin-top:.2em}
`;

const AVATAR = `<svg viewBox="0 0 24 24" fill="#EFE8DB"><circle cx="12" cy="8.4" r="4.2"/><path d="M3.6 21.5c0-4.7 4-7 8.4-7s8.4 2.3 8.4 7z"/></svg>`;

const TERMS =
  "This card is the private property of Qavé Cafe, Al Ain, UAE. Issued to the named employee — non-transferable. Must be surrendered on request or on leaving employment. If found, please return to Qavé Cafe, Al Ain.";

export function IdCardButton({ name, code, role, photoUrl, cafe }: Props) {
  const [open, setOpen] = useState(false);
  const idText = code ?? "—";
  const roleText = (role || "").toUpperCase();

  function printCard() {
    const origin = window.location.origin;
    const A = (p: string) => origin + p;
    const photoFront = photoUrl
      ? `<img src="${photoUrl}" alt=""/>`
      : AVATAR;
    const front = `<div class="qcard">
      <img class="art" src="${A("/brand/qave-art.png")}" alt=""/>
      <img class="wm" src="${A("/brand/qave-wordmark.png")}" alt=""/>
      <img class="ar" src="${A("/brand/qave-arabic.png")}" alt=""/>
      <div class="photo">${photoFront}</div>
      <div class="info"><div class="nm">${name}</div><div class="rl">${roleText}</div>
      <div class="rule"></div><div class="lbl">ID CODE</div><div class="code">${idText}</div></div>
      <div class="foot"><span>${cafe.toUpperCase()} &middot; AL AIN &middot; UAE</span><span>EST 2026</span></div></div>`;
    const back = `<div class="qcard back">
      <img class="art" src="${A("/brand/qave-art.png")}" style="opacity:.07;width:22em;right:2.5em;bottom:-3em" alt=""/>
      <img class="wmc" src="${A("/brand/qave-wordmark.png")}" alt=""/>
      <img class="arc" src="${A("/brand/qave-arabic.png")}" alt=""/>
      <div class="ruleb"></div><p class="terms">${TERMS}</p>
      <div class="bf"><div>EMPLOYEE ID<b>${idText}</b></div><div>Strow Ops</div></div></div>`;
    const w = window.open("", "_blank", "width=520,height=720");
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${name} — ID card</title>` +
        `<style>@page{size:85.6mm 54mm;margin:0}html,body{margin:0;padding:0;background:#fff}` +
        `*{-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
        `.page{width:85.6mm;height:54mm;page-break-after:always;display:flex;align-items:center;justify-content:center;overflow:hidden}` +
        `.page .qcard{font-size:3.17mm;border-radius:0;width:85.6mm;height:54mm}` +
        CARD_CSS +
        `</style></head><body><div class="page">${front}</div><div class="page">${back}</div></body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 transition hover:bg-neutral-50"
      >
        Show card
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <style>{CARD_CSS}</style>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col items-center gap-4 rounded-2xl bg-neutral-100 p-6"
          >
            <div className="qcard" style={{ fontSize: "20px" }}>
              <img className="art" src="/brand/qave-art.png" alt="" />
              <img className="wm" src="/brand/qave-wordmark.png" alt="" />
              <img className="ar" src="/brand/qave-arabic.png" alt="" />
              <div className="photo">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="#EFE8DB">
                    <circle cx="12" cy="8.4" r="4.2" />
                    <path d="M3.6 21.5c0-4.7 4-7 8.4-7s8.4 2.3 8.4 7z" />
                  </svg>
                )}
              </div>
              <div className="info">
                <div className="nm">{name}</div>
                <div className="rl">{roleText}</div>
                <div className="rule" />
                <div className="lbl">ID CODE</div>
                <div className="code">{idText}</div>
              </div>
              <div className="foot">
                <span>{cafe.toUpperCase()} &middot; AL AIN &middot; UAE</span>
                <span>EST 2026</span>
              </div>
            </div>

            <div className="qcard back" style={{ fontSize: "20px" }}>
              <img
                className="art"
                src="/brand/qave-art.png"
                style={{ opacity: 0.07, width: "22em", right: "2.5em", bottom: "-3em" }}
                alt=""
              />
              <img className="wmc" src="/brand/qave-wordmark.png" alt="" />
              <img className="arc" src="/brand/qave-arabic.png" alt="" />
              <div className="ruleb" />
              <p className="terms">{TERMS}</p>
              <div className="bf">
                <div>
                  EMPLOYEE ID<b>{idText}</b>
                </div>
                <div>Strow Ops</div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={printCard}
                className="rounded-lg bg-strow-ink px-4 py-2 text-sm font-medium text-white"
              >
                Print / Save PDF
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
