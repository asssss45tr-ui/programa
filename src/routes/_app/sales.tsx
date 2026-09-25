import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Empty, Input, PageHead, Sheet } from "@/components/ui";
import { useCan } from "@/components/store-context";
import { cancelSale, getSale, listSales } from "@/lib/server/sales";
import { faDate, statusFa, toman } from "@/lib/format";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_app/sales")({ component: SalesPage });

function SalesPage() {
  const [q, setQ] = useState("");
  const [id, setId] = useState<number | null>(null);
  const canCancel = useCan("sales.cancel");
  const list = useQuery({ queryKey: ["sales", q], queryFn: () => listSales({ data: { q: q || undefined } }) });
  const detail = useQuery({
    queryKey: ["sale", id],
    queryFn: () => getSale({ data: { id: id! } }),
    enabled: id != null,
  });
  const cancel = useMutation({
    mutationFn: () => cancelSale({ data: { id: id! } }),
    onSuccess: () => {
      toast.success("فاکتور لغو شد و موجودی برگشت");
      setId(null);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <PageHead title="فاکتورهای فروش" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="شماره فاکتور یا مشتری" />
      <div className="space-y-2">
        {list.data?.map((s) => (
          <button
            key={s.id}
            type="button"
            className="flex w-full items-center justify-between rounded-md border border-line bg-surface p-3.5 text-right"
            onClick={() => setId(s.id)}
          >
            <div>
              <div className="font-medium">{s.docNumber}</div>
              <div className="text-xs text-muted">
                {s.customerName ?? "حضوری"} · {faDate(s.createdAt)}
              </div>
            </div>
            <div className="text-left">
              <div className="tabular-nums text-sm font-semibold">{toman(s.total)}</div>
              <Badge tone={s.status === "COMPLETED" ? "ok" : "off"}>{statusFa(s.status)}</Badge>
            </div>
          </button>
        ))}
        {list.data && !list.data.length ? <Empty title="فاکتوری نیست" hint="از صندوق فروش ثبت کنید." /> : null}
      </div>

      {detail.data ? (
        <Sheet title={detail.data.docNumber} onClose={() => setId(null)}>
          <div className="space-y-2 text-sm">
            <div>{detail.data.customerName ?? "مشتری حضوری"}</div>
            <div className="text-muted">{faDate(detail.data.createdAt)} · {detail.data.cashier}</div>
            <ul className="divide-y divide-line">
              {detail.data.items.map((it) => (
                <li key={it.id} className="flex justify-between py-2">
                  <span>
                    {it.name} × {it.qty}
                  </span>
                  <span className="tabular-nums">{toman(it.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between font-semibold">
              <span>جمع</span>
              <span>{toman(detail.data.total)}</span>
            </div>
            {canCancel && detail.data.status === "COMPLETED" ? (
              <Button variant="danger" className="w-full" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                لغو فاکتور و برگشت موجودی
              </Button>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
