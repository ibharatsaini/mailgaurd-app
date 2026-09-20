import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Copy, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/useApiKeys";
import { formatRelativeTime } from "@/lib/utils";

const SCOPES = [
  { value: "DOMAINS_READ", label: "Read domains" },
  { value: "DOMAINS_WRITE", label: "Manage domains" },
  { value: "CHECKS_TRIGGER", label: "Trigger checks" },
  { value: "WEBHOOKS_MANAGE", label: "Manage webhooks" },
];

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  scopes: z.array(z.string()).min(1, "Select at least one scope"),
});
type FormValues = z.infer<typeof schema>;

export function ApiKeys() {
  const { data, isLoading, isError, refetch } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { scopes: ["DOMAINS_READ"] } });

  const selectedScopes = watch("scopes");

  const toggleScope = (scope: string) => {
    const next = selectedScopes.includes(scope) ? selectedScopes.filter((s) => s !== scope) : [...selectedScopes, scope];
    setValue("scopes", next);
  };

  const onSubmit = async (values: FormValues) => {
    const result = await createKey.mutateAsync(values);
    setNewKey(result.plaintextKey);
    reset();
    setShowForm(false);
  };

  const copyKey = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">API keys</h1>
          <p className="mt-1 text-sm text-paper-muted">Use these to call the MailGuard API programmatically.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" /> New key
        </Button>
      </div>

      {newKey && (
        <Card className="mt-4 border-signal/40 bg-signal/5 p-5">
          <p className="text-sm font-medium text-ink">Copy your API key now — you won't be able to see it again.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="data-mono flex-1 truncate rounded-md border border-paper-border bg-white px-3 py-2 text-sm">{newKey}</code>
            <Button variant="outline" size="sm" aria-label="Copy API key" onClick={copyKey}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <button className="mt-3 text-sm text-paper-muted hover:text-ink" onClick={() => setNewKey(null)}>
            Done
          </button>
        </Card>
      )}

      {showForm && (
        <Card className="mt-4 p-5">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="e.g. CI pipeline" {...register("name")} />
              {errors.name && <p className="mt-1 text-sm text-critical">{errors.name.message}</p>}
            </div>
            <div>
              <Label>Scopes</Label>
              <div className="grid grid-cols-2 gap-2">
                {SCOPES.map((s) => (
                  <button
                    type="button"
                    key={s.value}
                    onClick={() => toggleScope(s.value)}
                    className={`rounded-md border px-3 py-2 text-left text-sm ${
                      selectedScopes.includes(s.value) ? "border-signal bg-signal/10 text-signal" : "border-paper-border text-ink"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {errors.scopes && <p className="mt-1 text-sm text-critical">{errors.scopes.message}</p>}
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create key"}
            </Button>
          </form>
        </Card>
      )}

      <div className="mt-6">
        {isLoading && <LoadingState />}
        {isError && <ErrorState message="Couldn't load API keys." onRetry={() => refetch()} />}
        {data && data.apiKeys.length === 0 && (
          <EmptyState title="No API keys yet" description="Create one to call the MailGuard API from scripts or CI." />
        )}
        {data && data.apiKeys.length > 0 && (
          <ul className="divide-y divide-paper-border rounded-lg border border-paper-border bg-paper-panel">
            {data.apiKeys.map((key) => (
              <li key={key.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-medium text-ink">{key.name}</p>
                  <p className="data-mono mt-0.5 text-xs text-paper-muted">
                    {key.prefix}•••••••• · {key.scopes.join(", ").toLowerCase()}
                  </p>
                  <p className="mt-0.5 text-xs text-paper-muted">
                    {key.revokedAt
                      ? "Revoked"
                      : key.lastUsedAt
                        ? `Last used ${formatRelativeTime(key.lastUsedAt)}`
                        : "Never used"}
                  </p>
                </div>
                {!key.revokedAt && (
                  <Button variant="ghost" size="sm" aria-label={`Revoke API key ${key.name}`} onClick={() => revokeKey.mutate(key.id)}>
                    <Trash2 className="h-4 w-4 text-critical" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
