import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function Page() {
  return (
    <PlaceholderPage
      title="Categories"
      description="Beverage Ingredients, Resale/Bakery, Packaging, Equipment, Cleaning, Salaries, and any others you want. Sub-categories supported."
      backHref="/owner"
      backLabel="← Dashboard"
    />
  );
}
