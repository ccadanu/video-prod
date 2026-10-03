import { z } from 'zod';
import { ROLES } from './roles';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(8, 'Minimal 8 karakter').max(128);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(100),
  role: z.enum(ROLES),
  unit: z.string().trim().max(100).default(''),
  jabatan: z.string().trim().max(100).default(''),
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    role: z.enum(ROLES),
    unit: z.string().trim().max(100),
    jabatan: z.string().trim().max(100),
    active: z.boolean(),
  })
  .partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ newPassword: passwordSchema });

/** Bentuk pengguna yang dikirim ke klien (tanpa hash password). */
export interface UserDto {
  id: number;
  email: string;
  name: string;
  role: (typeof ROLES)[number];
  unit: string;
  jabatan: string;
  active: boolean;
}
