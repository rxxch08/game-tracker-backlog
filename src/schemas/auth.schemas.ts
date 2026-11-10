import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .regex(/^[A-Za-z0-9_]{3,24}$/, "Username must be 3-24 characters: letters, digits or underscores"),
  email: z.string().trim().email("Invalid email address").max(254),
  // bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than silently truncated
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password is too long (72 bytes max)"),
});

export const loginSchema = z.object({
  // Either the username or the email
  identifier: z.string().trim().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;