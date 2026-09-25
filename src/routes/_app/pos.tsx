import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Field, Input, PageHead, Sheet } from "@/components/ui";
import { useStore } from "@/components/store-context";
import { listCustomers } from "@/lib/server/parties";
import { lookupProduct } from "@/lib/server/products";
import { createSale } from "@/lib/server/sales";
import { toman, toFa } from "@/lib/format";
import { errorMessage } from "@/lib/utils";

type Search = { code?: string };
type Line = { productId: number; name: string; code: string; unitPrice: number; qty: number; stock: number };

export const Route = createFileRoute("/_app/pos")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    code: typeof s.code === "string" ? s.code : undefined,
  }),
  component: PosPage,
});

function PosPage() {
  const { settings } = useStore();
  const search = useSearch({ from: "/_app/pos" });
  const [term, setTerm] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [payOpen, setPayOpen] = useState(false);
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<"CASH" | "CARD" | "TRANSFER">("CASH");
  const [receipt, setReceipt] = useState<{ docNumber: string; total: number; change: number } | null>(null);

  const customers = useQuery({ queryKey: ["customers"], queryFn: () => listCustomers({ data: {} }) });

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0), [lines]);
  const taxable = Math.max(0, subtotal - discount);
  const tax = settings.taxEnabled ? Math.round((taxable * settings.taxRate) / 100) : 0;
  const total = taxable + tax;

  function addLine(p: { id: number; name: string; productCode: string; salePrice: number; stockQty: number }) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...prev, { productId: p.id, name: p.name, code: p.productCode, unitPrice: p.salePrice, qty: 1, stock: p.stockQty }];
    });
  }

  async function lookup(raw: string) {
    const term = raw.trim();
    if (!term) return;
    try {
      const res = await lookupProduct({ data: { term } });
      const product = res.product ?? res.matches?.[0];
      if (!product) {
        toast.error("کالا پیدا نشد");
        return;
      }
      addLine(product);
      setTerm("");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  useEffect(() => {
    if (search.code) void lookup(search.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.code]);

  const checkout = useMutation({
    mutationFn: () =>
      createSale({
        data: {
          items: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice })),
          customerId: customerId === "" ? null : Number(customerId),
          discount,
          paid: Number(paid),
          payMethod: method,
        },
      }),
    onSuccess: (res) => {
      setPayOpen(false);
      setLines([]);
      setDiscount(0);
      setReceipt(res);
      toast.success(`فاکتور ${res.docNumber} ثبت شد`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <PageHead title="صندوق فروش" sub="جستجو یا اسکن کالا، سپس تسویه" />

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(term);
        }}
      >
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="بارکد، کد کالا یا نام…"
          autoFocus
        />
        <Button type="submit">افزودن</Button>
      </form>

      <div className="space-y-2">
        {lines.map((l) => (
          <Card key={l.productId} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{l.name}</div>
              <div className="text-xs text-muted">
                {toman(l.unitPrice)} · موجود {toFa(l.stock)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="secondary" className="size-9" onClick={() => setLines((p) => p.map((x) => (x.productId === l.productId ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>
                <Minus className="size-4" />
              </Button>
              <span className="w-8 text-center tabular-nums">{toFa(l.qty)}</span>
              <Button size="icon" variant="secondary" className="size-9" onClick={() => setLines((p) => p.map((x) => (x.productId === l.productId ? { ...x, qty: x.qty + 1 } : x)))}>
                <Plus className="size-4" />
              </Button>
            </div>
            <Button size="icon" variant="ghost" className="size-9 text-danger" onClick={() => setLines((p) => p.filter((x) => x.productId !== l.productId))}>
              <Trash2 className="size-4" />
            </Button>
          </Card>
        ))}
      </div>

      <Card className="space-y-2">
        <Row label="جمع جزء" value={toman(subtotal)} />
        <Field label="تخفیف فاکتور">
          <Input type="number" min={0} value={discount || ""} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
        </Field>
        {settings.taxEnabled ? <Row label={`مالیات ${toFa(settings.taxRate)}٪`} value={toman(tax)} /> : null}
        <Row label="قابل پرداخت" value={toman(total)} strong />
        <Field label="مشتری (اختیاری)">
          <select
            className="h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">مشتری حضوری</option>
            {customers.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Button className="w-full" disabled={!lines.length} onClick={() => { setPaid(String(total)); setPayOpen(true); }}>
          تسویه {lines.length ? toman(total) : ""}
        </Button>
      </Card>

      {payOpen ? (
        <Sheet title="پرداخت" onClose={() => setPayOpen(false)}>
          <div className="space-y-3">
            <div className="text-center text-xl font-semibold tabular-nums">{toman(total)}</div>
            <div className="grid grid-cols-3 gap-2">
              {(["CASH", "CARD", "TRANSFER"] as const).map((m) => (
                <Button key={m} type="button" variant={method === m ? "primary" : "secondary"} onClick={() => setMethod(m)}>
                  {m === "CASH" ? "نقد" : m === "CARD" ? "کارت" : "حواله"}
                </Button>
              ))}
            </div>
            <Field label="مبلغ دریافتی">
              <Input type="number" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} />
            </Field>
            <div className="text-sm text-muted">باقیمانده / باقی‌پول: {toman(Math.max(0, Number(paid || 0) - total))}</div>
            <Button className="w-full" disabled={checkout.isPending || Number(paid) < total} onClick={() => checkout.mutate()}>
              {checkout.isPending ? "در حال ثبت…" : "ثبت فاکتور"}
            </Button>
          </div>
        </Sheet>
      ) : null}

      {receipt ? (
        <Sheet title="فاکتور ثبت شد" onClose={() => setReceipt(null)}>
          <div className="space-y-2 text-center">
            <div className="text-lg font-semibold">{receipt.docNumber}</div>
            <div>جمع: {toman(receipt.total)}</div>
            <div>باقی‌پول: {toman(receipt.change)}</div>
            <Button className="w-full" onClick={() => setReceipt(null)}>
              فاکتور بعد
            </Button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${strong ? "font-semibold" : "text-muted"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
