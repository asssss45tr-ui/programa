import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import type { PurchaseListItem, StockRow } from "@/lib/types";
import { AppError, applyStock, audit, iso, nextDocNumber, num, requireStaff, requireStaffTx } from "./core";

export const listStock = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ q: z.string().optional(), lowOnly: z.boolean().optional() }))
  .handler(async ({ context, data }) => {
    const { sql, settings } = await requireStaff(context.userId, "inventory.view");
    const q = data.q?.trim();
    const rows = await sql.query<Record<string, unknown>>(
      `select p.id as product_id, p.product_code, p.name, u.name as unit_name,
              w.id as warehouse_id, w.name as warehouse_name,
              coalesce(s.qty, 0) as qty, p.minimum_stock, p.sale_price
       from products p
       join units u on u.id = p.unit_id
       join warehouses w on w.id = $1
       left join stock s on s.product_id = p.id and s.warehouse_id = w.id
       where p.status = 'ACTIVE'
         and ($2::text is null or p.name_norm like $3 or p.product_code like $4)
         and ($5::boolean is false or coalesce(s.qty, 0) <= p.minimum_stock)
       order by coalesce(s.qty, 0) / nullif(p.minimum_stock, 0) asc nulls last, p.name`,
      [
        settings.defaultWarehouseId,
        q || null,
        q ? `%${q}%` : null,
        q ? `%${q}%` : null,
        Boolean(data.lowOnly),
      ],
    );
    return rows.map(
      (r): StockRow => ({
        productId: num(r.product_id),
        productCode: String(r.product_code),
        name: String(r.name),
        unitName: (r.unit_name as string | null) ?? null,
        warehouseId: num(r.warehouse_id),
        warehouseName: String(r.warehouse_name),
        qty: num(r.qty),
        minimumStock: num(r.minimum_stock),
        salePrice: num(r.sale_price),
      }),
    );
  });

export const adjustStock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      productId: z.number(),
      warehouseId: z.number().optional(),
      delta: z.number(),
      note: z.string().min(2).max(300),
    }),
  )
  .handler(async ({ context, data }) => {
    return requireStaffTx(context.userId, "inventory.adjust", async ({ sql, staff, settings }) => {
      if (data.delta === 0) throw new AppError("مقدار اصلاح صفر است.");
      const warehouseId = data.warehouseId ?? settings.defaultWarehouseId;
      const qty = await applyStock(sql, warehouseId, data.productId, data.delta, "ADJUST", staff.userId, {
        allowNegative: settings.allowNegativeStock,
        note: data.note,
      });
      await audit(sql, staff.userId, "STOCK_ADJUST", "product", data.productId, {
        delta: data.delta,
        note: data.note,
      });
      return { qty };
    });
  });

export const transferStock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      productId: z.number(),
      fromWarehouseId: z.number(),
      toWarehouseId: z.number(),
      qty: z.number().positive(),
      note: z.string().max(300).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    return requireStaffTx(context.userId, "inventory.transfer", async ({ sql, staff, settings }) => {
      if (data.fromWarehouseId === data.toWarehouseId) {
        throw new AppError("انبار مبدأ و مقصد یکی است.");
      }
      await applyStock(sql, data.fromWarehouseId, data.productId, -data.qty, "TRANSFER_OUT", staff.userId, {
        allowNegative: settings.allowNegativeStock,
        note: data.note,
      });
      await applyStock(sql, data.toWarehouseId, data.productId, data.qty, "TRANSFER_IN", staff.userId, {
        allowNegative: true,
        note: data.note,
      });
      await audit(sql, staff.userId, "STOCK_TRANSFER", "product", data.productId, data);
      return { ok: true };
    });
  });

