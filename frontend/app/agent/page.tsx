"use client";

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Shield, Settings as SettingsIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AgentControlHub } from "@/components/agent/agent-control-hub";

export default function AgentStatusPage() {
  return (
    <AppShell title="Agent Status & Operations">
      <div className="space-y-6 max-w-5xl pb-20">
        {/* Page Header */}
        <PageHeader
          title="Agent Status & Operational Controls"
          description="Real-time operations center: monitor today's automated activity, enforce daily outbound send limits, toggle autonomous execution, and configure instant recruiter alerts."
          badge={
            <Badge variant="outline" className="gap-1.5 font-mono text-[11px] px-2.5 py-1">
              <Sparkles className="h-3 w-3 text-amber-500" />
              <span>Agent Control Room</span>
            </Badge>
          }
          actions={
            <div className="flex items-center gap-2">
              <Link href="/settings?tab=agent">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <SettingsIcon className="w-3.5 h-3.5" />
                  <span>Agent Settings</span>
                </Button>
              </Link>
            </div>
          }
        />

        {/* Embedded Full Control Hub */}
        <AgentControlHub />
      </div>
    </AppShell>
  );
}
