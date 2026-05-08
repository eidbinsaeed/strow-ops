import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function Page() {
  return (
    <PlaceholderPage
      title="Expenses"
      description="Every supplier invoice and cash receipt, filterable by supplier, category, payment method, and date. Photo + extracted line items side-by-side."
      backHref="/owner"
      backLabel="← Dashboard"
    />
  );
}
