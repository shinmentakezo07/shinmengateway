import { NextResponse } from "next/server";
import {
  getHFDatasetBackupSettings,
  saveHFDatasetBackupSettings,
  getBackupStatus,
  getHFDatasetBackupScheduler,
} from "@/shared/services/hfDatasetBackupScheduler";

export async function GET() {
  try {
    const settings = await getHFDatasetBackupSettings();
    const status = await getBackupStatus();
    return NextResponse.json({ ...settings, status });
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
    const status = await getBackupStatus();
    return NextResponse.json({ ...saved, status });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to save HF settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    const scheduler = await getHFDatasetBackupScheduler();

    if (action === "backup") {
      await scheduler.runBackup();
      const status = await getBackupStatus();
      return NextResponse.json({ success: true, status });
    }

    if (action === "restore") {
      await scheduler.runRestore();
      const status = await getBackupStatus();
      return NextResponse.json({ success: true, status });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'backup' or 'restore'" },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Operation failed" }, { status: 500 });
  }
}
