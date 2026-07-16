export interface KinshipMember {
  id: string
  gender: 'male' | 'female' | 'unknown'
  birth_year: number | null
  relation_label: string
}

export interface KinshipRelationship {
  from_member_id: string
  to_member_id: string
  type: 'parent' | 'spouse'
}

type KinshipStep = 'up' | 'down' | 'spouse'

interface PathStep {
  direction: KinshipStep
  toId: string
}

const byGender = (gender: KinshipMember['gender'], male: string, female: string, unknown: string): string => {
  if (gender === 'male') return male
  if (gender === 'female') return female
  return unknown
}

const siblingLabel = (viewer: KinshipMember, target: KinshipMember): string => {
  if (target.gender === 'unknown') return '兄弟姐妹'
  if (viewer.birth_year && target.birth_year) {
    const older = target.birth_year < viewer.birth_year
    if (target.gender === 'male') return older ? '哥哥' : '弟弟'
    return older ? '姐姐' : '妹妹'
  }
  return target.gender === 'male' ? '兄弟' : '姐妹'
}

const childLabel = (target: KinshipMember): string => byGender(target.gender, '儿子', '女儿', '孩子')

const parentLabel = (target: KinshipMember): string => byGender(target.gender, '爸爸', '妈妈', '父母')

const spouseLabel = (target: KinshipMember): string => byGender(target.gender, '丈夫', '妻子', '配偶')

const makePossessiveLabel = (path: PathStep[], members: Map<string, KinshipMember>, fallback: string): string => {
  if (path.length > 4) return path.some(step => step.direction === 'spouse') ? '姻亲' : '远亲'
  const labels = path.map(step => {
    const target = members.get(step.toId)
    if (!target) return null
    if (step.direction === 'up') return parentLabel(target)
    if (step.direction === 'down') return childLabel(target)
    return spouseLabel(target)
  }).filter(Boolean)
  return labels.length > 0 ? labels.join('的') : fallback
}

const normalizeDirections = (path: PathStep[]): KinshipStep[] => {
  const directions = path.map(step => step.direction)
  return directions.filter((direction, index) => {
    if (direction !== 'spouse') return true
    return !(directions[index - 1] === 'down' && directions[index + 1] === 'down')
  })
}

const choosePath = (
  viewerId: string,
  targetId: string,
  members: Map<string, KinshipMember>,
  relationships: KinshipRelationship[],
): PathStep[] | null => {
  if (viewerId === targetId) return []
  const neighbors = new Map<string, PathStep[]>()
  members.forEach((_member, id) => neighbors.set(id, []))
  relationships.forEach(relationship => {
    if (!members.has(relationship.from_member_id) || !members.has(relationship.to_member_id)) return
    if (relationship.type === 'parent') {
      neighbors.get(relationship.to_member_id)?.push({ direction: 'up', toId: relationship.from_member_id })
      neighbors.get(relationship.from_member_id)?.push({ direction: 'down', toId: relationship.to_member_id })
      return
    }
    neighbors.get(relationship.from_member_id)?.push({ direction: 'spouse', toId: relationship.to_member_id })
    neighbors.get(relationship.to_member_id)?.push({ direction: 'spouse', toId: relationship.from_member_id })
  })

  const seen = new Set([viewerId])
  const queue: Array<{ id: string; path: PathStep[] }> = [{ id: viewerId, path: [] }]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.path.length >= 6) continue
    for (const edge of neighbors.get(current.id) ?? []) {
      if (seen.has(edge.toId)) continue
      const path = [...current.path, edge]
      if (edge.toId === targetId) return path
      seen.add(edge.toId)
      queue.push({ id: edge.toId, path })
    }
  }
  return null
}

