import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Field, Input, Sheet, Textarea } from "@/components/ui";
import { addCatalogItem, createProduct, listCatalog, updateProduct } from "@/lib/server/products";
import type { Product } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import { useCan } from "./store-context";

export function ProductForm({
  product,
  initialBarcodes,
  onClose,
  onSaved,
}: {
  product?: Product | null;
  initialBarcodes?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const canManage = useCan("products.manage");
  const qc = useQueryClient();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => listCatalog() });
  const [name, setName] = useState(product?.name ?? "");
  const [productCode, setProductCode] = useState(product?.productCode ?? "");
  const [purchasePrice, setPurchasePrice] = useState(String(product?.purchasePrice || ""));
  const [salePrice, setSalePrice] = useState(String(product?.salePrice || ""));
  const [minimumStock, setMinimumStock] = useState(String(product?.minimumStock || ""));
  const [openingQty, setOpeningQty] = useState("");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState<number | "">(product?.categoryId ?? "");
  const [brandId, setBrandId] = useState<number | "">(product?.brandId ?? "");
  const [unitId, setUnitId] = useState<number | "">(product?.unitId ?? 1);
  const [status, setStatus] = useState(product?.status ?? "ACTIVE");
  const [barcodes, setBarcodes] = useState(
    (product?.barcodes.map((b) => b.barcode) ?? initialBarcodes ?? []).join("\n"),
  );
  const parsedBarcodes = useMemo(
    () =>
      barcodes
        .split(/[\n,،]+/)
        .map((b) => b.trim())
        .filter(Boolean),
    [barcodes],
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        productCode: productCode || undefined,
        purchasePrice: purchasePrice ? Number(purchasePrice) : 0,
        salePrice: salePrice ? Number(salePrice) : 0,
        minimumStock: minimumStock ? Number(minimumStock) : 0,
        description: description || undefined,
        categoryId: categoryId === "" ? undefined : Number(categoryId),
        brandId: brandId === "" ? undefined : Number(brandId),
        unitId: unitId === "" ? undefined : Number(unitId),
        barcodes: parsedBarcodes,
      };
      if (product) {
        return updateProduct({ data: { ...payload, id: product.id, status: status as "ACTIVE" | "INACTIVE" } });
      }
      return createProduct({
        data: { ...payload, openingQty: openingQty ? Number(openingQty) : undefined },
      });
    },
    onSuccess: () => {
      toast.success(product ? "کالا به‌روز شد" : "کالا ثبت شد");
      void qc.invalidateQueries({ queryKey: ["products"] });
      onSaved();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function addKind(kind: "category" | "brand" | "unit") {
    const label = kind === "category" ? "دسته" : kind === "brand" ? "برند" : "واحد";
    const value = window.prompt(`${label} جدید:`);
    if (!value?.trim()) return;
    try {
      const item = await addCatalogItem({ data: { kind, name: value.trim() } });
      await catalog.refetch();
      if (kind === "category") setCategoryId(item.id);
      if (kind === "brand") setBrandId(item.id);
      if (kind === "unit") setUnitId(item.id);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Sheet title={product ? "ویرایش کالا" : "ثبت کالای جدید"} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canManage) return;
          save.mutate();
        }}
      >
        <Field label="نام کالا *">
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="مثلاً نوشابه خانواده" />
        </Field>
        <Field label="کد کالا (خالی = خودکار)">
          <Input
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
            dir="ltr"
            disabled={Boolean(product)}
            placeholder="1001"
          />
        </Field>
        <Field label="بارکدها — هر خط یک بارکد">
          <Textarea rows={2} value={barcodes} onChange={(e) => setBarcodes(e.target.value)} dir="ltr" placeholder="6260123450001" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="قیمت خرید">
            <Input inputMode="numeric" type="number" min={0} value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
          </Field>
          <Field label="قیمت فروش">
            <Input inputMode="numeric" type="number" min={0} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="حداقل موجودی">
            <Input inputMode="numeric" type="number" min={0} value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} />
          </Field>
          {!product ? (
            <Field label="موجودی اولیه">
              <Input inputMode="numeric" type="number" min={0} value={openingQty} onChange={(e) => setOpeningQty(e.target.value)} />
            </Field>
          ) : (
            <Field label="وضعیت">
              <select
                className="h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="ACTIVE">فعال</option>
                <option value="INACTIVE">غیرفعال</option>
              </select>
            </Field>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="دسته">
            <select
              className="h-11 w-full rounded-sm border border-line bg-surface px-2 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">—</option>
              {catalog.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="برند">
            <select
              className="h-11 w-full rounded-sm border border-line bg-surface px-2 text-sm"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">—</option>
              {catalog.data?.brands.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="واحد">
            <select
              className="h-11 w-full rounded-sm border border-line bg-surface px-2 text-sm"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : "")}
            >
              {catalog.data?.units.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" className="text-accent" onClick={() => void addKind("category")}>
              + دسته
            </button>
            <button type="button" className="text-accent" onClick={() => void addKind("brand")}>
              + برند
            </button>
            <button type="button" className="text-accent" onClick={() => void addKind("unit")}>
              + واحد
            </button>
          </div>
        ) : null}
        <Field label="توضیح">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {canManage ? (
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              انصراف
            </Button>
            <Button type="submit" className="flex-1" disabled={save.isPending || !name}>
              {save.isPending ? "در حال ثبت…" : product ? "ذخیره" : "ثبت کالا"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">فقط مشاهده — دسترسی ویرایش ندارید.</p>
        )}
      </form>
    </Sheet>
  );
}
