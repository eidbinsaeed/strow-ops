"use client";

import { useState } from "react";

type Props = {
  name: string;
  code: string | null;
  role: string;
  photoUrl: string | null;
  cafe: string;
};

export function IdCardButton({ name, code, role, photoUrl, cafe }: Props) {
  const [open, setOpen] = useState(false);

  function printCard() {
    const w = window.open("", "_blank", "width=440,height=680");
    if (!w) return;
    const photo = photoUrl
      ? `<img src="${photoUrl}" alt="" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2)"/>`
      : `<div style="width:120px;height:120px;border-radius:50%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:42px">👤</div>`;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${name} — ID card</title></head>` +
        `<body style="margin:0;font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f3f3f3">` +
        `<div style="width:320px;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.15)">` +
        `<div style="background:#5b3a29;color:#fff;padding:18px 0;text-align:center;font-size:18px;font-weight:700;letter-spacing:.5px">${cafe}</div>` +
        `<div style="display:flex;flex-direction:column;align-items:center;padding:22px 18px 26px">${photo}` +
        `<div style="font-size:20px;font-weight:700;margin-top:14px">${name}</div>` +
        `<div style="font-size:13px;color:#888;text-transform:capitalize;margin-top:2px">${role}</div>` +
        `<div style="margin-top:16px;font-size:11px;color:#888;letter-spacing:2px">ID CODE</div>` +
        `<div style="font-size:30px;font-weight:800;font-family:monospace;letter-spacing:4px">${code ?? "—"}</div>` +
        `</div>` +
        `<div style="background:#faf7f1;text-align:center;padding:8px;font-size:11px;color:#aaa">Strow Ops</div>` +
        `</div></body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 400);
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[320px] overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <div className="bg-[#5b3a29] py-4 text-center text-lg font-bold tracking-wide text-white">
              {cafe}
            </div>
            <div className="flex flex-col items-center px-5 pb-6 pt-5">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt=""
                  className="h-28 w-28 rounded-full border-4 border-white object-cover shadow"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-neutral-100 text-4xl text-neutral-300">
                  👤
                </div>
              )}
              <div className="mt-3 text-xl font-bold">{name}</div>
              <div className="text-sm capitalize text-neutral-500">{role}</div>
              <div className="mt-4 text-[10px] uppercase tracking-widest text-neutral-400">
                ID code
              </div>
              <div className="font-mono text-3xl font-extrabold tracking-widest">
                {code ?? "—"}
              </div>
            </div>
            <div className="flex gap-2 border-t border-neutral-100 p-3">
              <button
                onClick={printCard}
                className="flex-1 rounded-lg bg-strow-ink py-2 text-sm font-medium text-white"
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
