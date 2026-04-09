import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { User, Camera, Loader2, Upload } from "lucide-react";

interface ProfileData {
  id: number;
  name: string;
  email: string;
  department: string | null;
  designation: string | null;
  employeeCode: string | null;
  mobile: string | null;
  role: string;
  userType: string;
  status: string;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  photoUrl: string | null;
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</span>
      <span className="text-sm font-medium text-foreground">{value || <span className="text-muted-foreground italic">—</span>}</span>
    </div>
  );
}

export default function Profile() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: deptMasters = [] } = useQuery({
    queryKey: ["masters-department"],
    queryFn: () => apiFetch<{key:string;label:string}[]>("/masters?category=department"),
  });
  const getDeptLabel = (key: string | null | undefined) => key ? (deptMasters.find(d => d.key === key)?.label || key) : null;

  useEffect(() => {
    apiFetch<ProfileData>("/auth/profile").then(p => {
      setProfile(p);
      if (p.photoUrl) setPreviewUrl(`/api/storage${p.photoUrl}`);
    }).catch(() => {});
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 5 MB allowed.", variant: "destructive" });
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setUploading(true);

    try {
      const { uploadURL, objectPath } = await apiFetch<{ uploadURL: string; objectPath: string }>(
        "/storage/uploads/request-url",
        {
          method: "POST",
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        }
      );

      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      await apiFetch("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ photoUrl: objectPath }),
      });

      await refresh();
      setProfile(p => p ? { ...p, photoUrl: objectPath } : p);
      setPreviewUrl(`/api/storage${objectPath}`);
      toast({ title: "Photo updated successfully" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setPreviewUrl(profile?.photoUrl ? `/api/storage${profile.photoUrl}` : null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const statusColor: Record<string, string> = {
    active: "bg-green-500/15 text-green-600 border-green-500/30",
    inactive: "bg-red-500/15 text-red-600 border-red-500/30",
    dormant: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">My Profile</h1>
          <p className="text-sm text-muted-foreground">Your account information (managed by administrator)</p>
        </div>
      </div>

      {/* Photo + Identity */}
      <Card>
        <CardHeader><CardTitle className="text-base">Identity</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="h-24 w-24 rounded-full border-2 border-border overflow-hidden bg-muted flex items-center justify-center">
                {previewUrl ? (
                  <img src={previewUrl} alt="Profile" className="h-full w-full object-cover" onError={() => setPreviewUrl(null)} />
                ) : (
                  <User className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                title="Change photo"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Name + Role badges */}
            <div className="flex-1 space-y-1.5">
              <p className="text-lg font-semibold">{profile?.name || user?.name}</p>
              <p className="text-sm text-muted-foreground">{profile?.email || user?.email}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant="outline" className="capitalize text-xs">{profile?.role || user?.role}</Badge>
                <Badge variant="outline" className="capitalize text-xs">{profile?.userType || user?.userType}</Badge>
                {profile?.status && (
                  <Badge variant="outline" className={`text-xs capitalize ${statusColor[profile.status] || ""}`}>
                    {profile.status}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            Click the camera icon to upload a photo (JPG, PNG, WebP — max 5 MB)
          </p>
        </CardContent>
      </Card>

      {/* User Master Details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Employment Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <FieldRow label="Employee Code" value={profile?.employeeCode} />
            <FieldRow label="Department" value={getDeptLabel(profile?.department)} />
            <FieldRow label="Designation" value={profile?.designation} />
            <FieldRow label="Mobile" value={profile?.mobile} />
            <FieldRow label="User Type" value={profile?.userType ? profile.userType.charAt(0).toUpperCase() + profile.userType.slice(1) : null} />
            <FieldRow label="Account Role" value={profile?.role} />
          </div>
          <p className="text-xs text-muted-foreground mt-5 border-t border-border pt-3">
            These details are managed by your administrator. Contact your admin to update any information.
          </p>
        </CardContent>
      </Card>

      {/* Account Activity */}
      <Card>
        <CardHeader><CardTitle className="text-base">Account Activity</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <FieldRow
              label="Last Login"
              value={profile?.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never"}
            />
            <FieldRow
              label="Account Created"
              value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" }) : null}
            />
            <FieldRow label="MFA Status" value={profile?.mfaEnabled ? "Enabled" : "Disabled"} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
