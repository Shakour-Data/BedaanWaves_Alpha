// GET /api/export?format=csv|json — export rankings
import { NextRequest, NextResponse } from "next/server";
import { exportRankings } from "@/lib/scoring/queries";

export async function GET(req: NextRequest) {
  const format = (req.nextUrl.searchParams.get("format") ?? "csv") as "csv" | "json";
  const data = await exportRankings(format);
  if (format === "json") {
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="bedaanwaves-rankings.json"`,
      },
    });
  }
  return new NextResponse(data, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="bedaanwaves-rankings.csv"`,
    },
  });
}
