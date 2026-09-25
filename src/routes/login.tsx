import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { useState, type FormEvent } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button, Field, Input } from "@/components/ui";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isPending && user) {
    return <Navigate to="/" />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "up") {
        const { error: err } = await authClient.signUp.email({
          name: name.trim() || email.split("@")[0],
          email,
          password,
          callbackURL: "/",
        });
        if (err) throw new Error(err.message);
      } else {
        const { error: err } = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/",
        });
        if (err) throw new Error(err.message);
      }
      await authClient.getSession();
      navigate({ to: "/", replace: true });
    } catch (err) {
      setError(errorMessage(err, "ورود ناموفق بود."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-accent px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-surface p-6 shadow-card"
      >
        <div className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-lg bg-accent-soft text-accent">
            <Store className="size-6" strokeWidth={1.75} />
          </span>
          <h1 className="mt-3 text-lg font-semibold">مدیریت فروشگاه</h1>
          <p className="text-sm text-muted">صندوق، انبار و کالا — ورود همکاران</p>
        </div>

        {authEnabled ? (
          <div className="space-y-2">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
              >
                ورود با {p.label === "X" ? "X" : "گوگل"}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted">ورود غیرفعال است.</p>
        )}

        <div className="flex items-center gap-3 text-[11px] text-subtle">
          <span className="h-px flex-1 bg-line" />
          یا با ایمیل
          <span className="h-px flex-1 bg-line" />
        </div>

        {mode === "up" ? (
          <Field label="نام">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="نام کامل" id="full-name" />
          </Field>
        ) : null}
        <Field label="ایمیل">
          <Input
            type="email"
            required
            autoComplete="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@store.com"
            id="email"
          />
        </Field>
        <Field label="رمز عبور">
          <Input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "up" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="حداقل ۸ کاراکتر"
            id="password"
          />
        </Field>

        {error ? (
          <div className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}

        <Button type="submit" className="w-full" disabled={loading || !authEnabled}>
          {loading ? "لطفاً صبر کنید…" : mode === "up" ? "ساخت حساب" : "ورود"}
        </Button>
        <button
          type="button"
          className="w-full text-center text-sm text-accent"
          onClick={() => setMode(mode === "up" ? "in" : "up")}
        >
          {mode === "up" ? "حساب دارید؟ ورود" : "حساب ندارید؟ ثبت‌نام"}
        </button>
      </form>
    </main>
  );
}
