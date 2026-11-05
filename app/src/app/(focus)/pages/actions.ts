"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActive } from "@/core/auth/session";
import { deleteSource } from "@/modules/scan/service";

export async function deleteSourceAction(fd: FormData) {
  const { user } = await requireActive();
  await deleteSource(user.id, z.uuid().parse(fd.get("id")));
  revalidatePath("/pages");
  redirect("/pages");
}
