import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChatTable, NewChatDialog } from "@/components/device-chat";
import { Plus, Lock } from "lucide-react";

/* Chats — my conversations; IT support (IT staff); all chats (Super Admin, read-only and audited). */
export default function Chats() {
  const qc = useQueryClient();
  const [box, setBox] = useState<"mine" | "support" | "all">(() => { const b = new URLSearchParams(window.location.search).get("box"); return b === "support" || b === "all" ? b : "mine"; });
  const [me, setMe] = useState<{ staff: boolean; superAdmin: boolean }>({ staff: false, superAdmin: false });
  const [neu, setNeu] = useState(false); const [k, setK] = useState(0);
  const tabs: [typeof box, string, boolean][] = [["mine", "My chats", true], ["support", "IT support", me.staff], ["all", "All chats (Super Admin)", me.superAdmin]];
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chats</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1"><Lock className="w-3.5 h-3.5" />Direct chats are private to the two people in them. IT support chats are shared between the employee and the IT team. Messages and files are encrypted and kept for audit.</p>
        </div>
        <Button className="gap-2" onClick={() => setNeu(true)}><Plus className="w-4 h-4" />New chat</Button>
      </div>
      <div className="inline-flex bg-muted rounded-[10px] p-[3px] gap-[3px]">
        {tabs.filter(t => t[2]).map(([key, label]) => <button key={key} onClick={() => setBox(key)} className={cn("px-3 py-1.5 rounded-[8px] text-[12.5px]", box === key ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{label}</button>)}
      </div>
      {box === "all" && <div className="text-xs text-amber-700">Super Admin view: you can read every chat (read-only). Each chat you open is recorded in the audit log.</div>}
      <ChatTable key={`${box}-${k}`} box={box} onMe={m => setMe(m)} />
      {neu && <NewChatDialog staff={me.staff} onClose={() => setNeu(false)} onStarted={id => { setNeu(false); qc.invalidateQueries({ queryKey: ["chats"] }); window.history.replaceState(null, "", `/chats?c=${id}`); setK(x => x + 1); }} />}
    </div>
  );
}
