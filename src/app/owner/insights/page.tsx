import { redirect } from "next/navigation";

/** Insights moved into Sales › Overview (day, week, month or any dates). */
export default function InsightsPage() {
  redirect("/owner/sales");
}
