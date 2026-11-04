import { requireActive } from "@/core/auth/session";

export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  await requireActive();
  return <>{children}</>;
}
