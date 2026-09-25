import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserButton } from "@/lib/auth/gates";
import { Button, Card, Field, Input, PageHead } from "@/components/ui";
import { useStore } from "@/components/store-context";
import { listCatalog } from "@/lib/server/products";
import { listAudit, saveSettings } from "@/lib/server/reports";
import { faDate } from "@/lib/format";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { settings, staff, refresh } = useStore();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => listCatalog() });
  const audit = useQuery({
    queryKey: ["audit"],
    queryFn: () => listAudit(),
    enabled: staff.permissions.includes("audit.view"),
  });
  const [storeName, setStoreName] = useState(settings.storeName);
  const [taxEnabled, setTaxEnabled] = useState(settings.taxEnabled);
  const [taxRate, setTaxRate] = useState(String(settings.taxRate));
  const [autoProductCode, setAutoProductCode] = useState(settings.autoProductCode);
  const [defaultWarehouseId, setDefaultWarehouseId] = useState(settings.defaultWarehouseId);
  const [allowNegativeStock, setAllowNegativeStock] = useState(settings.allowNegativeStock);

  useEffect(() => {
    setStoreName(settings.storeName);
    setTaxEnabled(settings.taxEnabled);
    setTaxRate(String(settings.taxRate));
    setAutoProductCode(settings.autoProductCode);
    setDefaultWarehouseId(settings.defaultWarehouseId);
    setAllowNegativeStock(settings.allowNegativeStock);
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          storeName,
          taxEnabled,
          taxRate: Number(taxRate) || 0,
          autoProductCode,
          defaultWarehouseId,
          allowNegativeStock,
        },
      }),
    onSuccess: () => {
      toast.success("تنظیمات ذخیره شد");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <PageHead title="تنظیمات" />
      <Card className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">حساب کاربری</div>
          <div className="text-xs text-muted">{staff.fullName}</div>
        </div>
        <UserButton />
      </Card>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="نام فروشگاه">
          <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
        </Field>
        <Field label="انبار پیش‌فرض">
          <select
            className="h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm"
            value={defaultWarehouseId}
            onChange={(e) => setDefaultWarehouseId(Number(e.target.value))}
          >
            {catalog.data?.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-3 text-sm">
          تولید خودکار کد کالا
          <input type="checkbox" checked={autoProductCode} onChange={(e) => setAutoProductCode(e.target.checked)} />
        </label>
        <label className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-3 text-sm">
          مالیات بر ارزش افزوده
          <input type="checkbox" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} />
        </label>
        {taxEnabled ? (
          <Field label="نرخ مالیات ٪">
            <Input type="number" min={0} max={100} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
          </Field>
        ) : null}
        <label className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-3 text-sm">
          اجازه موجودی منفی
          <input type="checkbox" checked={allowNegativeStock} onChange={(e) => setAllowNegativeStock(e.target.checked)} />
        </label>
        <Button className="w-full" type="submit" disabled={save.isPending}>
          ذخیره تنظیمات
        </Button>
      </form>

      {audit.data ? (
        <Card>
          <div className="mb-2 font-semibold">آخرین عملیات</div>
          <ul className="space-y-1.5 text-xs text-muted">
            {audit.data.map((a) => (
              <li key={a.id}>
                {a.actor ?? "سیستم"} · {a.action} · {faDate(a.at)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
