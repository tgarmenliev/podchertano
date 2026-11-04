import { redirect } from "next/navigation";
import { getCurrent } from "@/core/auth/session";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Код за покана" };

export default async function Invite() {
  const cur = await getCurrent();
  if (!cur) redirect("/login");
  if (cur.profile?.status === "active") redirect("/");
  if (cur.profile?.status === "blocked") redirect("/login?e=blocked");

  return (
    <main className="flex flex-1 flex-col">
      <div className="mt-[14vh]">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Въведи кода си</h1>
        <p className="mt-3 max-w-[36ch] text-ink-2">
          Влезе като <span className="text-ink">{cur.user.email}</span>. За да продължиш, ти трябва код за покана.
        </p>
      </div>
      <InviteForm />
    </main>
  );
}
