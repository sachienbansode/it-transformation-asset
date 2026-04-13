import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useItsmConfig } from "@/hooks/use-itsm-config";

interface UserComboboxProps {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
}

export function UserSearchCombobox({ value, onChange, placeholder = "Search user…", className }: UserComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["users-for-combobox"],
    queryFn: () => apiFetch<any[]>("/users"),
    staleTime: 120000,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = q
      ? users.filter((u: any) =>
          u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
        )
      : users;
    return list.slice(0, 40);
  }, [users, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal h-9 text-sm",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search name or email…"
            value={search}
            onValueChange={setSearch}
            className="h-8"
          />
          <CommandList>
            <CommandEmpty>No user found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                <span className="text-muted-foreground italic">— Unassigned —</span>
              </CommandItem>
              {filtered.map((u: any) => (
                <CommandItem
                  key={u.id}
                  value={u.name}
                  onSelect={(v) => {
                    onChange(v);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === u.name ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{u.name}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground truncate max-w-[100px]">
                    {u.email}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface GroupSelectProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function GroupSelect({ value, onChange, placeholder = "Select group" }: GroupSelectProps) {
  const cfg = useItsmConfig();
  const groups = cfg["itsm.itGroups"];

  return (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— No group —</SelectItem>
        {groups.map((g) => (
          <SelectItem key={g} value={g}>
            {g}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
