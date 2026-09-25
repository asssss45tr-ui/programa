export function toFa(n: number, fraction = 0): string {
  return n.toLocaleString("fa-IR", {
    maximumFractionDigits: fraction,
    minimumFractionDigits: fraction,
  });
}

export function toman(n: number): string {
  return `${toFa(Math.round(n))} تومان`;
}

export function faDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const STATUS_FA: Record<string, string> = {
  ACTIVE: "فعال",
  INACTIVE: "غیرفعال",
  COMPLETED: "نهایی",
  CANCELLED: "لغو شده",
  RETURNED: "مرجوع",
  CASH: "نقد",
  CARD: "کارتخوان",
  MIXED: "ترکیبی",
  TRANSFER: "حواله",
};

export function statusFa(code: string): string {
  return STATUS_FA[code] ?? code;
}
