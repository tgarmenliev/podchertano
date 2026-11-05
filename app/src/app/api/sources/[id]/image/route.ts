import { z } from "zod";
import { getCurrent } from "@/core/auth/session";
import { getSourceImage } from "@/modules/scan/service";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cur = await getCurrent();
  if (!cur?.profile || cur.profile.status !== "active") return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const img = await getSourceImage(cur.user.id, id);
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
