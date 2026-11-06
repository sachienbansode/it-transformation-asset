import React from "react";
import { Link } from "wouter";
import { ChatInbox } from "@/components/device-chat";
import { ArrowLeft } from "lucide-react";

/* Device Health › IT chats — every IT ↔ employee conversation about a device. */
export default function AgentChats() {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/asset-agents" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Device Health</Link>
        <h1 className="text-2xl font-bold tracking-tight">IT chats</h1>
        <p className="text-sm text-muted-foreground">Conversations IT has started with employees about their computers. Start one from a device or a health item in Device Health. Messages are added to the linked ticket.</p>
      </div>
      <ChatInbox mode="it" />
    </div>
  );
}
