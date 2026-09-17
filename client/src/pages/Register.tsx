import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegister } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .refine((p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p), "Include both letters and numbers"),
});

type FormValues = z.infer<typeof schema>;

export function Register() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      await registerMutation.mutateAsync(values);
      navigate("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("email", { message: "An account with this email already exists" });
      } else {
        setError("root", { message: err instanceof ApiError ? err.message : "Something went wrong" });
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <ShieldCheck className="h-5 w-5 text-signal" />
          <span className="font-semibold text-ink">MailGuard</span>
        </div>
        <h1 className="text-center text-xl font-semibold text-ink">Create your account</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && <p className="mt-1 text-sm text-critical">{errors.email.message}</p>}
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
            {errors.password && <p className="mt-1 text-sm text-critical">{errors.password.message}</p>}
          </div>
          {errors.root && <p className="text-sm text-critical">{errors.root.message}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-paper-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-signal hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
