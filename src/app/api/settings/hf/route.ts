import { NextResponse } from "next/server";
import {
  getHFDatasetBackupSettings,
  saveHFDatasetBackupSettings,
} from "@/shared/services/hfDatasetBackupScheduler";

export async function GET() {
  try {
    const settings = await getHFDatasetBackupSettings();
    return NextResponse.json(settings);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load HF settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (body.intervalMinutes !== undefined) {
      const n = Number(body.intervalMinutes);
      if (Number.isNaN(n) || n < 1 || n > 1440) {
        return NextResponse.json(
          { error: "intervalMinutes must be between 1 and 1440" },
          { status: 400 }
        );
      }
      body.intervalMinutes = n;
    }

    const saved = await saveHFDatasetBackupSettings(body);
    return NextResponse.json(saved);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to save HF settings" },
      { status: 500 }
    );
  }
}
