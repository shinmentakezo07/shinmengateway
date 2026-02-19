"use client";

import { useEffect, useState } from "react";
import { Card, Input, Button, Toggle, Badge } from "@/shared/components";

interface HFSettings {
  enabled: boolean;
  repoId: string;
  token: string;
  username: string;
  branch: string;
  intervalMinutes: number;
  status?: {
    lastBackupTime: string | null;
    lastBackupStatus: "success" | "error" | "never";
    lastBackupError: string | null;
    lastRestoreTime: string | null;
    lastRestoreStatus: "success" | "error" | "never";
    lastRestoreError: string | null;
  };
}

const DEFAULT_SETTINGS: HFSettings = {
  enabled: true,
  repoId: "shimen/shinway",
  token: "",
  username: "shimen",
  branch: "main",
  intervalMinutes: 5,
};

function formatTimestamp(timestamp: string | null) {
  if (!timestamp) return "Never";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "Invalid date";
  }
}

export default function HFTab() {
  const [settings, setSettings] = useState<HFSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [status, setStatus] = useState<{ type: "" | "success" | "error"; message: string }>({
    type: "",
    message: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/hf");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load settings");
      setSettings({ ...DEFAULT_SETTINGS, ...data });
      setStatus({ type: "", message: "" });
    } catch (error: any) {
      setStatus({ type: "error", message: error.message || "Failed to load settings" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setStatus({ type: "", message: "" });
    try {
      const payload = {
        ...settings,
        intervalMinutes: Number(settings.intervalMinutes) || 5,
      };

      const res = await fetch("/api/settings/hf", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save settings");
      setSettings({ ...DEFAULT_SETTINGS, ...data });
      setStatus({
        type: "success",
        message: "HF settings saved. Interval updates apply on next app restart.",
      });
    } catch (error: any) {
      setStatus({ type: "error", message: error.message || "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  const runBackup = async () => {
    setBacking(true);
    setStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/hf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backup" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Backup failed");
      setSettings((prev) => ({ ...prev, status: data.status }));
      setStatus({ type: "success", message: "Backup completed successfully!" });
    } catch (error: any) {
      setStatus({ type: "error", message: error.message || "Backup failed" });
    } finally {
      setBacking(false);
    }
  };

  const runRestore = async () => {
    if (!confirm("This will replace all local data with the backup from HF dataset. Continue?")) {
      return;
    }

    setRestoring(true);
    setStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/hf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Restore failed");
      setSettings((prev) => ({ ...prev, status: data.status }));
      setStatus({
        type: "success",
        message: "Restore completed! Please restart the app to apply changes.",
      });
    } catch (error: any) {
      setStatus({ type: "error", message: error.message || "Restore failed" });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            cloud_upload
          </span>
        </div>
        <div>
          <h3 className="text-lg font-semibold">Hugging Face Dataset Backup</h3>
          <p className="text-sm text-text-muted">Free persistent storage for HF Spaces</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Enable Automatic Backup</p>
            <p className="text-sm text-text-muted">
              Snapshot /data/omniroute and push to Hugging Face dataset repository
            </p>
          </div>
          <Toggle
            checked={settings.enabled}
            onChange={(value) => setSettings((prev) => ({ ...prev, enabled: value }))}
            disabled={loading || saving}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/50">
          <Input
            label="Dataset Repo"
            placeholder="username/dataset-name"
            value={settings.repoId}
            onChange={(e) => setSettings((prev) => ({ ...prev, repoId: e.target.value }))}
            disabled={loading || saving}
          />

          <Input
            label="Username"
            placeholder="username"
            value={settings.username}
            onChange={(e) => setSettings((prev) => ({ ...prev, username: e.target.value }))}
            disabled={loading || saving}
          />

          <Input
            label="Branch"
            placeholder="main"
            value={settings.branch}
            onChange={(e) => setSettings((prev) => ({ ...prev, branch: e.target.value }))}
            disabled={loading || saving}
          />

          <Input
            label="Backup Interval (minutes)"
            type="number"
            min="1"
            max="1440"
            value={String(settings.intervalMinutes)}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, intervalMinutes: Number(e.target.value || 5) }))
            }
            disabled={loading || saving}
          />
        </div>

        <Input
          label="HF Token"
          type="password"
          placeholder="hf_xxx"
          value={settings.token}
          onChange={(e) => setSettings((prev) => ({ ...prev, token: e.target.value }))}
          disabled={loading || saving}
          hint="Needs write access to the dataset repository"
        />

        {settings.status && (
          <div className="pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium mb-3">Backup Status</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Last Backup:</span>
                  <Badge
                    variant={
                      settings.status.lastBackupStatus === "success"
                        ? "success"
                        : settings.status.lastBackupStatus === "error"
                          ? "error"
                          : "default"
                    }
                    size="sm"
                  >
                    {settings.status.lastBackupStatus}
                  </Badge>
                </div>
                <p className="text-xs text-text-muted">
                  {formatTimestamp(settings.status.lastBackupTime)}
                </p>
                {settings.status.lastBackupError && (
                  <p className="text-xs text-red-500">{settings.status.lastBackupError}</p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Last Restore:</span>
                  <Badge
                    variant={
                      settings.status.lastRestoreStatus === "success"
                        ? "success"
                        : settings.status.lastRestoreStatus === "error"
                          ? "error"
                          : "default"
                    }
                    size="sm"
                  >
                    {settings.status.lastRestoreStatus}
                  </Badge>
                </div>
                <p className="text-xs text-text-muted">
                  {formatTimestamp(settings.status.lastRestoreTime)}
                </p>
                {settings.status.lastRestoreError && (
                  <p className="text-xs text-red-500">{settings.status.lastRestoreError}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {status.message && (
          <p className={`text-sm ${status.type === "error" ? "text-red-500" : "text-green-500"}`}>
            {status.message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={save} loading={saving}>
            Save Settings
          </Button>
          <Button variant="outline" onClick={load} disabled={saving}>
            Reload
          </Button>
          <div className="flex-1" />
          <Button
            variant="secondary"
            onClick={runBackup}
            loading={backing}
            disabled={!settings.repoId || !settings.token || saving || restoring}
          >
            Backup Now
          </Button>
          <Button
            variant="outline"
            onClick={runRestore}
            loading={restoring}
            disabled={!settings.repoId || !settings.token || saving || backing}
          >
            Restore from HF
          </Button>
        </div>
      </div>
    </Card>
  );
}
