import { redirect } from "next/navigation";
import { getCurrent } from "@/core/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Вход" };

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const cur = await getCurrent();
  if (cur?.profile?.status === "active") redirect("/");
  const { e } = await searchParams;

  return (
    <main className="flex flex-1 flex-col">
      <div className="mt-[14vh]">
        <h1 className="text-[34px] font-semibold leading-none tracking-tight">
          <span className="relative inline-block">
            Подчертано
            <span className="wave-line wave-draw absolute inset-x-0 -bottom-3" style={{ height: 6 }} />
          </span>
        </h1>
        <p className="mt-9 max-w-[32ch] text-[19px] leading-snug">Подчертаваш непознатите думи. Те стават твоят речник.</p>
      </div>
      <LoginForm blocked={e === "blocked"} />
    </main>
  );
}
