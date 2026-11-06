import React from "react";
import { ChatInbox } from "@/components/device-chat";

/* My Workspace › My IT Chats — messages from IT about my computer. Only IT can start a chat. */
export default function MyItChats() {
  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My IT Chats</h1>
        <p className="text-sm text-muted-foreground">Messages from the IT team about your computer. Reply here; when IT marks an issue resolved, confirm it or re-open it if it is not fixed.</p>
      </div>
      <ChatInbox mode="me" />
    </div>
  );
}
