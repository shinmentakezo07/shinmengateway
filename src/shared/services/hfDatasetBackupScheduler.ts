import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveDataDir } from "@/lib/dataPaths";
import { getSettings, updateSettings } from "@/lib/localDb";

const execFileAsync = promisify(execFile);

const DEFAULT_INTERVAL_MINUTES = 5;
const DEFAULT_BRANCH = "main";
const DEFAULT_DATASET_REPO = "shimen/shinway";

function getEnvRepoId() {
  return process.env.HF_DATASET_REPO_ID || process.env.HF_DATASET_REPO || DEFAULT_DATASET_REPO;
}

function getEnvToken() {
  return process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN || "";
}

function getEnvUsername(repoId: string) {
  if (process.env.HF_USERNAME) return process.env.HF_USERNAME;
  const [owner] = repoId.split("/");
  return owner || "hf";
}

function getEnvEnabled() {
  const flag = (process.env.HF_DATASET_BACKUP_ENABLED || "true").toLowerCase();
  return flag !== "false";
}

function getEnvIntervalMinutes() {
  const raw = Number(process.env.HF_DATASET_BACKUP_INTERVAL_MINUTES || DEFAULT_INTERVAL_MINUTES);
  if (Number.isNaN(raw) || raw <= 0) return DEFAULT_INTERVAL_MINUTES;
  return raw;
}

