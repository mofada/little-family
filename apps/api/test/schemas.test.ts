import assert from 'node:assert/strict'
import { memberSchema } from '../src/schemas'

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
