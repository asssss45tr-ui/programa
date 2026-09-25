import { createFileRoute, Link } from "@tanstack/react-router";
import { MORE_LINKS } from "@/components/app-shell";
import { PageHead } from "@/components/ui";
import { useStore } from "@/components/store-context";

export const Route = createFileRoute("/_app/more")({ component: MorePage });

function MorePage() {
  const { staff } = useStore();
  const links = MORE_LINKS.filter((l) => staff.permissions.includes(l.perm));
  return (
    <div className="space-y-4">
      <PageHead title="بخش‌ها" sub="انبار، خرید، اشخاص و گزارش" />
      <div className="grid gap-2">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <Link
              key={l.to}
              to={l.to}
              className="flex items-center gap-3 rounded-md border border-line bg-surface p-4 shadow-card"
            >
              <span className="grid size-10 place-items-center rounded-sm bg-accent-soft text-accent">
                <Icon className="size-5" strokeWidth={1.75} />
              </span>
              <span>
                <span className="block font-medium">{l.label}</span>
                <span className="block text-xs text-muted">{l.desc}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
