import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function Page() {
  return (
    <PlaceholderPage
      title="Audit log"
      description="Every meaningful state change — who confirmed what closing, who edited which expense, who set a PIN. Immutable trail."
      backHref="/owner"
      backLabel="← Dashboard"
    />
  );
}
