import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import type { SaleDetail, SaleListItem } from "@/lib/types";
import { AppError, applyStock, audit, iso, nextDocNumber, num, requireStaff, requireStaffTx } from "./core";

const cartItem = z.object({
  productId: z.number(),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).optional(),
});

export const createSale = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      items: z.array(cartItem).min(1),
      customerId: z.number().nullable().optional(),
      warehouseId: z.number().optional(),
      discount: z.number().min(0).optional(),
      paid: z.number().min(0),
      payMethod: z.enum(["CASH", "CARD", "MIXED", "TRANSFER"]),
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    return requireStaffTx(context.userId, "sales.create", async ({ sql, staff, settings }) => {
      const warehouseId = data.warehouseId ?? settings.defaultWarehouseId;
      let subtotal = 0;
      const lines: { productId: number; qty: number; unitPrice: number; discount: number; lineTotal: number; name: string }[] = [];
      for (const item of data.items) {
        const product = await sql<{ id: number; name: string; status: string }>`
          select id, name, status from products where id = ${item.productId}
        `;
        if (!product[0] || product[0].status !== "ACTIVE") {
          throw new AppError("یکی از کالاهای سبد نامعتبر است.");
        }
        const lineDiscount = item.discount ?? 0;
        const lineTotal = Math.max(0, item.qty * item.unitPrice - lineDiscount);
        subtotal += lineTotal;
        lines.push({
          productId: item.productId,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discount: lineDiscount,
          lineTotal,
          name: product[0].name,
        });
      }
      const discount = data.discount ?? 0;
      const taxable = Math.max(0, subtotal - discount);
      const tax = settings.taxEnabled ? Math.round((taxable * settings.taxRate) / 100) : 0;
      const total = taxable + tax;
      if (data.paid + 0.01 < total) {
        throw new AppError("مبلغ پرداختی کمتر از جمع فاکتور است.");
      }
      const docNumber = await nextDocNumber(sql, "INV");
      const sale = await sql<{ id: number }>`
        insert into sales (
          doc_number, customer_id, warehouse_id, user_id, status,
          subtotal, discount, tax, total, paid, pay_method, note
        ) values (
          ${docNumber}, ${data.customerId ?? null}, ${warehouseId}, ${staff.userId}, 'COMPLETED',
          ${subtotal}, ${discount}, ${tax}, ${total}, ${data.paid}, ${data.payMethod}, ${data.note ?? null}
        ) returning id
      `;
      const saleId = sale[0].id;
      for (const line of lines) {
        await sql`
          insert into sale_items (sale_id, product_id, qty, unit_price, discount, line_total)
          values (${saleId}, ${line.productId}, ${line.qty}, ${line.unitPrice}, ${line.discount}, ${line.lineTotal})
        `;
        await applyStock(sql, warehouseId, line.productId, -line.qty, "SALE", staff.userId, {
          allowNegative: settings.allowNegativeStock,
          refType: "sale",
          refId: saleId,
        });
      }
      await sql`
        insert into payments (party_type, party_id, amount, method, sale_id, user_id)
        values ('CUSTOMER', ${data.customerId ?? null}, ${data.paid}, ${data.payMethod}, ${saleId}, ${staff.userId})
      `;
      await audit(sql, staff.userId, "SALE_CREATE", "sale", saleId, { docNumber, total });
      return { id: saleId, docNumber, total, paid: data.paid, change: Math.max(0, data.paid - total) };
    });
  });

