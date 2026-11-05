import { requireSession } from "@/core/auth/session";

export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return <>{children}</>;
}
