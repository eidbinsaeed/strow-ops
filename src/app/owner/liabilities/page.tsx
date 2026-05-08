import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function Page() {
  return (
    <PlaceholderPage
      title="Liabilities"
      description="Customer money held in float overnight, IOUs you owe, deferred payments. Open vs settled status. The 12 AED kept for a customer never gets lost."
      backHref="/owner"
      backLabel="← Dashboard"
    />
  );
}