export const listSales = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ q: z.string().optional() }))
  .handler(async ({ context, data }) => {
    const { sql } = await requireStaff(context.userId, "sales.view");
    const q = data.q?.trim();
    const rows = q
      ? await sql.query<Record<string, unknown>>(
          `select s.id, s.doc_number, c.name as customer_name, s.status, s.total, s.paid,
                  s.pay_method, s.created_at, st.full_name as cashier,
                  (select count(*)::int from sale_items i where i.sale_id = s.id) as item_count
           from sales s
           left join customers c on c.id = s.customer_id
           left join store_staff st on st.user_id = s.user_id
           where s.doc_number ilike $1 or coalesce(c.name, '') ilike $1
           order by s.id desc limit 80`,
          [`%${q}%`],
        )
      : await sql<Record<string, unknown>>`
          select s.id, s.doc_number, c.name as customer_name, s.status, s.total, s.paid,
                 s.pay_method, s.created_at, st.full_name as cashier,
                 (select count(*)::int from sale_items i where i.sale_id = s.id) as item_count
          from sales s
          left join customers c on c.id = s.customer_id
          left join store_staff st on st.user_id = s.user_id
          order by s.id desc limit 80
        `;
    return rows.map(mapSaleList);
  });

function mapSaleList(row: Record<string, unknown>): SaleListItem {
  return {
    id: num(row.id),
    docNumber: String(row.doc_number),
    customerName: (row.customer_name as string | null) ?? null,
    status: String(row.status),
    total: num(row.total),
    paid: num(row.paid),
    payMethod: String(row.pay_method),
    itemCount: num(row.item_count),
    createdAt: iso(row.created_at),
    cashier: (row.cashier as string | null) ?? null,
  };
}

export const getSale = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number() }))
  .handler(async ({ context, data }) => {
    const { sql } = await requireStaff(context.userId, "sales.view");
    const rows = await sql<Record<string, unknown>>`
      select s.*, c.name as customer_name, w.name as warehouse_name, st.full_name as cashier
      from sales s
      left join customers c on c.id = s.customer_id
      join warehouses w on w.id = s.warehouse_id
      left join store_staff st on st.user_id = s.user_id
      where s.id = ${data.id}
    `;
    if (!rows[0]) throw new AppError("فاکتور یافت نشد.", 404);
    const items = await sql<Record<string, unknown>>`
      select i.id, i.product_id, p.name, i.qty, i.unit_price, i.discount, i.line_total
      from sale_items i join products p on p.id = i.product_id
      where i.sale_id = ${data.id} order by i.id
    `;
    const row = rows[0];
    const detail: SaleDetail = {
      ...mapSaleList({ ...row, item_count: items.length, doc_number: row.doc_number, pay_method: row.pay_method }),
      warehouseName: String(row.warehouse_name),
      subtotal: num(row.subtotal),
      discount: num(row.discount),
      tax: num(row.tax),
      note: (row.note as string | null) ?? null,
      items: items.map((it) => ({
        id: num(it.id),
        productId: num(it.product_id),
        name: String(it.name),
        qty: num(it.qty),
        unitPrice: num(it.unit_price),
        discount: num(it.discount),
        lineTotal: num(it.line_total),
      })),
    };
    return detail;
  });

export const cancelSale = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number() }))
  .handler(async ({ context, data }) => {
    return requireStaffTx(context.userId, "sales.cancel", async ({ sql, staff, settings }) => {
      const sale = await sql<{
        id: number;
        status: string;
        warehouse_id: number;
        doc_number: string;
      }>`select id, status, warehouse_id, doc_number from sales where id = ${data.id}`;
      if (!sale[0]) throw new AppError("فاکتور یافت نشد.", 404);
      if (sale[0].status !== "COMPLETED") throw new AppError("فقط فاکتور نهایی قابل لغو است.");
      const items = await sql<{ product_id: number; qty: string | number }>`
        select product_id, qty from sale_items where sale_id = ${data.id}
      `;
      for (const item of items) {
        await applyStock(sql, sale[0].warehouse_id, item.product_id, num(item.qty), "SALE_CANCEL", staff.userId, {
          allowNegative: true,
          refType: "sale",
          refId: data.id,
        });
      }
      await sql`update sales set status = 'CANCELLED' where id = ${data.id}`;
      await audit(sql, staff.userId, "SALE_CANCEL", "sale", data.id, { doc: sale[0].doc_number });
      return { ok: true };
    });
  });
