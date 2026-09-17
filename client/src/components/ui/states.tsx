import { Loader2, Inbox, AlertTriangle } from "lucide-react";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-signal ${className}`} />;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-paper-muted">
      <Spinner className="h-6 w-6" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-paper-border py-16 text-center">
      <Inbox className="h-8 w-8 text-paper-muted" />
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm text-paper-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-critical/30 bg-critical/5 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-critical" />
      <div>
        <p className="font-medium text-ink">Something went wrong</p>
        <p className="mt-1 text-sm text-paper-muted">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="text-sm font-medium text-signal hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}
