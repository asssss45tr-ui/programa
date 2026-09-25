import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { normalizeFa } from "@/lib/normalize";
import type { CatalogItem, Product } from "@/lib/types";
import { AppError, applyStock, audit, loadSettings, num, requireStaff, requireStaffTx } from "./core";
import type { Sql } from "@/lib/db";

type ProductRow = {
  id: number;
  product_code: string;
  name: string;
  category_id: number | null;
  category_name: string | null;
  brand_id: number | null;
  brand_name: string | null;
  unit_id: number;
  unit_name: string | null;
  purchase_price: string | number;
  sale_price: string | number;
  minimum_stock: string | number;
  description: string | null;
  status: string;
  stock_qty: string | number | null;
};

function mapProduct(
  row: ProductRow,
  barcodes: { id: number; barcode: string; is_primary: boolean }[],
): Product {
  return {
    id: num(row.id),
    productCode: row.product_code,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    brandId: row.brand_id,
    brandName: row.brand_name,
    unitId: num(row.unit_id),
    unitName: row.unit_name,
    purchasePrice: num(row.purchase_price),
    salePrice: num(row.sale_price),
    minimumStock: num(row.minimum_stock),
    description: row.description,
    status: row.status,
    stockQty: num(row.stock_qty),
    barcodes: barcodes.map((b) => ({
      id: num(b.id),
      barcode: b.barcode,
      isPrimary: b.is_primary,
    })),
  };
}

const PRODUCT_SELECT = `
  select p.id, p.product_code, p.name, p.category_id, c.name as category_name,
         p.brand_id, b.name as brand_name, p.unit_id, u.name as unit_name,
         p.purchase_price, p.sale_price, p.minimum_stock, p.description, p.status,
         coalesce(s.qty, 0) as stock_qty
  from products p
  left join categories c on c.id = p.category_id
  left join brands b on b.id = p.brand_id
  join units u on u.id = p.unit_id
  left join warehouses w on w.is_default = true
  left join stock s on s.product_id = p.id and s.warehouse_id = w.id
`;

async function barcodesFor(sql: Sql, ids: number[]) {
  if (!ids.length) return new Map<number, { id: number; barcode: string; is_primary: boolean }[]>();
  const rows = await sql.query<{ id: number; product_id: number; barcode: string; is_primary: boolean }>(
    `select id, product_id, barcode, is_primary from product_barcodes
     where product_id = any($1::int[]) order by is_primary desc, id`,
    [ids],
  );
  const map = new Map<number, { id: number; barcode: string; is_primary: boolean }[]>();
  for (const row of rows) {
    const list = map.get(row.product_id) ?? [];
    list.push(row);
    map.set(row.product_id, list);
  }
  return map;
}

async function loadByIds(sql: Sql, ids: number[]): Promise<Product[]> {
  if (!ids.length) return [];
  const rows = await sql.query<ProductRow>(
    `${PRODUCT_SELECT} where p.id = any($1::int[])`,
    [ids],
  );
  const bc = await barcodesFor(sql, ids);
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows
    .map((r) => mapProduct(r, bc.get(r.id) ?? []))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function cleanBarcodes(list: string[]) {
  const out: string[] = [];
  for (const raw of list) {
    const clean = raw.trim();
    if (!clean) continue;
    if (!/^[A-Za-z0-9-]{4,64}$/.test(clean)) {
      throw new AppError(`بارکد نامعتبر است: ${clean}`);
    }
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}

async function assertBarcodesFree(sql: Sql, barcodes: string[], exceptProductId?: number) {
  if (!barcodes.length) return;
  const taken = await sql.query<{ barcode: string }>(
    exceptProductId
      ? `select barcode from product_barcodes where barcode = any($1::text[]) and product_id <> $2`
      : `select barcode from product_barcodes where barcode = any($1::text[])`,
    exceptProductId ? [barcodes, exceptProductId] : [barcodes],
  );
  if (taken.length) {
    throw new AppError(`این بارکد(ها) قبلاً ثبت شده: ${taken.map((t) => t.barcode).join("، ")}`);
  }
}

async function resolveProductCode(sql: Sql, manual?: string) {
  const trimmed = manual?.trim();
  if (trimmed) {
    const exists = await sql`select id from products where product_code = ${trimmed}`;
    if (exists[0]) throw new AppError("این کد کالا قبلاً ثبت شده است.");
    return trimmed;
  }
  const rows = await sql<{ max_code: string | null }>`
    select max(nullif(regexp_replace(product_code, '[^0-9]', '', 'g'), '')::bigint)::text as max_code
    from products where product_code ~ '[0-9]'
  `;
  const next = rows[0]?.max_code ? BigInt(rows[0].max_code) + 1n : 1001n;
  return next.toString();
}

export const getMyStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      displayName: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { ensureStaff, loadSettings } = await import("./core");
    const staff = await ensureStaff(context.userId, data.displayName ?? null, data.email ?? null);
    const settings = await loadSettings();
    return { staff, settings };
  });

