import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export const APP_NAME = "omniroute";

function safeHomeDir() {
  try {
    return os.homedir();
  } catch {
    return process.cwd();
  }
}

function normalizeConfiguredPath(dir) {
  if (typeof dir !== "string") return null;
  const trimmed = dir.trim();
  if (!trimmed) return null;
  return path.resolve(trimmed);
}

function isHuggingFaceSpace() {
  return Boolean(
    process.env.SPACE_ID || process.env.HF_SPACE_ID || process.env.SYSTEM === "spaces"
  );
}

function getSpacePersistentDataDir() {
  const persistentRoot = "/data";
  if (!isHuggingFaceSpace()) return null;
  if (!fs.existsSync(persistentRoot)) return null;
  return path.join(persistentRoot, APP_NAME);
}

export function getLegacyDotDataDir() {
  return path.join(safeHomeDir(), `.${APP_NAME}`);
}

export function getDefaultDataDir() {
  const homeDir = safeHomeDir();

  const spacePersistentDir = getSpacePersistentDataDir();
  if (spacePersistentDir) {
    return spacePersistentDir;
  }

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    return path.join(appData, APP_NAME);
  }

  // Support XDG on Linux/macOS when explicitly configured.
  const xdgConfigHome = normalizeConfiguredPath(process.env.XDG_CONFIG_HOME);
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, APP_NAME);
  }

  return getLegacyDotDataDir();
}

export function resolveDataDir({ isCloud = false } = {}) {
  if (isCloud) return "/tmp";

  const configured = normalizeConfiguredPath(process.env.DATA_DIR);
  if (configured) return configured;

  return getDefaultDataDir();
}

export function isSamePath(a, b) {
  if (!a || !b) return false;
  const normalizedA = path.resolve(a);
  const normalizedB = path.resolve(b);

  if (process.platform === "win32") {
    return normalizedA.toLowerCase() === normalizedB.toLowerCase();
  }

  return normalizedA === normalizedB;
}
