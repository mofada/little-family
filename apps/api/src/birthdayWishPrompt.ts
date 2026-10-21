export interface BirthdayWishMember {
  name: string
  nickname: string | null
  birth_year: number | null
  gender: 'male' | 'female' | 'unknown'
  birthday_type: 'solar' | 'lunar' | null
  birth_month: number | null
  birth_day: number | null
  is_leap_month: number
}

const writingDirections = [
  '经典群祝福：称呼和生日快乐各占一行，主要从平安喜乐、万事顺遂、岁岁长安中组合。',
  '花体开场：先用花体英文 Happy Birthday，再主要写所念皆如愿、所行皆坦途、好事正酿；不要使用“天天开心、事事顺意”。',
  '好运接龙：围绕接好运、挡烦恼、福气常在组织三行有节奏的短句。',
  '平安生财：围绕平安喜乐、顺心如意、财旺福旺组合，读起来干脆热闹。',
  '被爱发光：围绕开心、被爱、闪闪发光、好运常在组合，语气明亮。',
  '生日新篇：用“解锁生日新篇”开场，主要写一路有花、常有惊喜、好事发生；不要使用“天天开心、事事顺意、闪闪发光”。',
] as const

const formatBirthday = (member: BirthdayWishMember): string => {
  if (!member.birthday_type || member.birth_month === null || member.birth_day === null) return '未记录'
  const calendar = member.birthday_type === 'lunar'
    ? `农历${member.is_leap_month ? '闰' : ''}`
    : '阳历'
  return `${calendar}${member.birth_month}月${member.birth_day}日`
}

const describeAgeTone = (age: number | null): string => {
  if (age === null) return '年龄不明，使用平安喜乐、顺心如意、好运常在等普适祝福。'
  if (age < 13) return '儿童：可用健康快乐、勇敢自在、眼里有光、快乐成长等词，不写工作或财富。'
  if (age < 18) return '少年：可用开心自信、勇敢追梦、一路有光等词，不说教、不催成绩。'
  if (age < 36) return '年轻同辈：可用天天开心、事事顺意、闪闪发光、发财被爱、好运常在等词。'
  if (age < 60) return '成年家人：可用平安喜乐、工作顺利、步步生财、万事兴荣、福旺运旺等词。'
  return '长辈：以健康、平安、幸福、顺心、福气常在为主，不写工作、升级或年龄玩笑。'
}

export const buildBirthdayWishPrompt = (
  member: BirthdayWishMember,
  relationLabel: string,
  currentYear: number,
  directionIndex = Math.floor(Math.random() * writingDirections.length),
): { prompt: string; age: number | null } => {
  const age = member.birth_year === null ? null : currentYear - member.birth_year
  const direction = writingDirections[((directionIndex % writingDirections.length) + writingDirections.length)
    % writingDirections.length]
  const ageInstruction = age === null
    ? '没有可靠年龄，不要猜年龄，也不要写“年龄未知”。'
    : `已提供的${age}岁只用于判断语气，正文不得出现年龄、出生年份或“几岁”等年龄信息。`
  const mention = member.nickname ? `@${member.nickname}` : '未记录，不要编造@昵称'
  const combinedAddress = `${member.name}${relationLabel || '家人'}`

  return {
    age,
    prompt: `请写一条可以直接发到家族微信群的生日祝福。目标风格是家族群里热闹、喜庆、有排面的短句祝福，不写成小作文。

本次排版路线：${direction}
年龄用词参考：${describeAgeTone(age)}

硬性要求：
- 使用3—6行短句排版；每行简短顺口，可以对仗或押一点节奏，不写解释性长句。
- 开头称呼从“${relationLabel || '家人'}”“${combinedAddress}”中选择更自然的一个，并写成“㊗️称呼${member.nickname ? `@${member.nickname}` : ''}”；也可以先放花体生日英文。昵称未记录时绝不能编造@对象。
- 必须有“生日快乐”，蛋糕可以连续放3—6个，整体使用8—16个装饰符号，允许适度重复以营造家族群气氛。
- 从 [蛋糕][庆祝][礼物][红包][發][福][太阳][烟花][爱心][加油] 中自然选用2—6个微信表情，可搭配🎂🎁🎊🥳❤️🍻🌈✨等 emoji。
- 祝福使用两到三组简短吉利话，可以使用四字祝福；同一条里不要把所有好词全部堆上。
- ${ageInstruction}
- 不得编造职业、性格、近况、共同回忆或“大忙人”等输入中没有的信息；没有职业信息时不要擅自写“工作顺利”。
- 不要照抄参考文案中的完整句子，不要加解释、引号、署名或 Markdown 代码块。

风格参考（只模仿排版、节奏和热闹程度，不要逐句照抄）：
㊗️姐夫@田晓光
生日快乐🎂🎂🎂🎂
接住所有好运[福][福]
挡掉所有磨难[太阳][太阳]
财源滚滚，岁岁长安

𝐻ᵅᵖᵖʸ𝐵ⁱʳᵗʰᵈᵅʸ ᵕ̈🎂🎁🎊
㊗️丽姐姐@芊芊猪
生日快乐🎂🎂🎂🎂🎂
天天开心🥰事事顺意❤️
永远闪闪发光[庆祝][礼物][红包][發]

㊗️果果小帅哥
生日快乐(＾◡＾)っ🎂🍰🍰
平安喜乐[庆祝]健康快乐[太阳]
勇敢自在[加油]永远眼里有光🌈

生日的人：
姓名：${member.name}${member.nickname ? `（${member.nickname}）` : ''}
称呼：${relationLabel || '家人'}
群内@昵称：${mention}
性别：${member.gender === 'male' ? '男' : member.gender === 'female' ? '女' : '未知'}
年龄：${age === null ? '未记录' : `${age}岁`}
生日：${formatBirthday(member)}`,
  }
}

export const removeBirthdayWishAge = (wish: string, age: number | null): string => {
  if (age === null) return wish
  return wish.replace(new RegExp(`${age}\\s*(?:周)?岁`, 'g'), '').replace(/ {2,}/g, ' ').trim()
}
