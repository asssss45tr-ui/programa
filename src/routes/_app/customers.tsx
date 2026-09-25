import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Empty, Field, Input, PageHead, Sheet, Textarea } from "@/components/ui";
import { useCan } from "@/components/store-context";
import { listCustomers, saveCustomer } from "@/lib/server/parties";
import type { Party } from "@/lib/types";
import { toman } from "@/lib/format";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_app/customers")({ component: CustomersPage });

function CustomersPage() {
  const can = useCan("customers.manage");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<Party> | "new" | null>(null);
  const list = useQuery({ queryKey: ["customers", q], queryFn: () => listCustomers({ data: { q: q || undefined } }) });
  return (
    <PartyPage
      title="مشتریان"
      items={list.data ?? []}
      loading={list.isLoading}
      canManage={can}
      query={q}
      onQuery={setQ}
      edit={edit}
      setEdit={setEdit}
      onSaved={() => void list.refetch()}
      saveFn={(data) => saveCustomer({ data })}
    />
  );
}

export function PartyPage({
  title,
  items,
  loading,
  canManage,
  query,
  onQuery,
  edit,
  setEdit,
  onSaved,
  saveFn,
}: {
  title: string;
  items: Party[];
  loading: boolean;
  canManage: boolean;
  query: string;
  onQuery: (v: string) => void;
  edit: Partial<Party> | "new" | null;
  setEdit: (v: Partial<Party> | "new" | null) => void;
  onSaved: () => void;
  saveFn: (data: { id?: number; name: string; phone?: string; address?: string; note?: string }) => Promise<unknown>;
}) {
  const current = edit && edit !== "new" ? edit : null;
  const [name, setName] = useState(current?.name ?? "");
  const [phone, setPhone] = useState(current?.phone ?? "");
  const [address, setAddress] = useState(current?.address ?? "");
  const [note, setNote] = useState(current?.note ?? "");

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        id: current?.id,
        name,
        phone: phone || undefined,
        address: address || undefined,
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success("ذخیره شد");
      setEdit(null);
      onSaved();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <PageHead
        title={title}
        action={
          canManage ? (
            <Button
              size="sm"
              onClick={() => {
                setName("");
                setPhone("");
                setAddress("");
                setNote("");
                setEdit("new");
              }}
            >
              جدید
            </Button>
          ) : null
        }
      />
      <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="جستجو…" />
      {loading ? <p className="text-sm text-muted">در حال بارگذاری…</p> : null}
      <div className="space-y-2">
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            className="flex w-full items-center justify-between rounded-md border border-line bg-surface p-3.5 text-right"
            onClick={() => {
              setName(p.name);
              setPhone(p.phone ?? "");
              setAddress(p.address ?? "");
              setNote(p.note ?? "");
              setEdit(p);
            }}
          >
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted">{p.phone ?? "بدون تلفن"}</div>
            </div>
            {p.balance ? <span className="text-xs text-warn">مانده {toman(p.balance)}</span> : null}
          </button>
        ))}
        {!loading && !items.length ? <Empty title="موردی نیست" /> : null}
      </div>
      {edit ? (
        <Sheet title={current ? current.name ?? "ویرایش" : "ثبت جدید"} onClose={() => setEdit(null)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="نام">
              <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="تلفن">
              <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="آدرس">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field label="یادداشت">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {canManage ? (
              <Button className="w-full" type="submit" disabled={save.isPending}>
                ذخیره
              </Button>
            ) : null}
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}
