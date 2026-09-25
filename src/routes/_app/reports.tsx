import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Empty, PageHead } from "@/components/ui";
import { reportData } from "@/lib/server/reports";
import { toman, toFa } from "@/lib/format";

export const Route = createFileRoute("/_app/reports")({ component: ReportsPage });

function ReportsPage() {
  const q = useQuery({ queryKey: ["reports"], queryFn: () => reportData() });
  const d = q.data;
  const chart = (d?.days ?? []).map((x) => ({
    ...x,
    label: new Date(x.day).toLocaleDateString("fa-IR", { month: "numeric", day: "numeric" }),
  }));

  return (
    <div className="space-y-4">
      <PageHead title="گزارش‌ها" sub="۱۴ روز اخیر و کالاهای پرفروش ماه" />
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-xs text-muted">فروش ماه</div>
          <div className="mt-1 font-semibold tabular-nums">{d ? toman(d.monthRevenue) : "…"}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted">سود تقریبی ماه</div>
          <div className="mt-1 font-semibold tabular-nums">{d ? toman(d.monthProfit) : "…"}</div>
        </Card>
      </div>
      <Card className="h-56">
        {chart.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} barSize={14}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#9a9288" />
              <YAxis hide />
              <Tooltip
                formatter={(v) => toman(Number(v ?? 0))}
                contentStyle={{ direction: "rtl", fontFamily: "Vazirmatn, sans-serif", borderRadius: 12 }}
              />
              <Bar dataKey="total" fill="#0f766e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty title="فروشی در این بازه نیست" />
        )}
      </Card>
      <Card>
        <div className="mb-2 font-semibold">پرفروش‌های ۳۰ روز</div>
        {!d?.top.length ? (
          <p className="text-sm text-muted">بعد از ثبت فروش، اینجا پر می‌شود.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {d.top.map((t) => (
              <li key={t.name} className="flex justify-between py-2">
                <span>
                  {t.name} · {toFa(t.qty)}
                </span>
                <span className="tabular-nums">{toman(t.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
