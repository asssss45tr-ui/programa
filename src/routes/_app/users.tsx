import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Card, PageHead } from "@/components/ui";
import { useStore } from "@/components/store-context";
import { listStaff, updateStaff } from "@/lib/server/reports";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_app/users")({ component: UsersPage });

function UsersPage() {
  const { staff: me } = useStore();
  const q = useQuery({ queryKey: ["staff"], queryFn: () => listStaff() });
  const mut = useMutation({
    mutationFn: (data: { userId: string; roleId?: number; isActive?: boolean }) => updateStaff({ data }),
    onSuccess: () => {
      toast.success("به‌روز شد");
      void q.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <PageHead title="کاربران" sub="اولین ورود هر همکار، نقش فروشنده می‌گیرد — مگر اینکه اولین نفر باشد (مدیر)." />
      <div className="space-y-2">
        {q.data?.staff.map((s) => (
          <Card key={s.user_id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-medium">{s.full_name}</div>
                <div className="text-xs text-muted" dir="ltr">
                  {s.username}
                </div>
              </div>
              <Badge tone={s.is_active ? "ok" : "off"}>{s.is_active ? "فعال" : "غیرفعال"}</Badge>
            </div>
            <div className="flex gap-2">
              <select
                className="h-10 flex-1 rounded-sm border border-line bg-surface px-2 text-sm"
                value={s.role_id}
                onChange={(e) => mut.mutate({ userId: s.user_id, roleId: Number(e.target.value) })}
              >
                {q.data.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name_fa}
                  </option>
                ))}
              </select>
              {s.user_id !== me.userId ? (
                <button
                  type="button"
                  className="text-xs text-danger"
                  onClick={() => mut.mutate({ userId: s.user_id, isActive: !s.is_active })}
                >
                  {s.is_active ? "غیرفعال" : "فعال‌سازی"}
                </button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
