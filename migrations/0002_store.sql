-- Store schema: staff, catalog, stock, sales, purchases, payments.

create table if not exists roles (
  id serial primary key,
  name text not null unique,
  name_fa text not null,
  is_system boolean not null default true
);

create table if not exists permissions (
  id serial primary key,
  code text not null unique,
  name_fa text not null,
  module text not null
);

create table if not exists role_permissions (
  role_id int not null references roles(id) on delete cascade,
  permission_id int not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists store_staff (
  user_id text primary key,
  username text not null unique,
  full_name text not null,
  phone text,
  role_id int not null references roles(id),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists number_sequences (
  doc_type text primary key,
  prefix text not null,
  current_value int not null default 0,
  padding int not null default 6
);

create table if not exists audit_logs (
  id serial primary key,
  log_date timestamptz not null default now(),
  user_id text,
  action text not null,
  entity_type text,
  entity_id text,
  before_data jsonb,
  after_data jsonb
);
create index if not exists audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index if not exists audit_logs_user_idx on audit_logs (user_id, log_date);

create table if not exists warehouses (
  id serial primary key,
  name text not null unique,
  code text unique,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists units (
  id serial primary key,
  name text not null unique
);

create table if not exists categories (
  id serial primary key,
  name text not null unique
);

create table if not exists brands (
  id serial primary key,
  name text not null unique
);

create table if not exists products (
  id serial primary key,
  product_code text not null unique,
  name text not null,
  name_norm text not null,
  category_id int references categories(id) on delete set null,
  brand_id int references brands(id) on delete set null,
  unit_id int not null references units(id),
  purchase_price numeric(18, 2) not null default 0,
  sale_price numeric(18, 2) not null default 0,
  minimum_stock numeric(18, 3) not null default 0,
  description text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_name_norm_idx on products (name_norm);
create index if not exists products_category_idx on products (category_id);

create table if not exists product_barcodes (
  id serial primary key,
  product_id int not null references products(id) on delete cascade,
  barcode text not null unique,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists product_barcodes_product_idx on product_barcodes (product_id);

create table if not exists price_history (
  id serial primary key,
  product_id int not null references products(id) on delete cascade,
  price_type text not null,
  old_value numeric(18, 2),
  new_value numeric(18, 2) not null,
  source text not null default 'MANUAL',
  user_id text,
  changed_at timestamptz not null default now()
);

create table if not exists stock (
  warehouse_id int not null references warehouses(id),
  product_id int not null references products(id) on delete cascade,
  qty numeric(18, 3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, product_id)
);

create table if not exists stock_movements (
  id serial primary key,
  warehouse_id int not null references warehouses(id),
  product_id int not null references products(id),
  qty numeric(18, 3) not null,
  reason text not null,
  note text,
  ref_type text,
  ref_id int,
  user_id text,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on stock_movements (product_id, created_at);

create table if not exists customers (
  id serial primary key,
  name text not null,
  phone text,
  address text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists suppliers (
  id serial primary key,
  name text not null unique,
  phone text,
  address text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists sales (
  id serial primary key,
  doc_number text not null unique,
  customer_id int references customers(id) on delete set null,
  warehouse_id int not null references warehouses(id),
  user_id text not null,
  status text not null default 'COMPLETED',
  subtotal numeric(18, 2) not null default 0,
  discount numeric(18, 2) not null default 0,
  tax numeric(18, 2) not null default 0,
  total numeric(18, 2) not null default 0,
  paid numeric(18, 2) not null default 0,
  pay_method text not null default 'CASH',
  note text,
  created_at timestamptz not null default now()
);
create index if not exists sales_created_idx on sales (created_at);
create index if not exists sales_customer_idx on sales (customer_id);

create table if not exists sale_items (
  id serial primary key,
  sale_id int not null references sales(id) on delete cascade,
  product_id int not null references products(id),
  qty numeric(18, 3) not null,
  unit_price numeric(18, 2) not null,
  discount numeric(18, 2) not null default 0,
  line_total numeric(18, 2) not null
);

create table if not exists purchases (
  id serial primary key,
  doc_number text not null unique,
  supplier_id int references suppliers(id) on delete set null,
  warehouse_id int not null references warehouses(id),
  user_id text not null,
  status text not null default 'COMPLETED',
  subtotal numeric(18, 2) not null default 0,
  total numeric(18, 2) not null default 0,
  paid numeric(18, 2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists purchase_items (
  id serial primary key,
  purchase_id int not null references purchases(id) on delete cascade,
  product_id int not null references products(id),
  qty numeric(18, 3) not null,
  unit_cost numeric(18, 2) not null,
  line_total numeric(18, 2) not null
);

create table if not exists payments (
  id serial primary key,
  party_type text not null,
  party_id int,
  amount numeric(18, 2) not null,
  method text not null default 'CASH',
  sale_id int references sales(id) on delete set null,
  purchase_id int references purchases(id) on delete set null,
  user_id text,
  note text,
  created_at timestamptz not null default now()
);

-- Seed roles
insert into roles (id, name, name_fa, is_system) values
  (1, 'admin', 'مدیر', true),
  (2, 'seller', 'فروشنده', true),
  (3, 'warehouse_keeper', 'انباردار', true)
on conflict (name) do nothing;
select setval('roles_id_seq', greatest((select max(id) from roles), 1));

insert into permissions (code, name_fa, module) values
  ('users.manage', 'مدیریت کاربران', 'کاربران'),
  ('products.view', 'مشاهده کالا', 'کالا'),
  ('products.manage', 'ثبت و ویرایش کالا', 'کالا'),
  ('sales.view', 'مشاهده فروش', 'فروش'),
  ('sales.create', 'ثبت فروش', 'فروش'),
  ('sales.cancel', 'لغو فاکتور فروش', 'فروش'),
  ('sales.return', 'برگشت فروش', 'فروش'),
  ('customers.view', 'مشاهده مشتریان', 'اشخاص'),
  ('customers.manage', 'مدیریت مشتریان', 'اشخاص'),
  ('purchases.view', 'مشاهده خرید', 'خرید'),
  ('purchases.create', 'ثبت خرید', 'خرید'),
  ('purchases.cancel', 'لغو فاکتور خرید', 'خرید'),
  ('inventory.view', 'مشاهده موجودی', 'انبار'),
  ('inventory.adjust', 'اصلاح موجودی', 'انبار'),
  ('inventory.transfer', 'انتقال بین انبار', 'انبار'),
  ('suppliers.view', 'مشاهده تأمین‌کنندگان', 'اشخاص'),
  ('suppliers.manage', 'مدیریت تأمین‌کنندگان', 'اشخاص'),
  ('payments.manage', 'ثبت پرداخت و دریافت', 'مالی'),
  ('reports.view', 'مشاهده گزارش‌ها', 'گزارش'),
  ('dashboard.view', 'مشاهده داشبورد', 'گزارش'),
  ('settings.manage', 'مدیریت تنظیمات', 'سیستم'),
  ('audit.view', 'مشاهده لاگ عملیات', 'سیستم')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.name = 'admin'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r
join permissions p on p.code in (
  'products.view','sales.view','sales.create','sales.return',
  'customers.view','customers.manage','payments.manage','reports.view','dashboard.view'
)
where r.name = 'seller'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r
join permissions p on p.code in (
  'products.view','products.manage','purchases.view','purchases.create','purchases.cancel',
  'inventory.view','inventory.adjust','inventory.transfer',
  'suppliers.view','suppliers.manage','payments.manage','reports.view','dashboard.view'
)
where r.name = 'warehouse_keeper'
on conflict do nothing;

insert into warehouses (name, code, is_default) values
  ('انبار اصلی', 'WH1', true),
  ('انبار فرعی', 'WH2', false)
on conflict (name) do nothing;

insert into units (name) values ('عدد'), ('کارتن'), ('کیلوگرم')
on conflict (name) do nothing;

insert into categories (name) values
  ('نوشیدنی'), ('لبنیات'), ('خواربار'), ('شوینده'), ('میوه و سبزی')
on conflict (name) do nothing;

insert into brands (name) values ('پگاه'), ('زمزم'), ('مهرام'), ('گلستان'), ('بدون برند')
on conflict (name) do nothing;

insert into settings (key, value) values
  ('store_name', '{"value":"فروشگاه من"}'::jsonb),
  ('tax_enabled', '{"value":false}'::jsonb),
  ('tax_rate', '{"value":9}'::jsonb),
  ('auto_product_code', '{"value":true}'::jsonb),
  ('default_warehouse_id', '{"value":1}'::jsonb),
  ('allow_negative_stock', '{"value":false}'::jsonb)
on conflict (key) do nothing;

insert into number_sequences (doc_type, prefix, current_value, padding) values
  ('INV', 'INV-', 0, 6),
  ('PUR', 'PUR-', 0, 6)
on conflict (doc_type) do nothing;

-- Sample catalog only when empty
insert into products (product_code, name, name_norm, category_id, brand_id, unit_id, purchase_price, sale_price, minimum_stock, status)
select v.code, v.pname, v.nnorm, c.id, b.id, u.id, v.buy, v.sell, v.min_qty, 'ACTIVE'
from (
  values
    ('1001', 'شیر کم‌چرب ۱ لیتر', 'شیر کم چرب 1 لیتر', 'لبنیات', 'پگاه', 'عدد', 28000, 35000, 10),
    ('1002', 'ماست ۹۰۰ گرم', 'ماست 900 گرم', 'لبنیات', 'پگاه', 'عدد', 22000, 28000, 8),
    ('1003', 'پنیر سفید ۴۰۰ گرم', 'پنیر سفید 400 گرم', 'لبنیات', 'پگاه', 'عدد', 45000, 58000, 6),
    ('1004', 'نوشابه خانواده', 'نوشابه خانواده', 'نوشیدنی', 'زمزم', 'عدد', 18000, 25000, 12),
    ('1005', 'آب معدنی ۱.۵ لیتر', 'اب معدنی 1.5 لیتر', 'نوشیدنی', 'بدون برند', 'عدد', 6000, 9000, 20),
    ('1006', 'برنج طارم ۱۰ کیلویی', 'برنج طارم 10 کیلویی', 'خواربار', 'گلستان', 'عدد', 480000, 560000, 10),
    ('1007', 'روغن مایع ۱.۸ لیتر', 'روغن مایع 1.8 لیتر', 'خواربار', 'بدون برند', 'عدد', 95000, 118000, 8),
    ('1008', 'چای ۵۰۰ گرم', 'چای 500 گرم', 'خواربار', 'گلستان', 'عدد', 165000, 198000, 6),
    ('1009', 'ماکارونی ۵۰۰ گرم', 'ماکارونی 500 گرم', 'خواربار', 'مهرام', 'عدد', 22000, 32000, 15),
    ('1010', 'رب گوجه فرنگی', 'رب گوجه فرنگی', 'خواربار', 'مهرام', 'عدد', 38000, 48000, 8),
    ('1011', 'پودر لباسشویی', 'پودر لباسشویی', 'شوینده', 'بدون برند', 'عدد', 125000, 156000, 6),
    ('1012', 'دستمال کاغذی دوقلو', 'دستمال کاغذی دوقلو', 'شوینده', 'بدون برند', 'عدد', 28000, 39000, 10),
    ('1013', 'تخم‌مرغ ۹ عددی', 'تخم مرغ 9 عددی', 'لبنیات', 'بدون برند', 'عدد', 42000, 55000, 8),
    ('1014', 'موز فله', 'موز فله', 'میوه و سبزی', 'بدون برند', 'کیلوگرم', 65000, 89000, 12)
) as v(code, pname, nnorm, cat, brand, unit, buy, sell, min_qty)
join categories c on c.name = v.cat
join brands b on b.name = v.brand
join units u on u.name = v.unit
where not exists (select 1 from products);

insert into product_barcodes (product_id, barcode, is_primary)
select p.id, v.barcode, true
from (
  values
    ('1001', '6260123450001'),
    ('1002', '6260123450002'),
    ('1003', '6260123450003'),
    ('1004', '6260123450004'),
    ('1005', '6260123450005'),
    ('1006', '6260123450006'),
    ('1007', '6260123450007'),
    ('1008', '6260123450008'),
    ('1009', '6260123450009'),
    ('1010', '6260123450010'),
    ('1011', '6260123450011'),
    ('1012', '6260123450012'),
    ('1013', '6260123450013'),
    ('1014', '6260123450014')
) as v(code, barcode)
join products p on p.product_code = v.code
on conflict (barcode) do nothing;

insert into stock (warehouse_id, product_id, qty)
select w.id, p.id, v.qty
from (
  values
    ('1001', 24), ('1002', 18), ('1003', 12), ('1004', 36),
    ('1005', 48), ('1006', 8), ('1007', 15), ('1008', 10),
    ('1009', 40), ('1010', 20), ('1011', 9), ('1012', 22),
    ('1013', 16), ('1014', 30)
) as v(code, qty)
join products p on p.product_code = v.code
join warehouses w on w.is_default = true
on conflict (warehouse_id, product_id) do nothing;

insert into customers (name, phone, address)
select * from (values
  ('علی محمدی', '09121234567', 'تهران، خیابان انقلاب'),
  ('سارا رضایی', '09129876543', 'تهران، پاسداران'),
  ('فروشگاه همکار', '02144556677', 'بازار بزرگ')
) as v(name, phone, address)
where not exists (select 1 from customers);

insert into suppliers (name, phone, address)
select * from (values
  ('پخش البرز', '02133334444', 'جاده مخصوص کرج'),
  ('لبنیات پگاه', '02122001122', 'شهرک صنعتی'),
  ('بازرگانی امید', '02177889900', 'بازار آهن')
) as v(name, phone, address)
where not exists (select 1 from suppliers);
