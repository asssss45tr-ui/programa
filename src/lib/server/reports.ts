import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { iso, num, requireStaff } from "./core";

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, settings } = await requireStaff(context.userId, "dashboard.view");
    const today = await sql<{ n: number; total: string | number }>`
      select count(*)::int as n, coalesce(sum(total), 0) as total
      from sales
      where status = 'COMPLETED' and created_at::date = current_date
    `;
    const month = await sql<{ n: number; total: string | number }>`
      select count(*)::int as n, coalesce(sum(total), 0) as total
      from sales
      where status = 'COMPLETED'
        and date_trunc('month', created_at) = date_trunc('month', now())
    `;
    const low = await sql<{ n: number }>`
      select count(*)::int as n
      from products p
      left join stock s on s.product_id = p.id and s.warehouse_id = ${settings.defaultWarehouseId}
      where p.status = 'ACTIVE' and coalesce(s.qty, 0) <= p.minimum_stock
    `;
    const products = await sql<{ n: number }>`select count(*)::int as n from products where status = 'ACTIVE'`;
    const recent = await sql<Record<string, unknown>>`
      select s.id, s.doc_number, s.total, s.created_at, c.name as customer_name
      from sales s
      left join customers c on c.id = s.customer_id
      where s.status = 'COMPLETED'
      order by s.id desc limit 6
    `;
    return {
      storeName: settings.storeName,
      todayCount: num(today[0]?.n),
      todayTotal: num(today[0]?.total),
      monthCount: num(month[0]?.n),
      monthTotal: num(month[0]?.total),
      lowStock: num(low[0]?.n),
      productCount: num(products[0]?.n),
      recent: recent.map((r) => ({
        id: num(r.id),
        docNumber: String(r.doc_number),
        total: num(r.total),
        createdAt: iso(r.created_at),
        customerName: (r.customer_name as string | null) ?? null,
      })),
    };
  });

export const reportData = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await requireStaff(context.userId, "reports.view");
    const days = await sql<{ day: string; total: string | number; n: number }>`
      select to_char(created_at::date, 'YYYY-MM-DD') as day,
             coalesce(sum(total), 0) as total,
             count(*)::int as n
      from sales
      where status = 'COMPLETED' and created_at >= now() - interval '13 days'
      group by created_at::date
      order by day
    `;
    const top = await sql<{ name: string; qty: string | number; total: string | number }>`
      select p.name, coalesce(sum(i.qty), 0) as qty, coalesce(sum(i.line_total), 0) as total
      from sale_items i
      join sales s on s.id = i.sale_id
      join products p on p.id = i.product_id
      where s.status = 'COMPLETED' and s.created_at >= now() - interval '30 days'
      group by p.name
      order by qty desc
      limit 8
    `;
    const profit = await sql<{ revenue: string | number; cost: string | number }>`
      select coalesce(sum(i.line_total), 0) as revenue,
             coalesce(sum(i.qty * p.purchase_price), 0) as cost
      from sale_items i
      join sales s on s.id = i.sale_id
      join products p on p.id = i.product_id
      where s.status = 'COMPLETED' and date_trunc('month', s.created_at) = date_trunc('month', now())
    `;
    return {
      days: days.map((d) => ({ day: d.day, total: num(d.total), n: num(d.n) })),
      top: top.map((t) => ({ name: t.name, qty: num(t.qty), total: num(t.total) })),
      monthRevenue: num(profit[0]?.revenue),
      monthCost: num(profit[0]?.cost),
      monthProfit: num(profit[0]?.revenue) - num(profit[0]?.cost),
    };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await requireStaff(context.userId, "users.manage");
    const rows = await sql<{
      user_id: string;
      username: string;
      full_name: string;
      phone: string | null;
      role_id: number;
      role_name: string;
      role_name_fa: string;
      is_active: boolean;
    }>`
      select s.user_id, s.username, s.full_name, s.phone, s.role_id,
             r.name as role_name, r.name_fa as role_name_fa, s.is_active
      from store_staff s join roles r on r.id = s.role_id
      order by s.created_at
    `;
    const roles = await sql<{ id: number; name: string; name_fa: string }>`
      select id, name, name_fa from roles order by id
    `;
    return { staff: rows, roles };
  });

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      userId: z.string(),
      roleId: z.number().optional(),
      isActive: z.boolean().optional(),
      fullName: z.string().min(2).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { sql, staff } = await requireStaff(context.userId, "users.manage");
    if (data.userId === staff.userId && data.isActive === false) {
      throw new Error("حساب خودتان را نمی‌توانید غیرفعال کنید.");
    }
    await sql`
      update store_staff set
        role_id = coalesce(${data.roleId ?? null}, role_id),
        is_active = coalesce(${data.isActive ?? null}, is_active),
        full_name = coalesce(${data.fullName ?? null}, full_name)
      where user_id = ${data.userId}
    `;
    return { ok: true };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      storeName: z.string().min(2).max(80),
      taxEnabled: z.boolean(),
      taxRate: z.number().min(0).max(100),
      autoProductCode: z.boolean(),
      defaultWarehouseId: z.number(),
      allowNegativeStock: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { sql, staff } = await requireStaff(context.userId, "settings.manage");
    const entries: [string, unknown][] = [
      ["store_name", data.storeName],
      ["tax_enabled", data.taxEnabled],
      ["tax_rate", data.taxRate],
      ["auto_product_code", data.autoProductCode],
      ["default_warehouse_id", data.defaultWarehouseId],
      ["allow_negative_stock", data.allowNegativeStock],
    ];
    for (const [key, value] of entries) {
      await sql.query(
        `insert into settings (key, value, updated_at) values ($1, $2::jsonb, now())
         on conflict (key) do update set value = $2::jsonb, updated_at = now()`,
        [key, JSON.stringify({ value })],
      );
    }
    const { audit } = await import("./core");
    await audit(sql, staff.userId, "SETTINGS_UPDATE", "settings", "store", data);
    return { ok: true };
  });

export const listAudit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await requireStaff(context.userId, "audit.view");
    const rows = await sql<Record<string, unknown>>`
      select a.id, a.log_date, a.action, a.entity_type, a.entity_id, s.full_name
      from audit_logs a
      left join store_staff s on s.user_id = a.user_id
      order by a.id desc limit 60
    `;
    return rows.map((r) => ({
      id: num(r.id),
      at: iso(r.log_date),
      action: String(r.action),
      entityType: (r.entity_type as string | null) ?? null,
      entityId: (r.entity_id as string | null) ?? null,
      actor: (r.full_name as string | null) ?? null,
    }));
  });
