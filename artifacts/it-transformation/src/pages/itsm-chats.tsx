import React from "react";
import { ChatTable } from "@/components/device-chat";

/* ITSM › IT Chats — every IT ↔ employee conversation about a computer. */
export default function ItsmChats() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">IT Chats</h1>
        <p className="text-sm text-muted-foreground">Conversations IT has started with employees about their computers (start one from a device or a health item in Device Health). Replies waiting on IT come first. Messages are encrypted at rest; the linked ticket and the audit log record each message.</p>
      </div>
      <ChatTable mode="it" />
    </div>
  );
}
