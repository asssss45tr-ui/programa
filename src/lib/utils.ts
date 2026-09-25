import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function iso(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function errorMessage(error: unknown, fallback = "خطایی رخ داد. دوباره تلاش کنید.") {
  if (error instanceof Error && error.message) {
    if (error.message === "Unauthorized") return "برای ادامه وارد حساب شوید.";
    return error.message;
  }
  return fallback;
}
