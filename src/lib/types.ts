export type PermissionCode =
  | "users.manage"
  | "products.view"
  | "products.manage"
  | "sales.view"
  | "sales.create"
  | "sales.cancel"
  | "sales.return"
  | "customers.view"
  | "customers.manage"
  | "purchases.view"
  | "purchases.create"
  | "purchases.cancel"
  | "inventory.view"
  | "inventory.adjust"
  | "inventory.transfer"
  | "suppliers.view"
  | "suppliers.manage"
  | "payments.manage"
  | "reports.view"
  | "dashboard.view"
  | "settings.manage"
  | "audit.view";

export type StaffProfile = {
  userId: string;
  username: string;
  fullName: string;
  phone: string | null;
  roleId: number;
  roleName: string;
  roleNameFa: string;
  isActive: boolean;
  permissions: string[];
};

export type Barcode = { id: number; barcode: string; isPrimary: boolean };

export type Product = {
  id: number;
  productCode: string;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  brandId: number | null;
  brandName: string | null;
  unitId: number;
  unitName: string | null;
  purchasePrice: number;
  salePrice: number;
  minimumStock: number;
  description: string | null;
  status: string;
  stockQty: number;
  barcodes: Barcode[];
};

export type CatalogItem = { id: number; name: string };

export type Party = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  isActive: boolean;
  balance: number;
};

export type SaleListItem = {
  id: number;
  docNumber: string;
  customerName: string | null;
  status: string;
  total: number;
  paid: number;
  payMethod: string;
  itemCount: number;
  createdAt: string;
  cashier: string | null;
};

export type SaleDetail = SaleListItem & {
  warehouseName: string;
  subtotal: number;
  discount: number;
  tax: number;
  note: string | null;
  items: {
    id: number;
    productId: number;
    name: string;
    qty: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
  }[];
};

export type PurchaseListItem = {
  id: number;
  docNumber: string;
  supplierName: string | null;
  status: string;
  total: number;
  paid: number;
  itemCount: number;
  createdAt: string;
};

export type StockRow = {
  productId: number;
  productCode: string;
  name: string;
  unitName: string | null;
  warehouseId: number;
  warehouseName: string;
  qty: number;
  minimumStock: number;
  salePrice: number;
};

export type StoreSettings = {
  storeName: string;
  taxEnabled: boolean;
  taxRate: number;
  autoProductCode: boolean;
  defaultWarehouseId: number;
  allowNegativeStock: boolean;
};
