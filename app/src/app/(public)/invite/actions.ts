"use server";

import { redirect } from "next/navigation";
import { getCurrent } from "@/core/auth/session";
import { redeemInvite } from "@/core/invites/redeem";

export type InviteState = { error?: string };

const errors = {
  invalid: "Този код не е валиден. Провери го и опитай пак.",
  exhausted: "Този код вече е използван.",
  expired: "Този код е изтекъл.",
  blocked: "Достъпът на този акаунт е спрян.",
} as const;

export async function redeem(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const cur = await getCurrent();
  if (!cur) redirect("/login");
  const res = await redeemInvite(cur.user.id, String(formData.get("code") ?? ""));
  if (!res.ok) return { error: errors[res.reason] };
  redirect("/");
}
