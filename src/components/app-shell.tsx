import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardList,
  House,
  LayoutGrid,
  Package,
  ScanLine,
  ShoppingCart,
  Store,
  Users,
  Warehouse,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUser, useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyStaff } from "@/lib/server/products";
import type { StaffProfile, StoreSettings } from "@/lib/types";
import { StoreProvider } from "./store-context";

const NAV = [
  { to: "/", label: "خانه", icon: House, perm: null as string | null, end: true },
  { to: "/scan", label: "اسکن", icon: ScanLine, perm: "products.view", end: false },
  { to: "/pos", label: "صندوق", icon: ShoppingCart, perm: "sales.create", end: false },
  { to: "/products", label: "کالاها", icon: Package, perm: "products.view", end: false },
  { to: "/more", label: "بیشتر", icon: LayoutGrid, perm: null, end: false },
];

export function AppShell() {
  const { user, isPending } = useCurrentUserState();
  const authUser = useCurrentUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const load = () => {
    if (!authUser) return;
    void getMyStaff({
      data: { displayName: authUser.displayName, email: authUser.primaryEmail },
    })
      .then((res) => {
        setStaff(res.staff);
        setSettings(res.settings);
      })
      .catch((err: unknown) => {
        setBootError(err instanceof Error ? err.message : "خطای راه‌اندازی");
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  const value = useMemo(
    () => (staff && settings ? { staff, settings, refresh: load } : null),
    [staff, settings],
  );

  if (isPending) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <div className="h-24 w-56 animate-pulse rounded-lg bg-line/70" />
        <p className="text-sm text-muted">در حال بارگذاری فروشگاه…</p>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  if (bootError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-medium">راه‌اندازی فروشگاه ناموفق بود</p>
        <p className="text-sm text-muted">{bootError}</p>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <div className="h-24 w-56 animate-pulse rounded-lg bg-line/70" />
        <p className="text-sm text-muted">در حال آماده‌سازی حساب…</p>
      </div>
    );
  }

  if (!value.staff.isActive) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-medium">حساب شما غیرفعال است</p>
        <p className="text-sm text-muted">با مدیر فروشگاه تماس بگیرید.</p>
      </div>
    );
  }

  const items = NAV.filter((i) => !i.perm || value.staff.permissions.includes(i.perm));

  return (
    <StoreProvider value={value}>
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-accent px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] text-accent-fg">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-accent-fg/15">
              <Store className="size-5" strokeWidth={1.75} />
            </span>
            <div>
              <div className="text-[15px] font-semibold leading-tight">{value.settings.storeName}</div>
              <div className="text-[11px] text-accent-fg/80">
                {value.staff.fullName} — {value.staff.roleNameFa}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4">
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-3xl border-t border-line bg-surface px-1 pt-1.5 pb-[calc(0.4rem+env(safe-area-inset-bottom))]">
          <div className="flex justify-around">
            {items.map((item) => {
              const Icon = item.icon;
              const active = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex min-w-14 flex-col items-center gap-0.5 rounded-sm px-3 py-1.5 text-[11px] transition-colors duration-150 ${
                    active ? "bg-accent-soft text-accent-dark" : "text-muted"
                  }`}
                >
                  <Icon className="size-5" strokeWidth={1.75} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </StoreProvider>
  );
}

export const MORE_LINKS = [
  { to: "/inventory", label: "انبار", desc: "موجودی، اصلاح و هشدار حداقل", icon: Warehouse, perm: "inventory.view" },
  { to: "/sales", label: "فاکتورهای فروش", desc: "تاریخچه صندوق و لغو فاکتور", icon: ClipboardList, perm: "sales.view" },
  { to: "/purchases", label: "خرید", desc: "رسید کالا از تأمین‌کننده", icon: Package, perm: "purchases.view" },
  { to: "/customers", label: "مشتریان", desc: "دفتر مشتریان و مانده حساب", icon: Users, perm: "customers.view" },
  { to: "/suppliers", label: "تأمین‌کنندگان", desc: "شرکت‌های پخش و خرید", icon: Store, perm: "suppliers.view" },
  { to: "/reports", label: "گزارش‌ها", desc: "فروش روزانه و کالاهای پرفروش", icon: BarChart3, perm: "reports.view" },
  { to: "/users", label: "کاربران", desc: "نقش و دسترسی همکاران", icon: Users, perm: "users.manage" },
  { to: "/settings", label: "تنظیمات", desc: "نام فروشگاه، مالیات و انبار", icon: LayoutGrid, perm: "settings.manage" },
] as const;
