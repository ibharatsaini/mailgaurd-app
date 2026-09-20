import { Navigate } from "react-router";
import { useCurrentUser } from "@/hooks/useAuth";
import { LoadingState } from "@/components/ui/states";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useCurrentUser();

  if (isLoading) return <LoadingState label="Checking session…" />;
  if (isError || !data?.user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
