import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Empty, Input, PageHead } from "@/components/ui";
import { ProductForm } from "@/components/product-form";
import { useCan } from "@/components/store-context";
import { lookupProduct } from "@/lib/server/products";
import type { Product } from "@/lib/types";
import { toman } from "@/lib/format";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_app/scan")({ component: ScanPage });

export function ScanPage() {
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [matchType, setMatchType] = useState<string | null>(null);
  const [matches, setMatches] = useState<Product[]>([]);
  const [newBarcodes, setNewBarcodes] = useState<string[] | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const navigate = useNavigate();
  const canManage = useCan("products.manage");

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  async function handleCode(term: string) {
    stop();
    setCode(term);
    setError(null);
    try {
      const res = await lookupProduct({ data: { term } });
      setMatchType(res.matchType);
      setMatches(res.matches ?? (res.product ? [res.product] : []));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function startCamera() {
    setError(null);
    setMatches([]);
    setCode(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      const Detector = (window as Window & { BarcodeDetector?: new (opts: { formats: string[] }) => {
        detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
      } }).BarcodeDetector;
      if (!Detector) {
        setError("این مرورگر اسکن زنده ندارد. بارکد را دستی وارد کنید یا از عکس استفاده کنید.");
        return;
      }
      const detector = new Detector({ formats: ["ean_13", "ean_8", "code_128", "qr_code", "upc_a"] });
      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          rafRef.current = requestAnimationFrame(() => void tick());
          return;
        }
        try {
          const found = await detector.detect(videoRef.current);
          if (found[0]?.rawValue) {
            void handleCode(found[0].rawValue);
            return;
          }
        } catch {
          /* keep scanning */
        }
        rafRef.current = requestAnimationFrame(() => void tick());
      };
      rafRef.current = requestAnimationFrame(() => void tick());
    } catch {
      setError("دسترسی به دوربین داده نشد. بارکد را دستی وارد کنید.");
      setScanning(false);
    }
  }

  const product = matches[0];

  return (
    <div className="space-y-4">
      <PageHead title="اسکن بارکد" sub="شناسایی سه‌روشی: بارکد، کد کالا، نام" />

      <div className="relative overflow-hidden rounded-lg bg-ink aspect-[4/3]">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {!scanning ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-accent-fg/70">دوربین خاموش است</div>
        ) : null}
      </div>

      {!scanning ? (
        <Button className="w-full" onClick={() => void startCamera()}>
          <Camera className="size-4" /> شروع اسکن
        </Button>
      ) : (
        <Button className="w-full" variant="secondary" onClick={stop}>
          توقف اسکن
        </Button>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) void handleCode(manual.trim());
        }}
      >
        <Input
          dir="ltr"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="ورود دستی بارکد / کد / نام"
        />
        <Button type="submit" variant="secondary" size="icon" aria-label="جستجو">
          <Search className="size-4" />
        </Button>
      </form>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {product && matchType !== "NONE" ? (
        <Card className="space-y-2">
          <div className="text-sm font-semibold text-success">کالا شناسایی شد</div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{product.name}</span>
            <Badge tone="accent">{product.productCode}</Badge>
          </div>
          <div className="text-sm text-muted">قیمت فروش: {toman(product.salePrice)}</div>
          <div className="text-sm text-muted">موجودی: {product.stockQty}</div>
          <Button className="w-full" variant="secondary" onClick={() => navigate({ to: "/pos", search: { code: product.productCode } })}>
            افزودن به صندوق
          </Button>
        </Card>
      ) : null}

      {matchType === "NONE" ? (
        <Card className="space-y-3">
          <div className="font-semibold text-danger">این بارکد ثبت نشده است.</div>
          {code ? (
            <div className="text-sm" dir="ltr">
              {code}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => navigate({ to: "/products", search: { q: code ?? "" } })}
            >
              جستجو
            </Button>
            {canManage ? (
              <Button className="flex-1" onClick={() => setNewBarcodes([code ?? ""])}>
                ثبت کالا
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {!matchType ? <Empty title="بارکد را اسکن یا وارد کنید" /> : null}

      {newBarcodes ? (
        <ProductForm
          initialBarcodes={newBarcodes}
          onClose={() => setNewBarcodes(null)}
          onSaved={() => {
            setNewBarcodes(null);
            if (code) void handleCode(code);
          }}
        />
      ) : null}
    </div>
  );
}