export const createPurchase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      supplierId: z.number().nullable().optional(),
      warehouseId: z.number().optional(),
      paid: z.number().min(0).optional(),
      note: z.string().max(500).optional(),
      items: z
        .array(
          z.object({
            productId: z.number(),
            qty: z.number().positive(),
            unitCost: z.number().min(0),
          }),
        )
        .min(1),
    }),
  )
  .handler(async ({ context, data }) => {
    return requireStaffTx(context.userId, "purchases.create", async ({ sql, staff, settings }) => {
      const warehouseId = data.warehouseId ?? settings.defaultWarehouseId;
      let subtotal = 0;
      for (const item of data.items) subtotal += item.qty * item.unitCost;
      const docNumber = await nextDocNumber(sql, "PUR");
      const paid = data.paid ?? subtotal;
      const created = await sql<{ id: number }>`
        insert into purchases (doc_number, supplier_id, warehouse_id, user_id, subtotal, total, paid, note)
        values (${docNumber}, ${data.supplierId ?? null}, ${warehouseId}, ${staff.userId},
                ${subtotal}, ${subtotal}, ${paid}, ${data.note ?? null})
        returning id
      `;
      const id = created[0].id;
      for (const item of data.items) {
        await sql`
          insert into purchase_items (purchase_id, product_id, qty, unit_cost, line_total)
          values (${id}, ${item.productId}, ${item.qty}, ${item.unitCost}, ${item.qty * item.unitCost})
        `;
        await applyStock(sql, warehouseId, item.productId, item.qty, "PURCHASE", staff.userId, {
          allowNegative: true,
          refType: "purchase",
          refId: id,
        });
      }
      if (paid > 0) {
        await sql`
          insert into payments (party_type, party_id, amount, method, purchase_id, user_id)
          values ('SUPPLIER', ${data.supplierId ?? null}, ${paid}, 'CASH', ${id}, ${staff.userId})
        `;
      }
      await audit(sql, staff.userId, "PURCHASE_CREATE", "purchase", id, { docNumber, total: subtotal });
      return { id, docNumber, total: subtotal };
    });
  });

export const listPurchases = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await requireStaff(context.userId, "purchases.view");
    const rows = await sql<Record<string, unknown>>`
      select p.id, p.doc_number, s.name as supplier_name, p.status, p.total, p.paid, p.created_at,
             (select count(*)::int from purchase_items i where i.purchase_id = p.id) as item_count
      from purchases p
      left join suppliers s on s.id = p.supplier_id
      order by p.id desc limit 80
    `;
    return rows.map(
      (r): PurchaseListItem => ({
        id: num(r.id),
        docNumber: String(r.doc_number),
        supplierName: (r.supplier_name as string | null) ?? null,
        status: String(r.status),
        total: num(r.total),
        paid: num(r.paid),
        itemCount: num(r.item_count),
        createdAt: iso(r.created_at),
      }),
    );
  });

export const cancelPurchase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number() }))
  .handler(async ({ context, data }) => {
    return requireStaffTx(context.userId, "purchases.cancel", async ({ sql, staff, settings }) => {
      const doc = await sql<{ id: number; status: string; warehouse_id: number }>`
        select id, status, warehouse_id from purchases where id = ${data.id}
      `;
      if (!doc[0]) throw new AppError("فاکتور خرید یافت نشد.", 404);
      if (doc[0].status !== "COMPLETED") throw new AppError("فقط فاکتور نهایی قابل لغو است.");
      const items = await sql<{ product_id: number; qty: string | number }>`
        select product_id, qty from purchase_items where purchase_id = ${data.id}
      `;
      for (const item of items) {
        await applyStock(sql, doc[0].warehouse_id, item.product_id, -num(item.qty), "PURCHASE_CANCEL", staff.userId, {
          allowNegative: settings.allowNegativeStock,
          refType: "purchase",
          refId: data.id,
        });
      }
      await sql`update purchases set status = 'CANCELLED' where id = ${data.id}`;
      await audit(sql, staff.userId, "PURCHASE_CANCEL", "purchase", data.id);
      return { ok: true };
    });
  });
