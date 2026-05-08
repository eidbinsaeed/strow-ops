import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function Page() {
  return (
    <PlaceholderPage
      title="Review queue"
      description="Items the AI flagged for your eyes — low confidence on a field, math that did not reconcile, future date, unknown supplier. Clear them daily."
      backHref="/owner"
      backLabel="← Dashboard"
    />
  );
}
