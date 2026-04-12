import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { Paperclip, Upload, Trash2, Download, FileText, FileSpreadsheet, File, Loader2 } from "lucide-react";

interface Attachment {
  id: number;
  ticketType: string;
  ticketId: number;
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
  uploadedByName: string | null;
  createdAt: string;
}

interface ItsmSettings {
  maxAttachmentSizeMB: number;
  maxAttachmentsPerTicket: number;
  allowedFileTypes: string[];
}

interface Props {
  ticketType: string;
  ticketId: number;
  readonly?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(contentType: string) {
  if (contentType.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
  if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType.includes("xlsx")) return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  if (contentType.includes("word") || contentType.includes("docx")) return <FileText className="h-4 w-4 text-blue-600" />;
  if (contentType.includes("image")) return <File className="h-4 w-4 text-purple-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function TicketAttachments({ ticketType, ticketId, readonly = false }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: settings } = useQuery<ItsmSettings>({
    queryKey: ["itsm-settings"],
    queryFn: () => apiFetch<ItsmSettings>("/itsm-settings"),
    staleTime: 60000,
  });

  const { data: attachments = [], isLoading } = useQuery<Attachment[]>({
    queryKey: ["itsm-attachments", ticketType, ticketId],
    queryFn: () => apiFetch<Attachment[]>(`/itsm-attachments/${encodeURIComponent(ticketType)}/${ticketId}`),
    enabled: !!ticketId,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/itsm-attachments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["itsm-attachments", ticketType, ticketId] });
      toast({ title: "Attachment removed" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const maxFiles = settings?.maxAttachmentsPerTicket ?? 5;
  const maxSizeMB = settings?.maxAttachmentSizeMB ?? 20;
  const allowedTypes = settings?.allowedFileTypes ?? ["pdf", "xlsx", "xls", "docx", "doc", "png", "jpg", "jpeg"];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedTypes.includes(ext)) {
      toast({ title: "File type not allowed", description: `Allowed: ${allowedTypes.join(", ")}`, variant: "destructive" });
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast({ title: "File too large", description: `Maximum size is ${maxSizeMB}MB`, variant: "destructive" });
      return;
    }
    if (attachments.length >= maxFiles) {
      toast({ title: "Too many attachments", description: `Maximum ${maxFiles} files per ticket`, variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const { uploadURL, objectPath } = await apiFetch<{ uploadURL: string; objectPath: string }>("/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      await apiFetch("/itsm-attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketType, ticketId, fileName: file.name, fileSize: file.size, contentType: file.type, objectPath }),
      });

      qc.invalidateQueries({ queryKey: ["itsm-attachments", ticketType, ticketId] });
      toast({ title: "File uploaded", description: file.name });
    } catch {
      toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (att: Attachment) => {
    const url = `${BASE}/api/storage${att.objectPath}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = att.fileName;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments
          {attachments.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{attachments.length}/{maxFiles}</Badge>
          )}
        </div>
        {!readonly && (
          <>
            <input ref={fileInputRef} type="file" className="hidden" accept={allowedTypes.map(t => `.${t}`).join(",")} onChange={handleUpload} />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || attachments.length >= maxFiles}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : attachments.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No attachments yet.</div>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map(att => (
            <li key={att.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs bg-muted/30">
              {getFileIcon(att.contentType)}
              <span className="flex-1 truncate font-medium" title={att.fileName}>{att.fileName}</span>
              <span className="text-muted-foreground shrink-0">{formatBytes(att.fileSize)}</span>
              <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" onClick={() => handleDownload(att)} title="Download">
                <Download className="h-3 w-3" />
              </Button>
              {!readonly && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => deleteMut.mutate(att.id)}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readonly && (
        <p className="text-[10px] text-muted-foreground">
          Allowed: {allowedTypes.join(", ")} · Max {maxSizeMB}MB per file · Up to {maxFiles} files
        </p>
      )}
    </div>
  );
}
