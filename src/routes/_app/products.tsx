import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Empty, Input, PageHead } from "@/components/ui";
import { ProductForm } from "@/components/product-form";
import { useCan } from "@/components/store-context";
import { listProducts } from "@/lib/server/products";
import type { Product } from "@/lib/types";
import { toman, toFa } from "@/lib/format";
import { errorMessage } from "@/lib/utils";

type Search = { q?: string };

export const Route = createFileRoute("/_app/products")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const search = useSearch({ from: "/_app/products" });
  const [query, setQuery] = useState(search.q ?? "");
  const [applied, setApplied] = useState(search.q ?? "");
  const [editing, setEditing] = useState<Product | null | "new">(null);
  const canManage = useCan("products.manage");
  const list = useQuery({
    queryKey: ["products", applied],
    queryFn: () => listProducts({ data: { q: applied || undefined } }),
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setApplied(query);
  }

  return (
    <div className="space-y-4">
      <PageHead
        title="کالاها"
        sub={list.data ? `${toFa(list.data.total)} کالا` : "فهرست کالا و بارکد"}
        action={
          canManage ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> کالای جدید
            </Button>
          ) : null
        }
      />

      <form className="flex gap-2" onSubmit={onSearch}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجو با نام، کد یا بارکد…"
        />
        <Button type="submit" size="icon" variant="secondary" aria-label="جستجو">
          <Search className="size-4" />
        </Button>
      </form>

      {list.isError ? (
        <p className="text-sm text-danger">{errorMessage(list.error)}</p>
      ) : null}
      {list.isLoading ? <p className="text-sm text-muted">در حال بارگذاری…</p> : null}

      <div className="space-y-2">
        {list.data?.items.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setEditing(p)}
            className="flex w-full flex-col gap-1 rounded-md border border-line bg-surface p-3.5 text-right shadow-card"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-sm bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-dark" dir="ltr">
                {p.productCode}
              </span>
              <span className="flex-1 font-medium">{p.name}</span>
              <Badge tone={p.status === "ACTIVE" ? "ok" : "off"}>
                {p.status === "ACTIVE" ? "فعال" : "غیرفعال"}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>فروش: {toman(p.salePrice)}</span>
              <span>موجودی: {toFa(p.stockQty)}</span>
            </div>
            {p.barcodes.length ? (
              <div className="flex flex-wrap gap-1 pt-1">
                {p.barcodes.map((b) => (
                  <span key={b.id} className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px]" dir="ltr">
                    {b.barcode}
                  </span>
                ))}
              </div>
            ) : null}
          </button>
        ))}
        {list.data && list.data.items.length === 0 ? (
          <Empty title="کالایی یافت نشد" hint="اولین کالا را ثبت کنید." />
        ) : null}
      </div>

      {editing === "new" ? (
        <ProductForm onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.refetch(); }} />
      ) : editing ? (
        <ProductForm
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void list.refetch();
          }}
        />
      ) : null}
    </div>
  );
}
