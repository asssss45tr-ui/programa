import { getSql, withTransaction, type Sql } from "@/lib/db";
import { iso, num } from "@/lib/utils";
import type { PermissionCode, StaffProfile, StoreSettings } from "@/lib/types";

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

export async function audit(
  sql: Sql,
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string | number,
  after?: unknown,
  before?: unknown,
) {
  await sql.query(
    `insert into audit_logs (user_id, action, entity_type, entity_id, after_data, before_data)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [
      userId,
      action,
      entityType ?? null,
      entityId == null ? null : String(entityId),
      after ? JSON.stringify(after) : null,
      before ? JSON.stringify(before) : null,
    ],
  );
}

export async function nextDocNumber(sql: Sql, docType: string): Promise<string> {
  const rows = await sql<{ prefix: string; current_value: number; padding: number }>`
    update number_sequences
    set current_value = current_value + 1
    where doc_type = ${docType}
    returning prefix, current_value, padding
  `;
  const row = rows[0];
  if (!row) throw new AppError("شمارنده سند یافت نشد.");
  return `${row.prefix}${String(row.current_value).padStart(row.padding, "0")}`;
}

export async function settingValue<T>(sql: Sql, key: string, fallback: T): Promise<T> {
  const rows = await sql<{ value: { value: T } | T }>`select value from settings where key = ${key}`;
  const raw = rows[0]?.value;
  if (raw && typeof raw === "object" && raw !== null && "value" in raw) {
    return (raw as { value: T }).value;
  }
  if (raw !== undefined && raw !== null) return raw as T;
  return fallback;
}

export async function loadSettings(sql?: Sql): Promise<StoreSettings> {
  const db = sql ?? (await getSql());
  const rows = await db<{ key: string; value: { value: unknown } }>`select key, value from settings`;
  const map = new Map<string, unknown>();
  for (const row of rows) {
    const v = row.value;
    map.set(row.key, v && typeof v === "object" && "value" in v ? v.value : v);
  }
  return {
    storeName: String(map.get("store_name") ?? "فروشگاه من"),
    taxEnabled: Boolean(map.get("tax_enabled") ?? false),
    taxRate: num(map.get("tax_rate") ?? 9),
    autoProductCode: Boolean(map.get("auto_product_code") ?? true),
    defaultWarehouseId: num(map.get("default_warehouse_id") ?? 1),
    allowNegativeStock: Boolean(map.get("allow_negative_stock") ?? false),
  };
}

type StaffRow = {
  user_id: string;
  username: string;
  full_name: string;
  phone: string | null;
  role_id: number;
  role_name: string;
  role_name_fa: string;
  is_active: boolean;
};

function mapStaff(row: StaffRow, permissions: string[]): StaffProfile {
  return {
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    phone: row.phone,
    roleId: row.role_id,
    roleName: row.role_name,
    roleNameFa: row.role_name_fa,
    isActive: row.is_active,
    permissions,
  };
}

async function permissionsForRole(sql: Sql, roleId: number): Promise<string[]> {
  const rows = await sql<{ code: string }>`
    select p.code
    from role_permissions rp
    join permissions p on p.id = rp.permission_id
    where rp.role_id = ${roleId}
  `;
  return rows.map((r) => r.code);
}

export async function ensureStaff(
  userId: string,
  displayName: string | null,
  email: string | null,
): Promise<StaffProfile> {
  const sql = await getSql();
  const existing = await sql<StaffRow>`
    select s.user_id, s.username, s.full_name, s.phone, s.role_id,
           r.name as role_name, r.name_fa as role_name_fa, s.is_active
    from store_staff s
    join roles r on r.id = s.role_id
    where s.user_id = ${userId}
  `;
  if (existing[0]) {
    await sql`update store_staff set last_login_at = now() where user_id = ${userId}`;
    const perms = await permissionsForRole(sql, existing[0].role_id);
    return mapStaff(existing[0], perms);
  }

  const countRows = await sql<{ n: number }>`select count(*)::int as n from store_staff`;
  const isFirst = num(countRows[0]?.n) === 0;
  const roleName = isFirst ? "admin" : "seller";
  const role = await sql<{ id: number; name: string; name_fa: string }>`
    select id, name, name_fa from roles where name = ${roleName}
  `;
  if (!role[0]) throw new AppError("نقش سیستم یافت نشد.");

  const base =
    (email?.split("@")[0] || displayName || "user")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .slice(0, 40)
      .toLowerCase() || `user${userId.slice(0, 6)}`;
  let username = base;
  let i = 1;
  while (true) {
    const clash = await sql<{ user_id: string }>`select user_id from store_staff where username = ${username}`;
    if (!clash[0]) break;
    username = `${base}${i++}`;
  }

  const fullName = displayName?.trim() || email || username;
  await sql`
    insert into store_staff (user_id, username, full_name, role_id, last_login_at)
    values (${userId}, ${username}, ${fullName}, ${role[0].id}, now())
  `;
  await audit(sql, userId, "STAFF_JOIN", "staff", userId, { username, role: roleName });
  const perms = await permissionsForRole(sql, role[0].id);
  return mapStaff(
    {
      user_id: userId,
      username,
      full_name: fullName,
      phone: null,
      role_id: role[0].id,
      role_name: role[0].name,
      role_name_fa: role[0].name_fa,
      is_active: true,
    },
    perms,
  );
}

export async function requireStaff(
  userId: string,
  perm?: PermissionCode,
): Promise<{ sql: Sql; staff: StaffProfile; settings: StoreSettings }> {
  const staff = await ensureStaff(userId, null, null);
  if (!staff.isActive) throw new AppError("حساب کاربری غیرفعال است.", 403);
  if (perm && !staff.permissions.includes(perm)) {
    throw new AppError("شما به این بخش دسترسی ندارید.", 403);
  }
  const sql = await getSql();
  const settings = await loadSettings(sql);
  return { sql, staff, settings };
}

export async function requireStaffTx<T>(
  userId: string,
  perm: PermissionCode | undefined,
  fn: (ctx: { sql: Sql; staff: StaffProfile; settings: StoreSettings }) => Promise<T>,
): Promise<T> {
  const staff = await ensureStaff(userId, null, null);
  if (!staff.isActive) throw new AppError("حساب کاربری غیرفعال است.", 403);
  if (perm && !staff.permissions.includes(perm)) {
    throw new AppError("شما به این بخش دسترسی ندارید.", 403);
  }
  return withTransaction(async (sql) => {
    const settings = await loadSettings(sql);
    return fn({ sql, staff, settings });
  });
}

export async function applyStock(
  sql: Sql,
  warehouseId: number,
  productId: number,
  delta: number,
  reason: string,
  userId: string,
  opts: {
    allowNegative: boolean;
    refType?: string;
    refId?: number;
    note?: string;
  },
): Promise<number> {
  await sql`
    insert into stock (warehouse_id, product_id, qty)
    values (${warehouseId}, ${productId}, 0)
    on conflict (warehouse_id, product_id) do nothing
  `;
  const rows = await sql<{ qty: string | number }>`
    update stock
    set qty = qty + ${delta}, updated_at = now()
    where warehouse_id = ${warehouseId} and product_id = ${productId}
    returning qty
  `;
  const qty = num(rows[0]?.qty);
  if (!opts.allowNegative && qty < -0.0001) {
    throw new AppError("موجودی کافی نیست. فروش با موجودی منفی مجاز نیست.");
  }
  await sql`
    insert into stock_movements (warehouse_id, product_id, qty, reason, note, ref_type, ref_id, user_id)
    values (
      ${warehouseId}, ${productId}, ${delta}, ${reason},
      ${opts.note ?? null}, ${opts.refType ?? null}, ${opts.refId ?? null}, ${userId}
    )
  `;
  return qty;
}

export { iso, num };
