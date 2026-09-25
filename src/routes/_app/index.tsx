import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Package, ShoppingCart, Wallet } from "lucide-react";
import { Card, PageHead } from "@/components/ui";
import { useStore } from "@/components/store-context";
import { dashboardStats } from "@/lib/server/reports";
import { faDate, toman } from "@/lib/format";

export const Route = createFileRoute("/_app/")({ component: HomePage });

function HomePage() {
  const { staff } = useStore();
  const stats = useQuery({ queryKey: ["dashboard"], queryFn: () => dashboardStats() });
  const d = stats.data;

  return (
    <div className="space-y-4">
      <PageHead title={`سلام ${staff.fullName}`} sub="وضعیت امروز فروشگاه" />

      <div className="grid grid-cols-2 gap-3">
        <Stat icon={Wallet} label="فروش امروز" value={d ? toman(d.todayTotal) : "…"} hint={d ? `${d.todayCount} فاکتور` : ""} />
        <Stat icon={ShoppingCart} label="فروش ماه" value={d ? toman(d.monthTotal) : "…"} hint={d ? `${d.monthCount} فاکتور` : ""} />
        <Stat icon={AlertTriangle} label="کالای کم‌موجود" value={d ? String(d.lowStock) : "…"} warn />
        <Stat icon={Package} label="کالای فعال" value={d ? String(d.productCount) : "…"} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {staff.permissions.includes("sales.create") ? (
          <Link to="/pos" className="rounded-md bg-accent px-4 py-3 text-center text-sm font-medium text-accent-fg">
            صندوق فروش
          </Link>
        ) : null}
        {staff.permissions.includes("products.view") ? (
          <Link to="/scan" className="rounded-md border border-line bg-surface px-4 py-3 text-center text-sm font-medium">
            اسکن بارکد
          </Link>
        ) : null}
      </div>

      <Card>
        <div className="mb-2 font-semibold">آخرین فروش‌ها</div>
        {!d?.recent.length ? (
          <p className="text-sm text-muted">هنوز فاکتوری ثبت نشده. از صندوق شروع کنید.</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.recent.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">{s.docNumber}</div>
                  <div className="text-xs text-muted">{s.customerName ?? "مشتری حضوری"} · {faDate(s.createdAt)}</div>
                </div>
                <div className="tabular-nums">{toman(s.total)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  warn,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <Card className="space-y-2">
      <div className={`grid size-9 place-items-center rounded-sm ${warn ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}>
        <Icon className="size-4" strokeWidth={1.75} />
      </div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-base font-semibold tabular-nums leading-tight">{value}</div>
      {hint ? <div className="text-[11px] text-subtle">{hint}</div> : null}
    </Card>
  );
}
