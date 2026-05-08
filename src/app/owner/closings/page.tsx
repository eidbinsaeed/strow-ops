import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function Page() {
  return (
    <PlaceholderPage
      title="Daily Sales"
      description="Every closing day-by-day, with the original photo of the close sheet next to the extracted data. Filter by date range, barista, anomaly status."
      backHref="/owner"
      backLabel="← Dashboard"
    />
  );
}
