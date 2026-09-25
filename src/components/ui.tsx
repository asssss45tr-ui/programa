import { cva, type VariantProps } from "class-variance-authority";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[transform,opacity,background-color] duration-150 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] min-h-11 px-4 text-sm",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg shadow-card hover:bg-accent-dark",
        secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
        ghost: "bg-transparent text-ink hover:bg-surface-2",
        danger: "bg-danger text-accent-fg hover:opacity-90",
        soft: "bg-accent-soft text-accent-dark hover:bg-accent-soft/80",
      },
      size: {
        md: "min-h-11 px-4",
        sm: "min-h-9 px-3 text-xs rounded-sm",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-sm border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-subtle transition-colors duration-150 focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-sm border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-subtle focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-line bg-surface p-4 shadow-card", className)}
      {...props}
    />
  );
}

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: "ok" | "off" | "warn" | "muted" | "accent";
  children: ReactNode;
}) {
  const tones = {
    ok: "bg-success-soft text-success",
    off: "bg-surface-2 text-muted",
    warn: "bg-warn-soft text-warn",
    muted: "bg-surface-2 text-muted",
    accent: "bg-accent-soft text-accent-dark",
  };
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="بستن"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-card sm:rounded-xl sm:mb-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            بستن
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface/60 px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function PageHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {sub ? <p className="text-sm text-muted">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}
