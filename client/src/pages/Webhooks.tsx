import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useWebhooks, useCreateWebhook, useDeleteWebhook } from "@/hooks/useWebhooks";
import { ApiError } from "@/lib/api";

const EVENTS = [
  { value: "DOMAIN_CHECK_COMPLETED", label: "Check completed" },
  { value: "DOMAIN_ISSUE_DETECTED", label: "Issue detected" },
  { value: "DOMAIN_CONFIGURATION_CHANGED", label: "Configuration changed" },
  { value: "DOMAIN_MONITORING_FAILED", label: "Monitoring failed" },
];

const schema = z.object({
  url: z.url("Enter a valid URL").refine((u) => u.startsWith("https://"), "Webhook URLs must use HTTPS"),
  events: z.array(z.string()).min(1, "Select at least one event"),
});
type FormValues = z.infer<typeof schema>;

export function Webhooks() {
  const { data, isLoading, isError, refetch } = useWebhooks();
  const createWebhook = useCreateWebhook();
  const deleteWebhook = useDeleteWebhook();
  const [showForm, setShowForm] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { events: ["DOMAIN_ISSUE_DETECTED"] } });

  const selectedEvents = watch("events");
  const toggleEvent = (event: string) => {
    const next = selectedEvents.includes(event) ? selectedEvents.filter((e) => e !== event) : [...selectedEvents, event];
    setValue("events", next);
  };

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      const result = await createWebhook.mutateAsync(values);
      setNewSecret(result.secret);
      reset();
      setShowForm(false);
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
    }
  };

  const copySecret = async () => {
    if (!newSecret) return;
    await navigator.clipboard.writeText(newSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Webhooks</h1>
          <p className="mt-1 text-sm text-paper-muted">Get a signed HTTP request when something changes.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" /> New webhook
        </Button>
      </div>

      {newSecret && (
        <Card className="mt-4 border-signal/40 bg-signal/5 p-5">
          <p className="text-sm font-medium text-ink">Copy your signing secret now — you won't be able to see it again.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="data-mono flex-1 truncate rounded-md border border-paper-border bg-white px-3 py-2 text-sm">{newSecret}</code>
            <Button variant="outline" size="sm" aria-label="Copy signing secret" onClick={copySecret}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-xs text-paper-muted">
            Use it to verify the <code className="data-mono">X-MailGuard-Signature</code> header on incoming deliveries.
          </p>
          <button className="mt-3 text-sm text-paper-muted hover:text-ink" onClick={() => setNewSecret(null)}>
            Done
          </button>
        </Card>
      )}

      {showForm && (
        <Card className="mt-4 p-5">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="url">Endpoint URL</Label>
              <Input id="url" placeholder="https://yourapp.com/webhooks/mailguard" {...register("url")} />
              {errors.url && <p className="mt-1 text-sm text-critical">{errors.url.message}</p>}
            </div>
            <div>
              <Label>Events</Label>
              <div className="grid grid-cols-2 gap-2">
                {EVENTS.map((e) => (
                  <button
                    type="button"
                    key={e.value}
                    onClick={() => toggleEvent(e.value)}
                    className={`rounded-md border px-3 py-2 text-left text-sm ${
                      selectedEvents.includes(e.value) ? "border-signal bg-signal/10 text-signal" : "border-paper-border text-ink"
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
              {errors.events && <p className="mt-1 text-sm text-critical">{errors.events.message}</p>}
            </div>
            {formError && <p className="text-sm text-critical">{formError}</p>}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create webhook"}
            </Button>
          </form>
        </Card>
      )}

      <div className="mt-6">
        {isLoading && <LoadingState />}
        {isError && <ErrorState message="Couldn't load webhooks." onRetry={() => refetch()} />}
        {data && data.webhooks.length === 0 && (
          <EmptyState title="No webhooks yet" description="Add one to get notified the moment an issue is detected." />
        )}
        {data && data.webhooks.length > 0 && (
          <ul className="space-y-2">
            {data.webhooks.map((webhook) => (
              <li key={webhook.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="data-mono truncate text-ink">{webhook.url}</CardTitle>
                    <Button variant="ghost" size="sm" aria-label={`Delete webhook ${webhook.url}`} onClick={() => deleteWebhook.mutate(webhook.id)}>
                      <Trash2 className="h-4 w-4 text-critical" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {webhook.events.map((e) => (
                        <Badge key={e} status="INFO">
                          {e.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
