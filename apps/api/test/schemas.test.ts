import assert from 'node:assert/strict'
import {
  birthdayWishRequestSchema,
  legacyFamilyImportSchema,
  memberSchema,
  wechatWebLoginSchema,
  webLoginSchema,
} from '../src/schemas'
import { getBeijingClock } from '../src/birthdayClock'

const test = (name: string, run: () => void): void => {
  run()
  console.log(`✓ ${name}`)
}

const baseMember = {
  name: '小明',
  nickName: null,
  relation: '',
  birthYear: null,
  gender: 'unknown' as const,
  birthdayType: null,
  birthMonth: null,
  birthDay: null,
  isLeapMonth: false,
  parentIds: [] as string[],
  spouseId: null,
}

test('成员只填写姓名也可以保存', () => {
  const parsed = memberSchema.parse(baseMember)
  assert.equal(parsed.name, '小明')
  assert.equal(parsed.birthdayType, null)
  assert.deepEqual(parsed.parentIds, [])
})

test('完整生日的三个字段必须同时填写', () => {
  const result = memberSchema.safeParse({
    ...baseMember,
    birthdayType: 'solar',
    birthMonth: 5,
  })
  assert.equal(result.success, false)
})

test('最多维护两位且不能重复父母', () => {
  const parentId = '11111111-1111-4111-8111-111111111111'
  const duplicate = memberSchema.safeParse({ ...baseMember, parentIds: [parentId, parentId] })
  assert.equal(duplicate.success, false)

  const tooMany = memberSchema.safeParse({
    ...baseMember,
    parentIds: [
      parentId,
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ],
  })
  assert.equal(tooMany.success, false)
})

test('拒绝不存在的公历日期和农历三十一日', () => {
  const invalidSolar = memberSchema.safeParse({
    ...baseMember,
    birthdayType: 'solar',
    birthMonth: 2,
    birthDay: 30,
  })
  assert.equal(invalidSolar.success, false)

  const invalidLunar = memberSchema.safeParse({
    ...baseMember,
    birthdayType: 'lunar',
    birthMonth: 1,
    birthDay: 31,
  })
  assert.equal(invalidLunar.success, false)
})

test('生日任务始终按北京时间计算日期和八点', () => {
  const clock = getBeijingClock(new Date('2026-07-15T00:00:00.000Z'))
  assert.equal(clock.localDate, '2026-07-15')
  assert.equal(clock.hour, 8)
  assert.equal(clock.month, 7)
  assert.equal(clock.day, 15)
})

test('旧数据导入校验成员引用并允许关联当前用户', () => {
  const parsed = legacyFamilyImportSchema.parse({
    linkedLegacyId: 'child',
    members: [
      { ...baseMember, id: 'parent', name: '家长', parentId: null, spouseId: null },
      { ...baseMember, id: 'child', name: '孩子', parentId: 'parent', spouseId: null },
    ],
  })
  assert.equal(parsed.members.length, 2)
  assert.equal(parsed.linkedLegacyId, 'child')

  const missingReference = legacyFamilyImportSchema.safeParse({
    members: [{ ...baseMember, id: 'child', parentId: 'missing', spouseId: null }],
  })
  assert.equal(missingReference.success, false)
})

test('网页登录码拒绝过短输入', () => {
  assert.equal(webLoginSchema.safeParse({ code: 'short' }).success, false)
  assert.equal(webLoginSchema.safeParse({ code: 'abcdefgh1234' }).success, true)
})

test('微信网站回调同时要求 code 和长随机 state', () => {
  assert.equal(wechatWebLoginSchema.safeParse({ code: 'wx-code', state: 'short' }).success, false)
  assert.equal(wechatWebLoginSchema.safeParse({
    code: 'wx-code',
    state: 'a-secure-random-state-value',
  }).success, true)
})

test('生日祝福避重上下文最多接收三条短文案', () => {
  assert.deepEqual(birthdayWishRequestSchema.parse({}).previousWishes, [])
  assert.equal(birthdayWishRequestSchema.safeParse({
    previousWishes: ['第一条', '第二条', '第三条'],
  }).success, true)
  assert.equal(birthdayWishRequestSchema.safeParse({
    previousWishes: ['一', '二', '三', '四'],
  }).success, false)
  assert.equal(birthdayWishRequestSchema.safeParse({
    previousWishes: ['字'.repeat(1001)],
  }).success, false)
})
