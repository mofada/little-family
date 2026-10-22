import assert from 'node:assert/strict'
import {
  buildBirthdayWishPrompt,
  normalizeBirthdayWishSpacing,
  removeBirthdayWishAge,
} from '../src/birthdayWishPrompt'

const test = (name: string, run: () => void): void => {
  run()
  console.log(`✓ ${name}`)
}

const member = {
  name: '小兰',
  nickname: null,
  birth_year: 1995,
  gender: 'female' as const,
  birthday_type: 'lunar' as const,
  birth_month: 9,
  birth_day: 12,
  is_leap_month: 0,
}

test('祝福提示词只用实际年龄判断语气，不在正文展示', () => {
  const result = buildBirthdayWishPrompt(member, '姐', 2026, 0)
  assert.equal(result.age, 31)
  assert.match(result.prompt, /31岁只用于判断语气/)
  assert.match(result.prompt, /正文不得出现年龄/)
  assert.match(result.prompt, /年轻同辈：可用天天开心/)
  assert.match(result.prompt, /使用3—6行短句排版/)
  assert.match(result.prompt, /不得插入空行/)
  assert.match(result.prompt, /整体使用8—16个装饰符号/)
  assert.match(result.prompt, /年龄：31岁/)
})

test('不同表达路线会生成不同提示词', () => {
  const first = buildBirthdayWishPrompt(member, '姐', 2026, 0)
  const second = buildBirthdayWishPrompt(member, '姐', 2026, 1)
  assert.notEqual(first.prompt, second.prompt)
  assert.doesNotMatch(first.prompt, /生日新篇|解锁生日/)
  assert.doesNotMatch(second.prompt, /生日新篇|解锁生日/)
  assert.doesNotMatch(first.prompt, /田晓光|芊芊猪|果果小帅哥/)
})

test('换一条时会把最近文案作为避重材料', () => {
  const result = buildBirthdayWishPrompt(member, '姐', 2026, 2, [
    '㊗️姐生日快乐🎂\n平安喜乐，好运常在',
    '姐，生日快乐🎁\n愿你万事顺意',
  ])
  assert.match(result.prompt, /最近生成过的文案/)
  assert.match(result.prompt, /平安喜乐，好运常在/)
  assert.match(result.prompt, /必须更换开头方式、主体句式和核心祝福组合/)
})

test('稳定上下文排在随机组合和避重文案之前以提高缓存命中', () => {
  const result = buildBirthdayWishPrompt(member, '姐', 2026, 2, [
    '姐，生日快乐🎂\n平安喜乐，好运常在',
  ])
  const fixedRulesIndex = result.prompt.indexOf('固定要求：')
  const memberIndex = result.prompt.indexOf('生日的人：')
  const ageToneIndex = result.prompt.indexOf('年龄用词参考：')
  const directionIndex = result.prompt.indexOf('本次变化组合：')
  const recentWishesIndex = result.prompt.indexOf('避重要求：')
  const finalInstructionIndex = result.prompt.indexOf('请严格根据以上要求')

  assert.ok(fixedRulesIndex < memberIndex)
  assert.ok(memberIndex < ageToneIndex)
  assert.ok(ageToneIndex < directionIndex)
  assert.ok(directionIndex < recentWishesIndex)
  assert.ok(recentWishesIndex < finalInstructionIndex)
})

test('缺少出生年份时不猜测年龄', () => {
  const result = buildBirthdayWishPrompt({ ...member, birth_year: null }, '姐', 2026, 0)
  assert.equal(result.age, null)
  assert.match(result.prompt, /不要猜年龄/)
  assert.match(result.prompt, /年龄：未记录/)
})

test('有群内昵称时要求在开头保留@对象', () => {
  const result = buildBirthdayWishPrompt({ ...member, nickname: '芊芊猪' }, '姐', 2026, 0)
  assert.match(result.prompt, /“姐”“小兰姐”/)
  assert.match(result.prompt, /称呼后保留“@芊芊猪”/)
  assert.match(result.prompt, /群内@昵称：@芊芊猪/)
})

test('模型意外写出年龄时从最终祝福移除', () => {
  assert.equal(
    removeBirthdayWishAge('姐，31岁生日快乐🎂 今天好好享受属于你的热闹。', 31),
    '姐，生日快乐🎂 今天好好享受属于你的热闹。',
  )
  assert.equal(
    removeBirthdayWishAge('姐，31周岁生日快乐🎂', 31),
    '姐，生日快乐🎂',
  )
})

test('祝福正文会移除所有空行并统一换行符', () => {
  assert.equal(
    normalizeBirthdayWishSpacing('  姐，生日快乐🎂  \r\n\r\n   \r\n平安喜乐\n\n好运常在  '),
    '姐，生日快乐🎂\n平安喜乐\n好运常在',
  )
})
