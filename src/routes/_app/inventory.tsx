import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Empty, Field, Input, PageHead, Sheet } from "@/components/ui";
import { useCan, useStore } from "@/components/store-context";
import { adjustStock, listStock, transferStock } from "@/lib/server/inventory";
import { listCatalog } from "@/lib/server/products";
import type { StockRow } from "@/lib/types";
import { toFa } from "@/lib/format";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_app/inventory")({ component: InventoryPage });

function InventoryPage() {
  const { settings } = useStore();
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [row, setRow] = useState<StockRow | null>(null);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [toWh, setToWh] = useState<number | "">("");
  const canAdjust = useCan("inventory.adjust");
  const canTransfer = useCan("inventory.transfer");
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => listCatalog() });
  const list = useQuery({
    queryKey: ["stock", q, lowOnly],
    queryFn: () => listStock({ data: { q: q || undefined, lowOnly } }),
  });

  const adjust = useMutation({
    mutationFn: () =>
      adjustStock({
        data: { productId: row!.productId, delta: Number(delta), note },
      }),
    onSuccess: () => {
      toast.success("موجودی اصلاح شد");
      setRow(null);
      setDelta("");
      setNote("");
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const transfer = useMutation({
    mutationFn: () =>
      transferStock({
        data: {
          productId: row!.productId,
          fromWarehouseId: row!.warehouseId,
          toWarehouseId: Number(toWh),
          qty: Math.abs(Number(delta)),
          note,
        },
      }),
    onSuccess: () => {
      toast.success("انتقال انجام شد");
      setRow(null);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <PageHead title="انبار" sub={`انبار پیش‌فرض: شناسه ${settings.defaultWarehouseId}`} />
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی کالا…" />
        <Button variant={lowOnly ? "primary" : "secondary"} onClick={() => setLowOnly((v) => !v)}>
          کم‌موجود
        </Button>
      </div>
      <div className="space-y-2">
        {list.data?.map((s) => {
          const low = s.qty <= s.minimumStock;
          return (
            <button
              key={`${s.warehouseId}-${s.productId}`}
              type="button"
              className="flex w-full items-center justify-between rounded-md border border-line bg-surface p-3.5 text-right"
              onClick={() => setRow(s)}
            >
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted">
                  {s.productCode} · حداقل {toFa(s.minimumStock)}
                </div>
              </div>
              <Badge tone={low ? "warn" : "ok"}>{toFa(s.qty)}</Badge>
            </button>
          );
        })}
        {list.data && !list.data.length ? <Empty title="موردی نیست" /> : null}
      </div>

      {row ? (
        <Sheet title={row.name} onClose={() => setRow(null)}>
          <p className="mb-3 text-sm text-muted">موجودی فعلی: {toFa(row.qty)}</p>
          <Field label="مقدار (+ افزایش / − کاهش) یا مقدار انتقال">
            <Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
          </Field>
          <Field label="توضیح">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً شمارش انبار" />
          </Field>
          {canAdjust ? (
            <Button className="mt-3 w-full" disabled={!delta || !note || adjust.isPending} onClick={() => adjust.mutate()}>
              اصلاح موجودی
            </Button>
          ) : null}
          {canTransfer ? (
            <div className="mt-4 space-y-2">
              <Field label="انتقال به انبار">
                <select
                  className="h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm"
                  value={toWh}
                  onChange={(e) => setToWh(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">انتخاب انبار</option>
                  {catalog.data?.warehouses
                    .filter((w) => w.id !== row.warehouseId)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Button
                variant="secondary"
                className="w-full"
                disabled={!toWh || !delta || transfer.isPending}
                onClick={() => transfer.mutate()}
              >
                انتقال
              </Button>
            </div>
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}
