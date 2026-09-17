import { Link } from "react-router";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const SAMPLE_CHECKS = [
  { label: "MX", value: "2 records, priority 10 & 20", status: "pass" },
  { label: "SPF", value: "v=spf1 include:_spf.google.com ~all", status: "pass" },
  { label: "DKIM", value: "selector 'google' — 2048-bit key", status: "pass" },
  { label: "DMARC", value: "p=quarantine; pct=100", status: "pass" },
  { label: "TLS", value: "expires in 11 days", status: "warn" },
];

export function Landing() {
  return (
    <div className="min-h-screen bg-ink text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-signal" />
          <span className="font-semibold">MailGuard</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-ink-muted hover:text-white">
            Log in
          </Link>
          <Link to="/register" className={buttonVariants({ size: "sm" })}>
            Get started
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-8 py-16 md:grid-cols-2 md:py-24">
        <div className="flex flex-col justify-center">
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
            Know your email is broken before your customers do.
          </h1>
          <p className="mt-5 max-w-md text-ink-muted">
            MailGuard watches DNS, SPF, DKIM, DMARC, HTTP, and TLS for every domain you send from — and tells you
            exactly what changed, the moment it changes.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link to="/register" className={buttonVariants({ size: "lg" })}>
              Start monitoring <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-ink-border bg-ink-surface p-5">
          <div className="flex items-center justify-between border-b border-ink-border pb-3">
            <span className="data-mono text-sm text-ink-muted">mail.example.com</span>
            <span className="data-mono text-sm text-warning">86 / 100</span>
          </div>
          <ul className="mt-3 divide-y divide-ink-border">
            {SAMPLE_CHECKS.map((c) => (
              <li key={c.label} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-ink-muted">{c.label}</span>
                <span className="data-mono max-w-[220px] truncate text-right text-xs text-white/80">{c.value}</span>
                <span className={`ml-3 h-2 w-2 shrink-0 rounded-full ${c.status === "pass" ? "bg-healthy" : "bg-warning"}`} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl border-t border-ink-border px-8 py-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {[
            { title: "Every layer, one score", body: "DNS, SPF, DKIM, DMARC, HTTP and TLS combine into a transparent health score with a full breakdown of why." },
            { title: "Checks run on a schedule", body: "Background workers re-check your domains as often as every 15 minutes, without slowing down your dashboard." },
            { title: "Webhooks when things change", body: "Get a signed webhook the moment an issue is detected or a configuration silently changes." },
          ].map((f) => (
            <div key={f.title}>
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
