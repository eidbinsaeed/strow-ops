"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { compressImage } from "@/lib/image";
import { updateMyProfile, changeMyPin } from "./actions";

export function MyAccountForm({
  phone,
  photoUrl,
}: {
  phone: string;
  photoUrl: string | null;
}) {
  const [preview, setPreview] = useState<string | null>(photoUrl);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const img = await compressImage(file, 800, 0.85);
      setDataUrl(img.dataUrl);
      setPreview(img.dataUrl);
    } catch {
      setMsg("Could not read that photo.");
    }
  }

  function saveProfile(formData: FormData) {
    setMsg(null);
    if (dataUrl) formData.set("photo_data_url", dataUrl);
    start(async () => {
      const r = await updateMyProfile(formData);
      setMsg(r?.error ? r.error : "Saved.");
    });
  }

  function savePin(formData: FormData) {
    setMsg(null);
    start(async () => {
      const r = await changeMyPin(formData);
      setMsg(r?.error ? r.error : "PIN changed.");
    });
  }

  return (
    <div className="space-y-5">
      <form
        action={saveProfile}
        className="rounded-2xl border border-neutral-200 bg-white p-5"
      >
        <p className="mb-4 text-sm font-medium">Profile</p>
        <div className="mb-4 flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Account"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl text-neutral-300">
                👤
              </div>
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              {preview ? "Change photo" : "Add photo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={onPick}
              className="hidden"
            />
            <p className="mt-1 text-xs text-neutral-400">For your staff ID card</p>
          </div>
        </div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-500">
          Phone number
        </label>
        <input
          name="phone"
          defaultValue={phone}
          inputMode="tel"
          placeholder="+971 5x xxx xxxx"
          className="mb-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-strow-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
      </form>

      <form
        action={savePin}
        className="rounded-2xl border border-neutral-200 bg-white p-5"
      >
        <p className="mb-4 text-sm font-medium">Change PIN</p>
        <input
          name="current_pin"
          inputMode="numeric"
          maxLength={4}
          placeholder="Current PIN"
          className="mb-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="new_pin"
          inputMode="numeric"
          maxLength={4}
          placeholder="New 4-digit PIN"
          className="mb-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Update PIN
        </button>
      </form>

      {msg && <p className="text-center text-sm text-neutral-600">{msg}</p>}
    </div>
  );
}
