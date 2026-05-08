import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function Page() {
  return (
    <PlaceholderPage
      title="Baristas"
      description="Add staff, set or rotate their 4-digit PINs, toggle who is on shift right now. Salaries here flow into Fixed Costs automatically."
      backHref="/owner"
      backLabel="← Dashboard"
    />
  );
}
