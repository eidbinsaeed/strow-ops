import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function Page() {
  return (
    <PlaceholderPage
      title="Reports"
      description="Monthly P&L, year-over-year, category breakdown, gross margin. Export to PDF or Excel (format TBD)."
      backHref="/owner"
      backLabel="← Dashboard"
    />
  );
}
