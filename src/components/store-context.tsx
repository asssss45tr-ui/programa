import { createContext, useContext } from "react";
import type { StaffProfile, StoreSettings } from "@/lib/types";

export type StoreCtx = {
  staff: StaffProfile;
  settings: StoreSettings;
  refresh: () => void;
};

const Ctx = createContext<StoreCtx | null>(null);

export const StoreProvider = Ctx.Provider;

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("StoreProvider missing");
  return v;
}

export function useCan(code: string) {
  const { staff } = useStore();
  return staff.permissions.includes(code);
}
