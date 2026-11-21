import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
/** ITH-128 — this client's names from Admin › Settings › Branding (never a built-in company name). */
export type Brand = { appName: string; appTagline: string; logoUrl: string; companyName?: string; emailDomain?: string };
export function useBrand() {
  const { data } = useQuery({ queryKey: ["config"], queryFn: () => apiFetch<Brand>("/config"), staleTime: 300_000 });
  const company = data?.companyName || "";
  return { appName: data?.appName || "IT Hub", company, companyOrApp: company || data?.appName || "IT Hub", logoUrl: data?.logoUrl || "", emailDomain: data?.emailDomain || "" };
}
