import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function Page() {
  return (
    <PlaceholderPage
      title="Fixed Costs"
      description="Recurring costs — rent, salaries, DEWA, internet, software subscriptions. Each with frequency and due day so you see what is coming this month."
      backHref="/owner"
      backLabel="← Dashboard"
    />
  );
}
