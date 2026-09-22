"use client";

import ChatSidebar from "@/components/ChatSidebar";
import DataTable from "@/components/DataTable";
import KpiRow from "@/components/KpiRow";
import Verdict from "@/components/Verdict";
import RowDrawer from "@/components/RowDrawer";
import TopBar from "@/components/TopBar";
import UploadDropzone from "@/components/UploadDropzone";
import DetectionBreakdown from "@/components/DetectionBreakdown";
import AuditTelemetry from "@/components/AuditTelemetry";
import AuditClusters from "@/components/AuditClusters";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";

export default function Home() {
  const { sidebarOpen, report } = useStore();

  return (
    <div className="flex h-screen overflow-hidden text-stone-900">
      {/* Left: agent chat */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-stone-900/10 bg-[#FCFBF8] transition-all duration-200 md:flex",
          sidebarOpen ? "w-[360px]" : "w-0 overflow-hidden border-0"
        )}
      >
        <div className="h-full w-[360px]">
          <ChatSidebar />
        </div>
      </aside>

      {/* Mobile chat: top collapsible */}
      <div className="absolute inset-x-0 top-0 z-30 md:hidden">
        {sidebarOpen && (
          <div className="max-h-[46vh] overflow-hidden border-b border-stone-900/10 bg-[#FCFBF8] shadow-lg">
            <ChatSidebar />
          </div>
        )}
      </div>

      {/* Right: Excel workspace */}
      <main className="slim-scroll flex min-w-0 flex-1 flex-col overflow-y-auto pt-0 md:pt-0">
        <div className="sticky top-0 z-20 mt-[46vh] md:mt-0">
          <TopBar />
        </div>
        <div className="pb-10">
          {!report ? (
            <UploadDropzone />
          ) : (
            <>
              <Verdict />
              <KpiRow />
              <AuditTelemetry />
              <AuditClusters />
              <DataTable />
            </>
          )}
        </div>
      </main>

      <RowDrawer />
      <DetectionBreakdown />
    </div>
  );
}
