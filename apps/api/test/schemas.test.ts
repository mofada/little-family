import assert from 'node:assert/strict'
import { legacyFamilyImportSchema, memberSchema, wechatWebLoginSchema, webLoginSchema } from '../src/schemas'
import { getBeijingClock } from '../src/birthdayClock'
import { inferKinshipLabel, type KinshipMember, type KinshipRelationship } from '../src/kinship'

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

test('按当前用户关联成员推断基础亲属称呼', () => {
  const members: KinshipMember[] = [
    { id: 'me', gender: 'male', birth_year: 1990, relation_label: '我' },
    { id: 'father', gender: 'male', birth_year: 1960, relation_label: '父亲' },
    { id: 'mother', gender: 'female', birth_year: 1962, relation_label: '母亲' },
    { id: 'wife', gender: 'female', birth_year: 1991, relation_label: '老婆' },
    { id: 'son', gender: 'male', birth_year: 2020, relation_label: '儿子' },
    { id: 'sister', gender: 'female', birth_year: 1988, relation_label: '姐姐' },
  ]
  const relationships: KinshipRelationship[] = [
    { from_member_id: 'father', to_member_id: 'me', type: 'parent' },
    { from_member_id: 'mother', to_member_id: 'me', type: 'parent' },
    { from_member_id: 'father', to_member_id: 'sister', type: 'parent' },
    { from_member_id: 'me', to_member_id: 'wife', type: 'spouse' },
    { from_member_id: 'me', to_member_id: 'son', type: 'parent' },
  ]

  assert.equal(inferKinshipLabel('me', 'me', members, relationships), '自己')
  assert.equal(inferKinshipLabel('me', 'father', members, relationships), '爸爸')
  assert.equal(inferKinshipLabel('me', 'mother', members, relationships), '妈妈')
  assert.equal(inferKinshipLabel('me', 'wife', members, relationships), '妻子')
  assert.equal(inferKinshipLabel('me', 'son', members, relationships), '儿子')
  assert.equal(inferKinshipLabel('me', 'sister', members, relationships), '姐姐')
})

test('同一成员在不同用户视角下得到不同称呼', () => {
  const members: KinshipMember[] = [
    { id: 'grandpa', gender: 'male', birth_year: 1935, relation_label: '爷爷' },
    { id: 'father', gender: 'male', birth_year: 1960, relation_label: '爸爸' },
    { id: 'me', gender: 'female', birth_year: 1990, relation_label: '我' },
    { id: 'child', gender: 'male', birth_year: 2018, relation_label: '儿子' },
  ]
  const relationships: KinshipRelationship[] = [
    { from_member_id: 'grandpa', to_member_id: 'father', type: 'parent' },
    { from_member_id: 'father', to_member_id: 'me', type: 'parent' },
    { from_member_id: 'me', to_member_id: 'child', type: 'parent' },
  ]

  assert.equal(inferKinshipLabel('me', 'grandpa', members, relationships), '爷爷')
  assert.equal(inferKinshipLabel('child', 'grandpa', members, relationships), '曾外祖父')
  assert.equal(inferKinshipLabel('grandpa', 'child', members, relationships), '曾孙')
})

test('未关联当前成员时保留旧称呼作为备用显示', () => {
  const members: KinshipMember[] = [
    { id: 'relative', gender: 'unknown', birth_year: null, relation_label: '老家亲戚' },
  ]

  assert.equal(inferKinshipLabel(null, 'relative', members, []), '老家亲戚')
})

test('配偶夹在血亲路径中时输出短称呼', () => {
  const members: KinshipMember[] = [
    { id: 'me', gender: 'male', birth_year: 1990, relation_label: '我' },
    { id: 'dad', gender: 'male', birth_year: 1960, relation_label: '爸爸' },
    { id: 'sister', gender: 'female', birth_year: 1988, relation_label: '姐姐' },
    { id: 'brotherInLaw', gender: 'male', birth_year: 1987, relation_label: '姐夫' },
    { id: 'nephew', gender: 'male', birth_year: 2016, relation_label: '' },
    { id: 'niece', gender: 'female', birth_year: 2018, relation_label: '' },
  ]
  const relationships: KinshipRelationship[] = [
    { from_member_id: 'dad', to_member_id: 'me', type: 'parent' },
    { from_member_id: 'dad', to_member_id: 'sister', type: 'parent' },
    { from_member_id: 'sister', to_member_id: 'brotherInLaw', type: 'spouse' },
    { from_member_id: 'brotherInLaw', to_member_id: 'nephew', type: 'parent' },
    { from_member_id: 'brotherInLaw', to_member_id: 'niece', type: 'parent' },
  ]

  assert.equal(inferKinshipLabel('me', 'nephew', members, relationships), '外甥')
  assert.equal(inferKinshipLabel('me', 'niece', members, relationships), '外甥女')
})

test('表亲的子女不再显示整条关系路径', () => {
  const members: KinshipMember[] = [
    { id: 'me', gender: 'female', birth_year: 1990, relation_label: '我' },
    { id: 'mom', gender: 'female', birth_year: 1962, relation_label: '妈妈' },
    { id: 'grandma', gender: 'female', birth_year: 1938, relation_label: '外婆' },
    { id: 'aunt', gender: 'female', birth_year: 1965, relation_label: '姨妈' },
    { id: 'auntHusband', gender: 'male', birth_year: 1963, relation_label: '姨父' },
    { id: 'cousin', gender: 'male', birth_year: 1992, relation_label: '' },
    { id: 'cousinChild', gender: 'female', birth_year: 2022, relation_label: '' },
  ]
  const relationships: KinshipRelationship[] = [
    { from_member_id: 'grandma', to_member_id: 'mom', type: 'parent' },
    { from_member_id: 'mom', to_member_id: 'me', type: 'parent' },
    { from_member_id: 'grandma', to_member_id: 'aunt', type: 'parent' },
    { from_member_id: 'aunt', to_member_id: 'auntHusband', type: 'spouse' },
    { from_member_id: 'auntHusband', to_member_id: 'cousin', type: 'parent' },
    { from_member_id: 'cousin', to_member_id: 'cousinChild', type: 'parent' },
  ]

  assert.equal(inferKinshipLabel('me', 'cousinChild', members, relationships), '表侄女')
})

test('配偶侧晚辈使用短称呼', () => {
  const members: KinshipMember[] = [
    { id: 'me', gender: 'male', birth_year: 1990, relation_label: '我' },
    { id: 'wife', gender: 'female', birth_year: 1991, relation_label: '妻子' },
    { id: 'wifeDad', gender: 'male', birth_year: 1960, relation_label: '岳父' },
    { id: 'wifeSister', gender: 'female', birth_year: 1988, relation_label: '' },
    { id: 'wifeNiece', gender: 'female', birth_year: 2016, relation_label: '' },
  ]
  const relationships: KinshipRelationship[] = [
    { from_member_id: 'me', to_member_id: 'wife', type: 'spouse' },
    { from_member_id: 'wifeDad', to_member_id: 'wife', type: 'parent' },
    { from_member_id: 'wifeDad', to_member_id: 'wifeSister', type: 'parent' },
    { from_member_id: 'wifeSister', to_member_id: 'wifeNiece', type: 'parent' },
  ]

  assert.equal(inferKinshipLabel('me', 'wifeNiece', members, relationships), '妻子的外甥女')
})
