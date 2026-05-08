import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function Page() {
  return (
    <PlaceholderPage
      title="Suppliers"
      description="Add and edit supplier records. Total spend per supplier over time, line-item history, TRN, default category."
      backHref="/owner"
      backLabel="← Dashboard"
    />
  );
}
