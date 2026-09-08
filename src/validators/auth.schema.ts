import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Must be a valid email address")
    .max(255),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128)
    .refine(
      (p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p),
      "Password must contain both letters and numbers",
    ),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required").max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
