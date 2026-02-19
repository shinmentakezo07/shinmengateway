import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveDataDir } from "@/lib/dataPaths";

const execFileAsync = promisify(execFile);

const DEFAULT_INTERVAL_MINUTES = 5;
const DEFAULT_BRANCH = "main";

function getRepoId() {
  return process.env.HF_DATASET_REPO_ID || process.env.HF_DATASET_REPO || "shimen/shinway";
}

function getToken() {
  return process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN || "";
}

function getUsername(repoId: string) {
  if (process.env.HF_USERNAME) return process.env.HF_USERNAME;
  const [owner] = repoId.split("/");
  return owner || "hf";
}

function isEnabled() {
  const flag = (process.env.HF_DATASET_BACKUP_ENABLED || "true").toLowerCase();
  return flag !== "false";
}

function getIntervalMinutes() {
  const raw = Number(process.env.HF_DATASET_BACKUP_INTERVAL_MINUTES || DEFAULT_INTERVAL_MINUTES);
  if (Number.isNaN(raw) || raw <= 0) return DEFAULT_INTERVAL_MINUTES;
  return raw;
}

async function runGit(args: string[], cwd: string) {
  await execFileAsync("git", args, { cwd });
}

async function createArchive(sourceDir: string, outputFile: string) {
  await execFileAsync("tar", ["-czf", outputFile, "-C", sourceDir, "."]);
}

export class HFDatasetBackupScheduler {
  intervalId: ReturnType<typeof setInterval> | null;
  isRunningBackup: boolean;
  intervalMinutes: number;

  constructor(intervalMinutes = getIntervalMinutes()) {
    this.intervalId = null;
    this.isRunningBackup = false;
    this.intervalMinutes = intervalMinutes;
  }

  getConfig() {
    const repoId = getRepoId();
    const token = getToken();
    const username = getUsername(repoId);
    const branch = process.env.HF_DATASET_BACKUP_BRANCH || DEFAULT_BRANCH;
    const dataDir = resolveDataDir({ isCloud: false });

    return {
      enabled: isEnabled() && Boolean(repoId) && Boolean(token),
      repoId,
      token,
      username,
      branch,
      dataDir,
    };
  }

  async start() {
    if (this.intervalId) return;

    const config = this.getConfig();
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
    const config = this.getConfig();
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

export async function getHFDatasetBackupScheduler(intervalMinutes = getIntervalMinutes()) {
  if (!backupScheduler) {
    backupScheduler = new HFDatasetBackupScheduler(intervalMinutes);
  }

  return backupScheduler;
}