export const listProducts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ q: z.string().optional(), page: z.number().optional() }))
  .handler(async ({ context, data }) => {
    const { sql } = await requireStaff(context.userId, "products.view");
    const page = data.page ?? 1;
    const limit = 40;
    const raw = data.q?.trim() ?? "";
    const norm = raw ? normalizeFa(raw) : "";
    const rows = raw
      ? await sql.query<ProductRow & { total: number }>(
          `${PRODUCT_SELECT}
           where p.name_norm like $1
              or p.product_code like $2
              or exists (select 1 from product_barcodes pb where pb.product_id = p.id and pb.barcode = $3)
           order by p.id desc
           limit $4 offset $5`,
          [`%${norm}%`, `%${raw}%`, raw, limit, (page - 1) * limit],
        )
      : await sql.query<ProductRow>(
          `${PRODUCT_SELECT} order by p.id desc limit $1 offset $2`,
          [limit, (page - 1) * limit],
        );
    const count = raw
      ? await sql.query<{ n: number }>(
          `select count(*)::int as n from products p
           where p.name_norm like $1 or p.product_code like $2
              or exists (select 1 from product_barcodes pb where pb.product_id = p.id and pb.barcode = $3)`,
          [`%${norm}%`, `%${raw}%`, raw],
        )
      : await sql<{ n: number }>`select count(*)::int as n from products`;
    const ids = rows.map((r) => r.id);
    const bc = await barcodesFor(sql, ids);
    return {
      total: num(count[0]?.n),
      page,
      items: rows.map((r) => mapProduct(r, bc.get(r.id) ?? [])),
    };
  });

export const lookupProduct = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ term: z.string() }))
  .handler(async ({ context, data }) => {
    const { sql } = await requireStaff(context.userId, "products.view");
    const raw = data.term.trim();
    if (!raw) return { matchType: "NONE" as const, matches: [] as Product[] };

    const byBarcode = await sql<{ product_id: number }>`
      select product_id from product_barcodes where barcode = ${raw}
    `;
    if (byBarcode[0]) {
      const [product] = await loadByIds(sql, [byBarcode[0].product_id]);
      return { matchType: "BARCODE" as const, product, matches: product ? [product] : [] };
    }

    const byCode = await sql<{ id: number }>`
      select id from products
      where product_code = ${raw} or product_code like ${raw + "%"}
      order by product_code asc limit 1
    `;
    if (byCode[0]) {
      const [product] = await loadByIds(sql, [byCode[0].id]);
      return { matchType: "PRODUCT_CODE" as const, product, matches: product ? [product] : [] };
    }

    const norm = normalizeFa(raw);
    const names = await sql<{ id: number }>`
      select id from products where name_norm like ${"%" + norm + "%"} order by id desc limit 20
    `;
    if (!names.length) return { matchType: "NONE" as const, matches: [] };
    const matches = await loadByIds(
      sql,
      names.map((n) => n.id),
    );
    return { matchType: "NAME" as const, matches, product: matches[0] };
  });

export const getProduct = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number() }))
  .handler(async ({ context, data }) => {
    const { sql } = await requireStaff(context.userId, "products.view");
    const [product] = await loadByIds(sql, [data.id]);
    if (!product) throw new AppError("کالا یافت نشد.", 404);
    return product;
  });

const productInput = z.object({
  name: z.string().min(2).max(200),
  productCode: z.string().max(40).optional(),
  categoryId: z.number().optional(),
  brandId: z.number().optional(),
  unitId: z.number().optional(),
  purchasePrice: z.number().min(0).optional(),
  salePrice: z.number().min(0).optional(),
  minimumStock: z.number().min(0).optional(),
  description: z.string().max(2000).optional(),
  barcodes: z.array(z.string()).optional(),
  openingQty: z.number().min(0).optional(),
});

