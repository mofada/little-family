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
  name: z.string().trim().min(1).max(30),
  nickName: optionalTrimmed,
  relation: z.string().trim().max(20).optional().default(''),
  birthYear: z.number().int().min(1800).max(2200).nullable(),
  gender: z.enum(['male', 'female', 'unknown']),
  birthdayType: z.enum(['solar', 'lunar']).nullable(),
  birthMonth: z.number().int().min(1).max(12).nullable(),
  birthDay: z.number().int().min(1).max(31).nullable(),
  isLeapMonth: z.boolean().optional().default(false),
  parentIds: z.array(z.string().uuid()).max(2).optional().default([]),
  spouseId: z.string().uuid().nullable().optional(),
}).superRefine((input, context) => {
  const birthdayParts = [input.birthdayType, input.birthMonth, input.birthDay]
  const hasSomeBirthday = birthdayParts.some(value => value !== null)
  const hasFullBirthday = birthdayParts.every(value => value !== null)
  if (hasSomeBirthday && !hasFullBirthday) {
    context.addIssue({ code: 'custom', message: '生日历法、月份和日期需要同时填写', path: ['birthdayType'] })
  }
  if (hasFullBirthday && input.birthdayType === 'solar') {
    const year = input.birthYear ?? 2000
    const date = new Date(year, input.birthMonth! - 1, input.birthDay!)
    if (date.getFullYear() !== year || date.getMonth() !== input.birthMonth! - 1 || date.getDate() !== input.birthDay) {
      context.addIssue({ code: 'custom', message: '公历生日日期无效', path: ['birthDay'] })
    }
  }
  if (hasFullBirthday && input.birthdayType === 'lunar' && input.birthDay! > 30) {
    context.addIssue({ code: 'custom', message: '农历日期不能超过三十', path: ['birthDay'] })
  }
  if (new Set(input.parentIds).size !== input.parentIds.length) {
    context.addIssue({ code: 'custom', message: '父母不能重复', path: ['parentIds'] })
  }
})

export const invitationSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']).default('editor'),
  maxUses: z.number().int().min(1).max(20).default(1),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(72),
})

export const linkMemberSchema = z.object({
  memberId: z.string().uuid().nullable(),
})
