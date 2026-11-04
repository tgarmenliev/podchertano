import { redirect } from "next/navigation";
import { getCurrent } from "@/core/auth/session";
import { GoogleButton } from "./google-button";

export const metadata = { title: "Вход" };

const messages: Record<string, string> = {
  blocked: "Достъпът на този акаунт е спрян.",
  auth: "Входът не мина. Опитай пак.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const cur = await getCurrent();
  if (cur?.profile?.status === "active") redirect("/");
  if (cur) redirect("/invite");
  const { e } = await searchParams;

  return (
    <main className="flex flex-1 flex-col">
      <div className="mt-[18vh]">
        <h1 className="text-[34px] font-semibold leading-none tracking-tight">
          <span className="relative inline-block">
            Подчертано
            <span className="wave-line absolute inset-x-0 -bottom-3" style={{ height: 6 }} />
          </span>
        </h1>
        <p className="mt-9 max-w-[32ch] text-[19px] leading-snug">Подчертаваш непознатите думи. Те стават твоят речник.</p>
        <p className="mt-3 max-w-[38ch] text-ink-2">Ежедневен преговор по график, за да ги научиш наистина.</p>
      </div>

      <div className="mt-auto pt-12">
        {e && messages[e] && (
          <p role="alert" className="mb-4 rounded-[var(--radius-m)] bg-surface px-4 py-3 text-[15px]">
            {messages[e]}
          </p>
        )}
        <GoogleButton />
        <p className="mt-4 text-center text-sm text-ink-2">Достъпът е само с покана.</p>
      </div>
    </main>
  );
}
