// GET /api/ingestion/batches — batch ingestion status and details
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const batches = await db.batchManifest.findMany({
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({
    batches: batches.map((b) => ({
      batchId: b.batchId,
      batchIndex: b.batchIndex,
      batchSize: b.batchSize,
      sourceRevision: b.sourceRevision,
      sourceHash: b.sourceHash,
      selectedTickers: JSON.parse(b.selectedTickers || "[]"),
      skippedTickers: JSON.parse(b.skippedTickers || "[]"),
      failedTickers: JSON.parse(b.failedTickers || "[]"),
      startedAt: b.startedAt?.toISOString(),
      completedAt: b.completedAt?.toISOString(),
      status: b.status,
      rawRowsWritten: b.rawRowsWritten,
      snapshotsWritten: b.snapshotsWritten,
      coefficientsWritten: b.coefficientsWritten,
      trainingRunsWritten: b.trainingRunsWritten,
      generationId: b.generationId,
      validationSummary: b.validationSummary ? JSON.parse(b.validationSummary) : null,
      errorDetails: b.errorDetails,
    })),
  });
}