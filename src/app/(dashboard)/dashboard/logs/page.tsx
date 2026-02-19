"use client";

import { useMemo, useState } from "react";
import { RequestLoggerV2, ProxyLogger, SegmentedControl } from "@/shared/components";
import ConsoleLogViewer from "@/shared/components/ConsoleLogViewer";
import AuditLogTab from "./AuditLogTab";

const TAB_META: Record<string, { title: string; description: string }> = {
  "request-logs": {
    title: "Request Logs",
    description: "Inspect incoming requests, response metadata, and status details.",
  },
  "proxy-logs": {
    title: "Proxy Logs",
    description: "Track upstream routing activity and provider-side execution flow.",
  },
  "audit-logs": {
    title: "Audit Logs",
    description: "Review security and administrative actions with full traceability.",
  },
  console: {
    title: "Console",
    description: "View real-time runtime output and operational diagnostics.",
  },
};

export default function LogsPage() {
  const [activeTab, setActiveTab] = useState("request-logs");

  const currentTab = useMemo(() => TAB_META[activeTab] ?? TAB_META["request-logs"], [activeTab]);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/65 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-main)]">
              Logs
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Centralized observability for requests, proxy traffic, audits, and runtime events.
            </p>
          </div>
          <SegmentedControl
            options={[
              { value: "request-logs", label: "Request Logs" },
              { value: "proxy-logs", label: "Proxy Logs" },
              { value: "audit-logs", label: "Audit Logs" },
              { value: "console", label: "Console" },
            ]}
            value={activeTab}
            onChange={setActiveTab}
            className="w-full sm:w-auto"
            aria-label="Logs sections"
          />
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-surface)] to-[var(--color-bg-alt)]/50 p-4 shadow-sm sm:p-5">
        <header className="mb-4 border-b border-[var(--color-border)] pb-4">
          <h2 className="text-base font-semibold text-[var(--color-text-main)]">
            {currentTab.title}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{currentTab.description}</p>
        </header>

        <div className="min-h-[420px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-2 backdrop-blur-[2px] sm:p-3">
          {activeTab === "request-logs" && <RequestLoggerV2 />}
          {activeTab === "proxy-logs" && <ProxyLogger />}
          {activeTab === "audit-logs" && <AuditLogTab />}
          {activeTab === "console" && <ConsoleLogViewer />}
        </div>
      </section>
    </div>
  );
}
