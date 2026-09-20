import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { useCurrentUser } from "@/hooks/useAuth";

export function Account() {
  const { data, isLoading, isError, refetch } = useCurrentUser();

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState message="Couldn't load your account." onRetry={() => refetch()} />;

  const { user } = data;

  return (
    <div>
      <h1 className="text-xl font-semibold text-ink">Account</h1>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between border-b border-paper-border pb-3">
            <span className="text-sm text-paper-muted">Email</span>
            <span className="text-sm text-ink">{user.email}</span>
          </div>
          <div className="flex items-center justify-between border-b border-paper-border pb-3">
            <span className="text-sm text-paper-muted">Plan</span>
            <Badge status={user.plan === "PRO" ? "HEALTHY" : "UNKNOWN"}>{user.plan}</Badge>
          </div>
          <div className="flex items-center justify-between pb-1">
            <span className="text-sm text-paper-muted">Member since</span>
            <span className="text-sm text-ink">{new Date(user.createdAt).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>

      {user.plan === "FREE" && (
        <Card className="mt-4 border-signal/30 bg-signal/5">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-ink">You're on the free plan</p>
            <p className="mt-1 text-sm text-paper-muted">
              Free plans include up to 5 domains and hourly monitoring. Upgrade for more domains and faster checks.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
