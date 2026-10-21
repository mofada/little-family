export type KinshipAgeComparison = 'older' | 'younger' | 'same-birthday' | 'unknown'

export interface KinshipRuleStep {
  relation: string
  ageComparison?: KinshipAgeComparison
}

const parentRelations = new Set(['爸爸', '妈妈'])
const childRelations = new Set(['儿子', '女儿'])
const spouseRelations = new Set(['丈夫', '妻子'])

const sameGenerationLabel = (
  relation: string,
  ageComparison: KinshipAgeComparison | undefined,
  prefix = '',
): string => {
  if (ageComparison !== 'older' && ageComparison !== 'younger') return '亲友'
  if (!prefix) {
    if (relation === '儿子') return ageComparison === 'older' ? '哥哥' : '弟弟'
    return ageComparison === 'older' ? '姐姐' : '妹妹'
  }
  if (relation === '儿子') return `${prefix}${ageComparison === 'older' ? '兄' : '弟'}`
  return `${prefix}${ageComparison === 'older' ? '姐' : '妹'}`
}

const cousinPrefix = (steps: KinshipRuleStep[], upCount: number): '堂' | '表' => {
  const viewerBranch = steps[upCount - 2]?.relation
  const targetBranch = steps[upCount]?.relation
  return viewerBranch === '爸爸' && targetBranch === '儿子' ? '堂' : '表'
}

const resolveAncestor = (relations: string[]): string | null => {
  const key = relations.join('>')
  const labels: Record<string, string> = {
    '爸爸': '爸爸',
    '妈妈': '妈妈',
    '爸爸>爸爸': '爷爷',
    '爸爸>妈妈': '奶奶',
    '妈妈>爸爸': '外公',
    '妈妈>妈妈': '外婆',
    '爸爸>爸爸>爸爸': '曾祖父',
    '爸爸>爸爸>妈妈': '曾祖母',
    '爸爸>妈妈>爸爸': '外曾祖父',
    '爸爸>妈妈>妈妈': '外曾祖母',
    '妈妈>爸爸>爸爸': '外曾祖父',
    '妈妈>爸爸>妈妈': '外曾祖母',
    '妈妈>妈妈>爸爸': '外曾外祖父',
    '妈妈>妈妈>妈妈': '外曾外祖母',
  }
  return labels[key] ?? null
}

const spouseLabel = (base: string, spouseRelation: string): string | null => {
  const labels: Record<string, string> = {
    '爸爸>妻子': '妈妈',
    '妈妈>丈夫': '爸爸',
    '爷爷>妻子': '奶奶',
    '外公>妻子': '外婆',
    '曾祖父>妻子': '曾祖母',
    '外曾祖父>妻子': '外曾祖母',
    '外曾外祖父>妻子': '外曾外祖母',
    '儿子>妻子': '儿媳',
    '女儿>丈夫': '女婿',
    '孙子>妻子': '孙媳妇',
    '孙女>丈夫': '孙女婿',
    '外孙>妻子': '外孙媳妇',
    '外孙女>丈夫': '外孙女婿',
    '哥哥>妻子': '嫂',
    '弟弟>妻子': '弟媳',
    '姐姐>丈夫': '姐夫',
    '妹妹>丈夫': '妹夫',
    '侄>妻子': '侄媳',
    '侄女>丈夫': '侄女婿',
    '外甥>妻子': '外甥媳妇',
    '外甥女>丈夫': '外甥女婿',
    '堂兄>妻子': '堂嫂',
    '堂弟>妻子': '堂弟媳',
    '堂姐>丈夫': '堂姐夫',
    '堂妹>丈夫': '堂妹夫',
    '表兄>妻子': '表嫂',
    '表弟>妻子': '表弟媳',
    '表姐>丈夫': '表姐夫',
    '表妹>丈夫': '表妹夫',
    '伯父>妻子': '伯母',
    '叔父>妻子': '婶母',
    '姑母>丈夫': '姑父',
    '舅父>妻子': '舅母',
    '姨母>丈夫': '姨父',
    '伯祖父>妻子': '伯祖母',
    '叔祖父>妻子': '叔祖母',
    '姑祖母>丈夫': '姑祖父',
    '舅祖父>妻子': '舅祖母',
    '姨祖母>丈夫': '姨祖父',
    '堂舅父>妻子': '堂舅母',
    '表舅父>妻子': '表舅母',
    '堂姨母>丈夫': '堂姨父',
    '表姨母>丈夫': '表姨父',
  }
  return labels[`${base}>${spouseRelation}`] ?? null
}