function normalizeInterval(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

async function runGit(args: string[], cwd: string) {
  await execFileAsync("git", args, { cwd });
}

async function createArchive(sourceDir: string, outputFile: string) {
  await execFileAsync("tar", ["-czf", outputFile, "-C", sourceDir, "."]);
}

export interface HFDatasetSettings {
  enabled: boolean;
  repoId: string;
  token: string;
  username: string;
  branch: string;
  intervalMinutes: number;
}

function defaultSettings(): HFDatasetSettings {
  const repoId = getEnvRepoId();
  return {
    enabled: getEnvEnabled(),
    repoId,
    token: getEnvToken(),
    username: getEnvUsername(repoId),
    branch: process.env.HF_DATASET_BACKUP_BRANCH || DEFAULT_BRANCH,
    intervalMinutes: getEnvIntervalMinutes(),
  };
}

export async function getHFDatasetBackupSettings(): Promise<HFDatasetSettings> {
  const defaults = defaultSettings();
  const appSettings = (await getSettings().catch(() => ({}))) as Record<string, unknown>;
  const stored = (appSettings.hfDatasetBackup || {}) as Record<string, unknown>;

  const repoId = normalizeText(stored.repoId) || defaults.repoId;
  const token = normalizeText(stored.token) || defaults.token;

  return {
    enabled: normalizeBoolean(stored.enabled, defaults.enabled),
    repoId,
    token,
    username: normalizeText(stored.username) || getEnvUsername(repoId),
    branch: normalizeText(stored.branch) || defaults.branch,
    intervalMinutes: normalizeInterval(stored.intervalMinutes, defaults.intervalMinutes),
  };
}

export async function saveHFDatasetBackupSettings(
  updates: Partial<HFDatasetSettings>
): Promise<HFDatasetSettings> {
  const current = await getHFDatasetBackupSettings();

  const merged: HFDatasetSettings = {
    enabled: normalizeBoolean(updates.enabled, current.enabled),
    repoId: normalizeText(updates.repoId) || current.repoId,
    token: normalizeText(updates.token) || current.token,
    username: normalizeText(updates.username) || current.username,
    branch: normalizeText(updates.branch) || current.branch,
    intervalMinutes: normalizeInterval(updates.intervalMinutes, current.intervalMinutes),
  };

  await updateSettings({ hfDatasetBackup: merged });
  return merged;
}

export class HFDatasetBackupScheduler {
  intervalId: ReturnType<typeof setInterval> | null;
  isRunningBackup: boolean;
  intervalMinutes: number;

  constructor(intervalMinutes = getEnvIntervalMinutes()) {
    this.intervalId = null;
    this.isRunningBackup = false;
    this.intervalMinutes = intervalMinutes;
  }

  async getConfig() {
    const settings = await getHFDatasetBackupSettings();
    const dataDir = resolveDataDir({ isCloud: false });

    return {
      ...settings,
      enabled: settings.enabled && Boolean(settings.repoId) && Boolean(settings.token),
      dataDir,
    };
  }

  async start() {
    if (this.intervalId) return;

    const config = await this.getConfig();
    this.intervalMinutes = config.intervalMinutes;

    if (!config.enabled) {
      return;
    }

    setTimeout(() => {
      this.backupWithLock().catch((error) => {
        console.error("[HFDatasetBackup] initial backup failed:", error?.message || error);
      });
    }, 30000);

    this.intervalId = setInterval(
      () => {
        this.backupWithLock().catch((error) => {
          console.error("[HFDatasetBackup] periodic backup failed:", error?.message || error);
        });
      },
      this.intervalMinutes * 60 * 1000
    );

    console.log(
      `[HFDatasetBackup] Enabled: every ${this.intervalMinutes}m to dataset ${config.repoId}`
    );
  }

  stop() {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async backupWithLock() {
    if (this.isRunningBackup) return;
    this.isRunningBackup = true;

    try {
      await this.runBackup();
    } finally {
      this.isRunningBackup = false;
    }
  }

  async runBackup() {
    const config = await this.getConfig();
    if (!config.enabled) return;

    if (!fs.existsSync(config.dataDir)) {
      return;
    }

    const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "omniroute-hf-backup-"));
    const archiveFile = path.join(tempRoot, "omniroute-data-latest.tar.gz");
    const metadataFile = path.join(tempRoot, "backup-meta.json");
    const repoDir = path.join(tempRoot, "repo");

    const remote = `https://${encodeURIComponent(config.username)}:${encodeURIComponent(config.token)}@huggingface.co/datasets/${config.repoId}`;

    try {
      await createArchive(config.dataDir, archiveFile);

      await fsp.writeFile(
        metadataFile,
        JSON.stringify(
          {
            repoId: config.repoId,
            sourceDir: config.dataDir,
            createdAt: new Date().toISOString(),
          },
          null,
          2
        )
      );

      await fsp.mkdir(repoDir, { recursive: true });
      await runGit(["init"], repoDir);
      await runGit(["config", "user.name", "omniroute-backup-bot"], repoDir);
      await runGit(["config", "user.email", "omniroute-backup-bot@local"], repoDir);
      await runGit(["remote", "add", "origin", remote], repoDir);

      try {
        await runGit(["fetch", "--depth", "1", "origin", config.branch], repoDir);
        await runGit(["checkout", "-B", config.branch, `origin/${config.branch}`], repoDir);
      } catch {
        await runGit(["checkout", "-B", config.branch], repoDir);
      }

      const backupDir = path.join(repoDir, "backups");
      await fsp.mkdir(backupDir, { recursive: true });
      await fsp.copyFile(archiveFile, path.join(backupDir, "omniroute-data-latest.tar.gz"));
      await fsp.copyFile(metadataFile, path.join(backupDir, "backup-meta.json"));

      await runGit(
        ["add", "backups/omniroute-data-latest.tar.gz", "backups/backup-meta.json"],
        repoDir
      );

      const { stdout: statusOut } = await execFileAsync("git", ["status", "--porcelain"], {
        cwd: repoDir,
      });

      if (!statusOut.trim()) {
        return;
      }

      await runGit(
        [
          "commit",
          "-m",
          `chore(backup): update omniroute data snapshot ${new Date().toISOString()}`,
        ],
        repoDir
      );

      await runGit(["push", "origin", config.branch], repoDir);
    } finally {
      await fsp.rm(tempRoot, { recursive: true, force: true });
    }
  }

  isRunning() {
    return this.intervalId !== null;
  }
}

let backupScheduler: HFDatasetBackupScheduler | null = null;

export async function getHFDatasetBackupScheduler(intervalMinutes = getEnvIntervalMinutes()) {
  if (!backupScheduler) {
    backupScheduler = new HFDatasetBackupScheduler(intervalMinutes);
  }

  return backupScheduler;
}