export const inferKinshipLabel = (
  viewerId: string | null | undefined,
  targetId: string,
  membersInput: KinshipMember[],
  relationships: KinshipRelationship[],
): string => {
  const members = new Map(membersInput.map(member => [member.id, member]))
  const target = members.get(targetId)
  if (!target) return ''
  const fallback = target.relation_label || '亲人'
  if (!viewerId || !members.has(viewerId)) return fallback

  const viewer = members.get(viewerId)!
  const path = choosePath(viewerId, targetId, members, relationships)
  if (!path) return fallback
  const directions = path.map(step => step.direction).join(',')
  const normalizedDirections = normalizeDirections(path).join(',')
  const first = path[0] ? members.get(path[0].toId) : null
  const second = path[1] ? members.get(path[1].toId) : null
  const third = path[2] ? members.get(path[2].toId) : null

  if (directions === '') return '自己'
  if (directions === 'spouse') return spouseLabel(target)
  if (normalizedDirections === 'up') return parentLabel(target)
  if (normalizedDirections === 'down') return childLabel(target)
  if (normalizedDirections === 'up,down') return siblingLabel(viewer, target)

  if (normalizedDirections === 'up,up') {
    const paternal = first?.gender === 'male'
    if (target.gender === 'male') return paternal ? '爷爷' : '外公'
    if (target.gender === 'female') return paternal ? '奶奶' : '外婆'
    return paternal ? '祖辈' : '外祖辈'
  }

  if (normalizedDirections === 'down,down') {
    const child = first
    if (child?.gender === 'female') return byGender(target.gender, '外孙', '外孙女', '外孙辈')
    return byGender(target.gender, '孙子', '孙女', '孙辈')
  }

  if (normalizedDirections === 'up,up,up') {
    const maternal = first?.gender === 'female'
    if (target.gender === 'male') return maternal ? '曾外祖父' : '曾祖父'
    if (target.gender === 'female') return maternal ? '曾外祖母' : '曾祖母'
    return maternal ? '曾外祖辈' : '曾祖辈'
  }

  if (normalizedDirections === 'down,down,down') {
    const child = first
    if (child?.gender === 'female') return byGender(target.gender, '外曾孙', '外曾孙女', '外曾孙辈')
    return byGender(target.gender, '曾孙', '曾孙女', '曾孙辈')
  }

  if (normalizedDirections === 'up,up,down') {
    if (first?.gender === 'male') return byGender(target.gender, '伯父/叔叔', '姑姑', '长辈')
    if (first?.gender === 'female') return byGender(target.gender, '舅舅', '姨妈', '长辈')
    return byGender(target.gender, '叔伯/舅舅', '姑姨', '长辈')
  }

  if (normalizedDirections === 'up,up,down,down') {
    const isTang = first?.gender === 'male' && third?.gender === 'male'
    const prefix = isTang ? '堂' : '表'
    const suffix = target.gender === 'unknown' ? '亲' : siblingLabel(viewer, target)
    return `${prefix}${suffix}`
  }

  if (normalizedDirections === 'up,up,down,down,down') {
    const isTang = first?.gender === 'male' && third?.gender === 'male'
    const prefix = isTang ? '堂' : '表'
    return `${prefix}${byGender(target.gender, '侄', '侄女', '侄辈')}`
  }

  if (normalizedDirections === 'up,down,down') {
    if (second?.gender === 'female') return byGender(target.gender, '外甥', '外甥女', '外甥辈')
    return byGender(target.gender, '侄子', '侄女', '侄辈')
  }

  if (directions === 'down,spouse') return byGender(target.gender, '女婿', '儿媳', '子女配偶')
  if (directions === 'spouse,up') {
    if (viewer.gender === 'female') return byGender(target.gender, '公公', '婆婆', '配偶父母')
    if (viewer.gender === 'male') return byGender(target.gender, '岳父', '岳母', '配偶父母')
    return byGender(target.gender, '配偶父亲', '配偶母亲', '配偶父母')
  }
  if (directions === 'up,spouse') return byGender(target.gender, '继父', '继母', '父母配偶')
  if (directions === 'up,down,spouse') {
    if (second?.gender === 'male') return byGender(target.gender, '姐夫/妹夫', '嫂子/弟媳', '兄弟配偶')
    if (second?.gender === 'female') return byGender(target.gender, '姐夫/妹夫', '嫂子/弟媳', '姐妹配偶')
    return '兄弟姐妹的配偶'
  }
  if (directions === 'spouse,up,down') {
    const spouse = first ? spouseLabel(first) : '配偶'
    return `${spouse}的${siblingLabel(viewer, target)}`
  }
  if (directions === 'spouse,up,down,down') {
    const spouse = first ? spouseLabel(first) : '配偶'
    if (third?.gender === 'female') return `${spouse}的${byGender(target.gender, '外甥', '外甥女', '外甥辈')}`
    return `${spouse}的${byGender(target.gender, '侄子', '侄女', '侄辈')}`
  }

  return makePossessiveLabel(path, members, fallback)
}
