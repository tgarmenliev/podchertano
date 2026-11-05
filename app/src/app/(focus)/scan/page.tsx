import { aiEnabled } from "@/core/ai/config";
import { requireActive } from "@/core/auth/session";
import { ScanFlow } from "./flow";

export const metadata = { title: "Нова страница" };

export default async function ScanPage() {
  await requireActive();
  return <ScanFlow aiAvailable={aiEnabled()} />;
}