const resolveSpouseFamily = (steps: KinshipRuleStep[]): string => {
  const spouse = steps[0]?.relation
  const relations = steps.map(step => step.relation)
  if (relations.length === 2 && parentRelations.has(relations[1])) {
    if (spouse === '妻子') return relations[1] === '爸爸' ? '岳父' : '岳母'
    return relations[1] === '爸爸' ? '公公' : '婆婆'
  }
  if (relations.length === 3
    && parentRelations.has(relations[1])
    && childRelations.has(relations[2])) {
    const age = steps[2]?.ageComparison
    if (age !== 'older' && age !== 'younger') return '亲友'
    if (spouse === '妻子') {
      if (relations[2] === '儿子') return age === 'older' ? '内兄' : '内弟'
      return age === 'older' ? '姨姐' : '姨妹'
    }
    if (relations[2] === '儿子') return age === 'older' ? '大伯子' : '小叔子'
    return age === 'older' ? '大姑子' : '小姑子'
  }
  return '亲友'
}

const resolveBloodPath = (steps: KinshipRuleStep[]): string | null => {
  const relations = steps.map(step => step.relation)
  const ancestor = resolveAncestor(relations)
  if (ancestor) return ancestor

  let upCount = 0
  while (parentRelations.has(relations[upCount] ?? '')) upCount += 1
  let downCount = 0
  while (childRelations.has(relations[upCount + downCount] ?? '')) downCount += 1
  if (upCount + downCount !== relations.length) return null

  if (upCount === 0) {
    if (downCount === 1) return relations[0] === '儿子' ? '儿子' : '女儿'
    if (downCount === 2) {
      if (relations[0] === '女儿') return relations[1] === '儿子' ? '外孙' : '外孙女'
      return relations[1] === '儿子' ? '孙子' : '孙女'
    }
    if (downCount === 3) {
      const prefix = relations[0] === '儿子' && relations[1] === '儿子' ? '曾' : '外曾'
      return `${prefix}孙${relations[2] === '儿子' ? '' : '女'}`
    }
    return null
  }

  if (upCount === 1 && downCount === 1) {
    return sameGenerationLabel(relations.at(-1)!, steps.at(-1)?.ageComparison)
  }

  if (upCount === 2 && downCount === 1) {
    const viewerParent = relations[0]
    const target = relations.at(-1)!
    if (viewerParent === '妈妈') return target === '儿子' ? '舅父' : '姨母'
    if (target === '女儿') return '姑母'
    const age = steps.at(-1)?.ageComparison
    if (age === 'older') return '伯父'
    if (age === 'younger') return '叔父'
    return '亲友'
  }

  if (upCount === 3 && downCount === 1) {
    const viewerGrandparent = relations[1]
    const target = relations.at(-1)!
    if (viewerGrandparent === '妈妈') return target === '儿子' ? '舅祖父' : '姨祖母'
    if (target === '女儿') return '姑祖母'
    const age = steps.at(-1)?.ageComparison
    if (age === 'older') return '伯祖父'
    if (age === 'younger') return '叔祖父'
    return '亲友'
  }

  if (upCount >= 3 && downCount === upCount - 1) {
    const prefix = cousinPrefix(steps, upCount)
    return `${prefix}${relations.at(-1) === '儿子' ? '舅父' : '姨母'}`
  }

  if (upCount >= 2 && downCount === upCount) {
    return sameGenerationLabel(
      relations.at(-1)!,
      steps.at(-1)?.ageComparison,
      cousinPrefix(steps, upCount),
    )
  }

  if (downCount === upCount + 1) {
    const targetSuffix = relations.at(-1) === '儿子' ? '' : '女'
    if (upCount === 1) {
      const sibling = relations[upCount]
      return sibling === '儿子' ? `侄${targetSuffix}` : `外甥${targetSuffix}`
    }
    if (upCount >= 2) return `${cousinPrefix(steps, upCount)}侄${targetSuffix}`
  }

  if (upCount === 1 && downCount === 3) {
    const sibling = relations[upCount]
    const targetSuffix = relations.at(-1) === '儿子' ? '' : '女'
    return sibling === '儿子' ? `侄孙${targetSuffix}` : `外甥孙${targetSuffix}`
  }

  return null
}

export const resolveCommonKinshipLabel = (steps: KinshipRuleStep[]): string | null => {
  if (steps.length === 0) return '自己'
  if (steps.some(step => ['父母', '子女', '配偶'].includes(step.relation))) return '亲友'

  const spouseIndexes = steps
    .map((step, index) => spouseRelations.has(step.relation) ? index : -1)
    .filter(index => index >= 0)
  if (spouseIndexes[0] === 0 && steps.length > 1) return resolveSpouseFamily(steps)
  if (spouseIndexes.some(index => index !== steps.length - 1)) return '亲友'

  const finalStep = steps.at(-1)!
  if (spouseRelations.has(finalStep.relation)) {
    if (steps.length === 1) return finalStep.relation
    const base = resolveBloodPath(steps.slice(0, -1))
    return base ? spouseLabel(base, finalStep.relation) ?? '亲友' : null
  }

  return resolveBloodPath(steps)
}
