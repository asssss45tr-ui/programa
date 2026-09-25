import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useCan } from "@/components/store-context";
import { listSuppliers, saveSupplier } from "@/lib/server/parties";
import type { Party } from "@/lib/types";
import { PartyPage } from "./customers";

export const Route = createFileRoute("/_app/suppliers")({ component: SuppliersPage });

function SuppliersPage() {
  const can = useCan("suppliers.manage");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<Party> | "new" | null>(null);
  const list = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers() });
  const items = (list.data ?? []).filter((s) => !q || s.name.includes(q) || (s.phone ?? "").includes(q));
  return (
    <PartyPage
      title="تأمین‌کنندگان"
      items={items}
      loading={list.isLoading}
      canManage={can}
      query={q}
      onQuery={setQ}
      edit={edit}
      setEdit={setEdit}
      onSaved={() => void list.refetch()}
      saveFn={(data) => saveSupplier({ data })}
    />
  );
}
