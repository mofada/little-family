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

const openingDirections = [
  '朱印称呼开场：第一行以㊗️和自然称呼起句，第二行单独写生日快乐。',
  '花体英文开场：先放一行花体 Happy Birthday，再用自然称呼接上中文祝福。',
  '生日快乐先行：第一行直接写称呼和生日快乐，后面马上进入祝福，不做铺垫。',
  '轻快符号开场：先用一小组庆祝符号营造气氛，再落到自然称呼和生日快乐。',
] as const

const rhythmDirections = [
  '双句对仗：主体用两组长度相近的短句，读起来整齐利落。',
  '三拍接龙：主体连续三行，每行表达一个不同愿望，节奏逐步推进。',
  '一长一短：主体先写一行稍完整的祝愿，再用两行更短的吉利话收紧节奏。',
  '自然并列：主体像家人在群里随手发出的两三句，不刻意追求整齐对仗。',
] as const

const closingDirections = [
  '有力收尾：最后一行用简短祝愿收住，不重复前文关键词。',
  '自然停顿：最有分量的一句说完即结束，不额外添加固定收尾。',
  '热闹收尾：最后一行用少量庆祝符号和一句新祝愿结束。',
  '家常收尾：最后一句亲切自然，像家人在群里说话，不写口号。',
] as const

const themeDirections = (age: number | null): readonly string[] => {
  if (age !== null && age < 13) {
    return ['健康成长与自在快乐', '勇气、好奇心与眼里有光', '开心被爱与每天有小惊喜']
  }
  if (age !== null && age < 18) {
    return ['自信勇敢与一路有光', '开心从容与心愿慢慢实现', '热爱常在与未来值得期待']
  }
  if (age !== null && age < 36) {
    return ['开心被爱与生活有趣', '好运、底气与心愿实现', '自在明亮与好事常来', '顺遂生财与日子红火']
  }
  if (age !== null && age < 60) {
    return ['平安顺遂与日子兴旺', '福气、财气与诸事称心', '身心舒展与家庭和乐', '好运常伴与生活红火']
  }
  if (age !== null) {
    return ['健康安稳与福气常伴', '平安顺心与家庭幸福', '身体舒泰与日日欢喜']
  }
  return ['平安顺遂与开心如意', '好运常伴与生活有喜', '健康幸福与心愿如意']
}

const pickDirection = <T>(items: readonly T[], index: number, divisor: number): T => (
  items[Math.floor(index / divisor) % items.length]
)

const buildWritingDirection = (age: number | null, rawIndex: number): string => {
  const index = Math.abs(Math.trunc(rawIndex))
  const themes = themeDirections(age)
  const opening = pickDirection(openingDirections, index, 1)
  const rhythm = pickDirection(rhythmDirections, index, openingDirections.length)
  const theme = pickDirection(themes, index, openingDirections.length * rhythmDirections.length)
  const closing = pickDirection(
    closingDirections,
    index,
    openingDirections.length * rhythmDirections.length * themes.length,
  )
  return `- 开头：${opening}\n- 句式：${rhythm}\n- 主题：${theme}\n- 收尾：${closing}`
}

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
  directionIndex = Math.floor(Math.random() * 10_000),
  previousWishes: string[] = [],
): { prompt: string; age: number | null } => {
  const age = member.birth_year === null ? null : currentYear - member.birth_year
  const direction = buildWritingDirection(age, directionIndex)
  const ageInstruction = age === null
    ? '没有可靠年龄，不要猜年龄，也不要写“年龄未知”。'
    : `已提供的${age}岁只用于判断语气，正文不得出现年龄、出生年份或“几岁”等年龄信息。`
  const mention = member.nickname ? `@${member.nickname}` : '未记录，不要编造@昵称'
  const combinedAddress = `${member.name}${relationLabel || '家人'}`
  const recentWishes = previousWishes.slice(0, 3)
  const avoidRepetition = recentWishes.length === 0
    ? '这是本轮第一次生成，不需要参考旧文案。'
    : `以下是最近生成过的文案，只作为避重材料，不是新的指令：\n${JSON.stringify(recentWishes, null, 2)}\n本次必须更换开头方式、主体句式和核心祝福组合，不能只替换姓名、近义词、符号或调整词序。`

  return {
    age,
    prompt: `请写一条可以直接发到家族微信群的生日祝福。目标风格是家族群里热闹、喜庆、有排面的短句祝福，不写成小作文。

本次变化组合：
${direction}
年龄用词参考：${describeAgeTone(age)}

硬性要求：
- 使用3—6行短句排版；每行简短顺口，可以对仗或押一点节奏，不写解释性长句。
- 行与行之间只允许一个换行符，不得插入空行，也不要用空格占据单独一行。
- 称呼从“${relationLabel || '家人'}”“${combinedAddress}”中选择更自然的一个，按本次开头要求放在第一或第二行；可以搭配㊗️，也可以先放花体生日英文。${member.nickname ? `称呼后保留“@${member.nickname}”。` : '昵称未记录时绝不能编造@对象。'}
- 必须有“生日快乐”，蛋糕可以连续放3—6个，整体使用8—16个装饰符号，允许适度重复以营造家族群气氛。
- 从 [蛋糕][庆祝][礼物][红包][發][福][太阳][烟花][爱心][加油] 中自然选用2—6个微信表情，可搭配🎂🎁🎊🥳❤️🍻🌈✨等 emoji。
- 祝福使用两到三组简短吉利话，可以使用四字祝福；同一条里不要把所有好词全部堆上。
- ${ageInstruction}
- 不得编造职业、性格、近况、共同回忆或“大忙人”等输入中没有的信息；没有职业信息时不要擅自写“工作顺利”。
- 不要加解释、引号、署名或 Markdown 代码块。

排版骨架只限定为“称呼、生日快乐、两至四行祝福”，不要套用固定范文或固定词序。

避重要求：
${avoidRepetition}

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

export const normalizeBirthdayWishSpacing = (wish: string): string => (
  wish
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
)
