/** Opens WhatsApp with the message ready; the person picks the chat (a supplier, the team group). */
export function WhatsAppButton({ text, label, phone }: { text: string; label: string; phone?: string | null }) {
  const to = phone ? phone.replace(/[^\d]/g, "") : "";
  return (
    <a
      href={`https://wa.me/${to}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-12 items-center justify-center rounded-2xl bg-strow-blue px-4 text-center text-[15px] font-semibold text-white transition active:scale-[0.98]"
    >
      {label}
    </a>
  );
}
