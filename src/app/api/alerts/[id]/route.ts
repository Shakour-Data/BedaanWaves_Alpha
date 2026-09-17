// DELETE /api/alerts/[id] — delete an alert
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.alert.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
