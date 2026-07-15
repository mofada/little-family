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

const legacyMemberSchema = z.object({
  id: z.string().trim().min(1).max(100),
  parentId: z.string().trim().min(1).max(100).nullable().optional().default(null),
  spouseId: z.string().trim().min(1).max(100).nullable().optional().default(null),
  // 旧版展示字段仅用于兼容输入，当前模型会根据关系重新推导代际且不保存家族分支。
  familyName: z.string().trim().max(30).optional(),
  generation: z.number().int().min(1).max(20).optional(),
  name: z.string().trim().min(1).max(30),
  nickName: optionalTrimmed,
  relation: z.string().trim().max(20).optional().default(''),
  birthYear: z.number().int().min(1800).max(2200).nullable(),
  gender: z.enum(['male', 'female', 'unknown']),
  birthdayType: z.enum(['solar', 'lunar']).nullable(),
  birthMonth: z.number().int().min(1).max(12).nullable(),
  birthDay: z.number().int().min(1).max(31).nullable(),
  isLeapMonth: z.boolean().optional().default(false),
}).superRefine((input, context) => {
  const parsed = memberSchema.safeParse({
    ...input,
    parentIds: [],
    spouseId: null,
  })
  if (!parsed.success) {
    parsed.error.issues.forEach(issue => context.addIssue({
      code: 'custom',
      message: issue.message,
      path: issue.path,
    }))
  }
})

export const legacyFamilyImportSchema = z.object({
  members: z.array(legacyMemberSchema).min(1).max(500),
  linkedLegacyId: z.string().trim().min(1).max(100).optional(),
}).superRefine((input, context) => {
  const ids = new Set<string>()
  input.members.forEach((member, index) => {
    if (ids.has(member.id)) {
      context.addIssue({ code: 'custom', message: `旧成员 ID 重复：${member.id}`, path: ['members', index, 'id'] })
    }
    ids.add(member.id)
  })

  input.members.forEach((member, index) => {
    if (member.parentId && !ids.has(member.parentId)) {
      context.addIssue({ code: 'custom', message: `父母 ID 不存在：${member.parentId}`, path: ['members', index, 'parentId'] })
    }
    if (member.spouseId && !ids.has(member.spouseId)) {
      context.addIssue({ code: 'custom', message: `配偶 ID 不存在：${member.spouseId}`, path: ['members', index, 'spouseId'] })
    }
    if (member.parentId === member.id || member.spouseId === member.id) {
      context.addIssue({ code: 'custom', message: '成员不能关联自己', path: ['members', index] })
    }
  })

  const byId = new Map(input.members.map(member => [member.id, member]))
  input.members.forEach((member, index) => {
    if (!member.spouseId) return
    const reverse = byId.get(member.spouseId)?.spouseId
    if (reverse && reverse !== member.id) {
      context.addIssue({ code: 'custom', message: `配偶关系冲突：${member.id}、${member.spouseId}`, path: ['members', index, 'spouseId'] })
    }
  })

  if (input.linkedLegacyId && !ids.has(input.linkedLegacyId)) {
    context.addIssue({ code: 'custom', message: '要关联到登录用户的旧成员 ID 不存在', path: ['linkedLegacyId'] })
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

export const birthdaySubscriptionSchema = z.object({
  templateId: z.string().trim().min(1).max(100),
})
