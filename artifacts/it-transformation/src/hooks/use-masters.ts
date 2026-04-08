import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface Master {
  id: number;
  category: string;
  key: string;
  label: string;
  color?: string;
  sortOrder: number;
  isActive: boolean;
}

export function useMasters(category: string) {
  return useQuery<Master[]>({
    queryKey: ["masters", category],
    queryFn: () => apiFetch<Master[]>(`/masters?category=${category}`),
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

export function useAllMasters() {
  return useQuery<Master[]>({
    queryKey: ["masters", "all"],
    queryFn: () => apiFetch<Master[]>("/masters"),
    staleTime: 5 * 60 * 1000,
  });
}

export function getBadgeClass(color?: string | null): string {
  const map: Record<string, string> = {
    red: "bg-red-500/20 text-red-400 border-red-500/30",
    orange: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    green: "bg-green-500/20 text-green-400 border-green-500/30",
    blue: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    purple: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    teal: "bg-teal-500/20 text-teal-400 border-teal-500/30",
    gray: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    indigo: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    pink: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  };
  return map[color || ""] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
}
