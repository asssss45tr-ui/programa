import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Party } from "@/lib/types";
import { AppError, audit, num, requireStaff } from "./core";

const partyInput = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().max(20).optional(),
  address: z.string().max(300).optional(),
  note: z.string().max(500).optional(),
});

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ q: z.string().optional() }))
  .handler(async ({ context, data }) => {
    const { sql } = await requireStaff(context.userId, "customers.view");
    const q = data.q?.trim();
    const rows = q
      ? await sql.query<Record<string, unknown>>(
          `select c.*, coalesce((
             select sum(s.total - s.paid) from sales s
             where s.customer_id = c.id and s.status = 'COMPLETED'
           ), 0) as balance
           from customers c
           where c.is_active = true and (c.name ilike $1 or coalesce(c.phone,'') like $1)
           order by c.name`,
          [`%${q}%`],
        )
      : await sql<Record<string, unknown>>`
          select c.*, coalesce((
            select sum(s.total - s.paid) from sales s
            where s.customer_id = c.id and s.status = 'COMPLETED'
          ), 0) as balance
          from customers c where c.is_active = true order by c.name
        `;
    return rows.map(mapParty);
  });

export const saveCustomer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(partyInput.extend({ id: z.number().optional() }))
  .handler(async ({ context, data }) => {
    const { sql, staff } = await requireStaff(context.userId, "customers.manage");
    if (data.id) {
      await sql`
        update customers set name = ${data.name}, phone = ${data.phone ?? null},
          address = ${data.address ?? null}, note = ${data.note ?? null}
        where id = ${data.id}
      `;
      await audit(sql, staff.userId, "CUSTOMER_UPDATE", "customer", data.id);
      return { id: data.id };
    }
    const created = await sql<{ id: number }>`
      insert into customers (name, phone, address, note)
      values (${data.name}, ${data.phone ?? null}, ${data.address ?? null}, ${data.note ?? null})
      returning id
    `;
    await audit(sql, staff.userId, "CUSTOMER_CREATE", "customer", created[0].id);
    return { id: created[0].id };
  });

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await requireStaff(context.userId, "suppliers.view");
    const rows = await sql<Record<string, unknown>>`
      select s.*, coalesce((
        select sum(p.total - p.paid) from purchases p
        where p.supplier_id = s.id and p.status = 'COMPLETED'
      ), 0) as balance
      from suppliers s where s.is_active = true order by s.name
    `;
    return rows.map(mapParty);
  });

export const saveSupplier = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(partyInput.extend({ id: z.number().optional() }))
  .handler(async ({ context, data }) => {
    const { sql, staff } = await requireStaff(context.userId, "suppliers.manage");
    if (data.id) {
      await sql`
        update suppliers set name = ${data.name}, phone = ${data.phone ?? null},
          address = ${data.address ?? null}, note = ${data.note ?? null}
        where id = ${data.id}
      `;
      return { id: data.id };
    }
    const created = await sql<{ id: number }>`
      insert into suppliers (name, phone, address, note)
      values (${data.name}, ${data.phone ?? null}, ${data.address ?? null}, ${data.note ?? null})
      returning id
    `;
    await audit(sql, staff.userId, "SUPPLIER_CREATE", "supplier", created[0].id);
    return { id: created[0].id };
  });

function mapParty(row: Record<string, unknown>): Party {
  return {
    id: num(row.id),
    name: String(row.name),
    phone: (row.phone as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    isActive: Boolean(row.is_active),
    balance: num(row.balance),
  };
}