export const createProduct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(productInput)
  .handler(async ({ context, data }) => {
    return requireStaffTx(context.userId, "products.manage", async ({ sql, staff, settings }) => {
      const productCode = await resolveProductCode(sql, settings.autoProductCode ? data.productCode : data.productCode);
      const nameNorm = normalizeFa(data.name);
      const barcodes = cleanBarcodes(data.barcodes ?? []);
      await assertBarcodesFree(sql, barcodes);
      const unitId = data.unitId ?? 1;
      const created = await sql<{ id: number }>`
        insert into products (
          product_code, name, name_norm, category_id, brand_id, unit_id,
          purchase_price, sale_price, minimum_stock, description
        ) values (
          ${productCode}, ${data.name}, ${nameNorm}, ${data.categoryId ?? null},
          ${data.brandId ?? null}, ${unitId}, ${data.purchasePrice ?? 0},
          ${data.salePrice ?? 0}, ${data.minimumStock ?? 0}, ${data.description ?? null}
        ) returning id
      `;
      const id = created[0].id;
      for (let i = 0; i < barcodes.length; i++) {
        await sql`
          insert into product_barcodes (product_id, barcode, is_primary)
          values (${id}, ${barcodes[i]}, ${i === 0})
        `;
      }
      if ((data.openingQty ?? 0) > 0) {
        await applyStock(sql, settings.defaultWarehouseId, id, data.openingQty ?? 0, "OPENING", staff.userId, {
          allowNegative: true,
        });
      }
      await audit(sql, staff.userId, "PRODUCT_CREATE", "product", id, { productCode, name: data.name });
      const [product] = await loadByIds(sql, [id]);
      return product;
    });
  });

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    productInput.extend({
      id: z.number(),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      barcodes: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    return requireStaffTx(context.userId, "products.manage", async ({ sql, staff }) => {
      const before = await sql<{
        id: number;
        sale_price: string | number;
        purchase_price: string | number;
      }>`select id, sale_price, purchase_price from products where id = ${data.id}`;
      if (!before[0]) throw new AppError("کالا یافت نشد.", 404);
      const nameNorm = normalizeFa(data.name);
      await sql`
        update products set
          name = ${data.name},
          name_norm = ${nameNorm},
          category_id = ${data.categoryId ?? null},
          brand_id = ${data.brandId ?? null},
          unit_id = ${data.unitId ?? 1},
          minimum_stock = ${data.minimumStock ?? 0},
          description = ${data.description ?? null},
          status = ${data.status ?? "ACTIVE"},
          purchase_price = ${data.purchasePrice ?? 0},
          sale_price = ${data.salePrice ?? 0},
          updated_at = now()
        where id = ${data.id}
      `;
      const oldSale = num(before[0].sale_price);
      const oldBuy = num(before[0].purchase_price);
      if (oldSale !== (data.salePrice ?? 0)) {
        await sql`
          insert into price_history (product_id, price_type, old_value, new_value, user_id)
          values (${data.id}, 'SALE', ${oldSale}, ${data.salePrice ?? 0}, ${staff.userId})
        `;
      }
      if (oldBuy !== (data.purchasePrice ?? 0)) {
        await sql`
          insert into price_history (product_id, price_type, old_value, new_value, user_id)
          values (${data.id}, 'PURCHASE', ${oldBuy}, ${data.purchasePrice ?? 0}, ${staff.userId})
        `;
      }
      if (data.barcodes) {
        const barcodes = cleanBarcodes(data.barcodes);
        await assertBarcodesFree(sql, barcodes, data.id);
        await sql`delete from product_barcodes where product_id = ${data.id}`;
        for (let i = 0; i < barcodes.length; i++) {
          await sql`
            insert into product_barcodes (product_id, barcode, is_primary)
            values (${data.id}, ${barcodes[i]}, ${i === 0})
          `;
        }
      }
      await audit(sql, staff.userId, "PRODUCT_UPDATE", "product", data.id, { name: data.name });
      const [product] = await loadByIds(sql, [data.id]);
      return product;
    });
  });

export const deactivateProduct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number() }))
  .handler(async ({ context, data }) => {
    const { sql, staff } = await requireStaff(context.userId, "products.manage");
    await sql`update products set status = 'INACTIVE', updated_at = now() where id = ${data.id}`;
    await audit(sql, staff.userId, "PRODUCT_DEACTIVATE", "product", data.id);
    return { ok: true };
  });

export const listCatalog = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await requireStaff(context.userId, "products.view");
    const [categories, brands, units, warehouses] = await Promise.all([
      sql<CatalogItem>`select id, name from categories order by name`,
      sql<CatalogItem>`select id, name from brands order by name`,
      sql<CatalogItem>`select id, name from units order by id`,
      sql<{ id: number; name: string; is_default: boolean }>`
        select id, name, is_default from warehouses where is_active = true order by id
      `,
    ]);
    return { categories, brands, units, warehouses };
  });

export const addCatalogItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      kind: z.enum(["category", "brand", "unit"]),
      name: z.string().min(1).max(120),
    }),
  )
  .handler(async ({ context, data }) => {
    const { sql } = await requireStaff(context.userId, "products.manage");
    const table = data.kind === "category" ? "categories" : data.kind === "brand" ? "brands" : "units";
    const rows = await sql.query<CatalogItem>(
      `insert into ${table} (name) values ($1) on conflict (name) do update set name = excluded.name returning id, name`,
      [data.name.trim()],
    );
    return rows[0];
  });
