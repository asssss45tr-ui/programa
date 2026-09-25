import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Empty, Field, Input, PageHead, Sheet } from "@/components/ui";
import { useCan } from "@/components/store-context";
import { cancelPurchase, createPurchase, listPurchases } from "@/lib/server/inventory";
import { listSuppliers } from "@/lib/server/parties";
import { lookupProduct } from "@/lib/server/products";
import { faDate, statusFa, toman, toFa } from "@/lib/format";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_app/purchases")({ component: PurchasesPage });

type Line = { productId: number; name: string; qty: number; unitCost: number };

function PurchasesPage() {
  const canCreate = useCan("purchases.create");
  const canCancel = useCan("purchases.cancel");
  const list = useQuery({ queryKey: ["purchases"], queryFn: () => listPurchases() });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers() });
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const total = useMemo(() => lines.reduce((s, l) => s + l.qty * l.unitCost, 0), [lines]);

  const save = useMutation({
    mutationFn: () =>
      createPurchase({
        data: {
          supplierId: supplierId === "" ? null : Number(supplierId),
          items: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitCost: l.unitCost })),
          paid: total,
        },
      }),
    onSuccess: (res) => {
      toast.success(`خرید ${res.docNumber} ثبت شد`);
      setOpen(false);
      setLines([]);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: (id: number) => cancelPurchase({ data: { id } }),
    onSuccess: () => {
      toast.success("فاکتور خرید لغو شد");
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function add() {
    try {
      const res = await lookupProduct({ data: { term } });
      const p = res.product ?? res.matches?.[0];
      if (!p) {
        toast.error("کالا پیدا نشد");
        return;
      }
      setLines((prev) => [...prev, { productId: p.id, name: p.name, qty: 1, unitCost: p.purchasePrice }]);
      setTerm("");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <PageHead
        title="خرید"
        action={
          canCreate ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              رسید جدید
            </Button>
          ) : null
        }
      />
      <div className="space-y-2">
        {list.data?.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-md border border-line bg-surface p-3.5">
            <div>
              <div className="font-medium">{p.docNumber}</div>
              <div className="text-xs text-muted">
                {p.supplierName ?? "بدون تأمین‌کننده"} · {faDate(p.createdAt)}
              </div>
            </div>
            <div className="text-left">
              <div className="tabular-nums text-sm">{toman(p.total)}</div>
              <Badge tone={p.status === "COMPLETED" ? "ok" : "off"}>{statusFa(p.status)}</Badge>
              {canCancel && p.status === "COMPLETED" ? (
                <button type="button" className="mt-1 block text-xs text-danger" onClick={() => cancel.mutate(p.id)}>
                  لغو
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {list.data && !list.data.length ? <Empty title="رسید خریدی نیست" /> : null}
      </div>

      {open ? (
        <Sheet title="رسید خرید" onClose={() => setOpen(false)}>
          <Field label="تأمین‌کننده">
            <select
              className="h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">—</option>
              {suppliers.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="کالا…" />
            <Button type="submit">افزودن</Button>
          </form>
          <ul className="mt-3 space-y-2">
            {lines.map((l, i) => (
              <li key={`${l.productId}-${i}`} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{l.name}</span>
                <Input
                  className="h-9 w-16"
                  type="number"
                  value={l.qty}
                  onChange={(e) =>
                    setLines((p) => p.map((x, idx) => (idx === i ? { ...x, qty: Number(e.target.value) } : x)))
                  }
                />
                <Input
                  className="h-9 w-24"
                  type="number"
                  value={l.unitCost}
                  onChange={(e) =>
                    setLines((p) => p.map((x, idx) => (idx === i ? { ...x, unitCost: Number(e.target.value) } : x)))
                  }
                />
              </li>
            ))}
          </ul>
          <div className="mt-3 font-semibold">جمع: {toman(total)}</div>
          <Button className="mt-3 w-full" disabled={!lines.length || save.isPending} onClick={() => save.mutate()}>
            ثبت رسید · موجودی افزایش می‌یابد
          </Button>
        </Sheet>
      ) : null}
    </div>
  );
}
