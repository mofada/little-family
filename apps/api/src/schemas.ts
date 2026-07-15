import { z } from 'zod'

const optionalTrimmed = z.string().trim().max(100).optional().nullable()

export const loginSchema = z.union([
  z.object({ code: z.string().trim().min(1), devOpenid: z.never().optional() }),
  z.object({ devOpenid: z.string().trim().min(3).max(100), code: z.never().optional() }),
])

export const familySchema = z.object({
  name: z.string().trim().min(1).max(30),
  description: z.string().trim().max(200).optional().default(''),
})

export const memberSchema = z.object({
  branchName: z.string().trim().min(1).max(30),
  generation: z.number().int().min(1).max(20),
  name: z.string().trim().min(1).max(30),
  nickName: optionalTrimmed,
  relation: z.string().trim().max(20).optional().default(''),
  birthYear: z.number().int().min(1800).max(2200).nullable(),
  gender: z.enum(['male', 'female']),
  birthdayType: z.enum(['solar', 'lunar']),
  birthMonth: z.number().int().min(1).max(12),
  birthDay: z.number().int().min(1).max(31),
  isLeapMonth: z.boolean().optional().default(false),
  parentId: z.string().uuid().nullable().optional(),
  spouseId: z.string().uuid().nullable().optional(),
})

export const invitationSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']).default('editor'),
  maxUses: z.number().int().min(1).max(20).default(1),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(72),
})

export const linkMemberSchema = z.object({
  memberId: z.string().uuid().nullable(),
})
