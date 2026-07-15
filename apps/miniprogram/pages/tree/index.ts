import { familyMembers, getFamilyColor, getFamilyBranches, calculateAge } from '../../utils/familyData'
import { ensureFamilyData } from '../../services/familyStore'

const CARD_W = 186
const CARD_H = 156
const UNIT_GAP = 28
const SPOUSE_GAP = 20
const ROW_GAP = 228
const PAD_X = 60
const PAD_Y = 44
const LINE_W = 4

type Member = typeof familyMembers[number]

interface FamilyFilterItem {
  name: string
  color: string
  active: boolean
}

interface MemberNode {
  id: string
  memberJson: string
  name: string
  relation: string
  familyName: string
  color: string
  age: number | null
  avatarEmoji: string
  isMe: boolean
  left: number
  top: number
}

interface EdgeSegment {
  left: number
  top: number
  width: number
  height: number
  color: string
  opacity: number
}

interface Unit {
  key: string
  members: Member[]
  generation: number
  parentRefId: string | null
}

interface UnitLayout extends Unit {
  left: number
  top: number
  width: number
  centerX: number
}

const MEMBER_JSON_BY_ID: Record<string, string> = Object.fromEntries(
  familyMembers.map(m => [m.id, JSON.stringify(m)])
)

const buildDefaultFamilyMap = (allFamilies: string[], currentFamily: string): Record<string, boolean> =>
  Object.fromEntries(allFamilies.map(name => [name, name === currentFamily]))

let buildTimer: number | null = null

Component({
  data: {
    keyword: '',
    activeFamilyMap: {} as Record<string, boolean>,
    familyFilters: [] as FamilyFilterItem[],
    nodes: [] as MemberNode[],
    edgeSegments: [] as EdgeSegment[],
    canvasWidth: 750,
    canvasHeight: 1200,
    visibleCount: 0,
    totalCount: familyMembers.length,
    showModal: false,
    selectedMemberJson: '',
    currentMemberId: '',
  },

  lifetimes: {
    attached() {
      void this.refreshGraph()
    },
    detached() {
      if (buildTimer !== null) {
        clearTimeout(buildTimer)
        buildTimer = null
      }
    }
  },

  pageLifetimes: {
    show() {
      void this.refreshGraph()
    }
  },

  methods: {
    async refreshGraph() {
      try {
        const snapshot = await ensureFamilyData(true)
        const currentMemberId = snapshot?.family.linkedMemberId
          ?? familyMembers.find(member => member.relation === '我自己')?.id
          ?? familyMembers[0]?.id
          ?? ''
        this.setData({ currentMemberId })
        this.buildGraph()
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
      }
    },
    scheduleBuild(delay = 0) {
      if (buildTimer !== null) {
        clearTimeout(buildTimer)
      }
      buildTimer = setTimeout(() => {
        buildTimer = null
        this.buildGraph()
      }, delay)
    },

    buildGraph() {
      const allFamilies = getFamilyBranches()
      const keyword = this.data.keyword.trim().toLowerCase()
      const currentFamily = familyMembers.find(member => member.id === this.data.currentMemberId)?.familyName
        ?? allFamilies[0]
        ?? ''

      const activeFamilyMap = Object.keys(this.data.activeFamilyMap).length === 0
        ? buildDefaultFamilyMap(allFamilies, currentFamily)
        : this.data.activeFamilyMap

      const activeSet = new Set(
        allFamilies.filter(name => activeFamilyMap[name] !== false)
      )

      const memberById = new Map(familyMembers.map(m => [m.id, m]))

      const activeMembers = familyMembers.filter(m => activeSet.has(m.familyName))

      const directMatchedIds = new Set<string>(
        activeMembers
          .filter(m => {
            if (!keyword) return true
            return [m.name, m.relation, m.nickName ?? '', m.familyName]
              .join('|')
              .toLowerCase()
              .includes(keyword)
          })
          .map(m => m.id)
      )

      const visibleIds = new Set<string>()
      const addIfActive = (id: string | null | undefined) => {
        if (!id) return
        const member = memberById.get(id)
        if (!member || !activeSet.has(member.familyName)) return
        visibleIds.add(id)
      }

      directMatchedIds.forEach(id => addIfActive(id))

      // 搜索时保留一层亲缘上下文，避免图谱断裂成无意义碎片
      if (keyword) {
        Array.from(directMatchedIds).forEach(id => {
          const member = memberById.get(id)
          if (!member) return

          addIfActive(member.spouseId)
          addIfActive(member.parentId)

          if (member.parentId) {
            const parent = memberById.get(member.parentId)
            addIfActive(parent?.spouseId)
          }

          familyMembers.forEach(candidate => {
            if (candidate.parentId === id || candidate.parentId === member.spouseId) {
              addIfActive(candidate.id)
            }
          })
        })
      }

      const visibleMembers = familyMembers.filter(m => visibleIds.has(m.id))

      const { units } = this.buildUnits(visibleMembers)
      const layouts = this.layoutUnits(units)
      const { nodes, edgeSegments, canvasWidth, canvasHeight } = this.buildGraphPrimitives(layouts)

      const familyFilters: FamilyFilterItem[] = allFamilies.map(name => ({
        name,
        color: getFamilyColor(name),
        active: activeSet.has(name),
      }))

      this.setData({
        activeFamilyMap,
        familyFilters,
        nodes,
        edgeSegments,
        canvasWidth,
        canvasHeight,
        visibleCount: nodes.length,
      })
    },

    buildUnits(visibleMembers: Member[]) {
      const visibleById = new Map(visibleMembers.map(m => [m.id, m]))
      const used = new Set<string>()
      const units: Unit[] = []
      const memberToUnit = new Map<string, string>()

      const ordered = [...visibleMembers].sort((a, b) => {
        if (a.generation !== b.generation) return a.generation - b.generation
        return a.id.localeCompare(b.id)
      })

      ordered.forEach(member => {
        if (used.has(member.id)) return

        const spouse = member.spouseId ? visibleById.get(member.spouseId) : undefined
        let members: Member[] = [member]

        if (spouse && !used.has(spouse.id)) {
          members = [member, spouse].sort((a, b) => {
            const aPrimary = a.parentId !== null
            const bPrimary = b.parentId !== null
            if (aPrimary !== bPrimary) return aPrimary ? -1 : 1
            return a.id.localeCompare(b.id)
          })
        }

        const key = members.map(m => m.id).sort().join('_')
        const generation = Math.min(...members.map(m => m.generation))
        const parentRefId = members.find(m => m.parentId)?.parentId ?? null

        units.push({ key, members, generation, parentRefId })

        members.forEach(m => {
          used.add(m.id)
          memberToUnit.set(m.id, key)
        })
      })

      return { units, memberToUnit }
    },

    layoutUnits(units: Unit[]) {
      const grouped = new Map<number, Unit[]>()
      units.forEach(u => {
        if (!grouped.has(u.generation)) grouped.set(u.generation, [])
        grouped.get(u.generation)!.push(u)
      })

      const generations = Array.from(grouped.keys()).sort((a, b) => a - b)
      const minGeneration = generations[0] ?? 1
      const layoutsByKey = new Map<string, UnitLayout>()
      const memberCenterX = new Map<string, number>()

      generations.forEach(generation => {
        const rowUnits = grouped.get(generation) ?? []

        const withDesiredCenter = rowUnits.map(unit => {
          const parentCenters = unit.members
            .map(m => (m.parentId ? memberCenterX.get(m.parentId) : undefined))
            .filter((x): x is number => typeof x === 'number')

          const desiredCenter = parentCenters.length > 0
            ? parentCenters.reduce((sum, x) => sum + x, 0) / parentCenters.length
            : null

          return { unit, desiredCenter }
        })

        withDesiredCenter.sort((a, b) => {
          if (a.desiredCenter !== null && b.desiredCenter !== null) return a.desiredCenter - b.desiredCenter
          if (a.desiredCenter !== null) return -1
          if (b.desiredCenter !== null) return 1
          return a.unit.key.localeCompare(b.unit.key)
        })

        let cursorX = PAD_X
        const rowTop = PAD_Y + (generation - minGeneration) * ROW_GAP
        const rowLayouts: UnitLayout[] = []

        withDesiredCenter.forEach(({ unit, desiredCenter }) => {
          const width = unit.members.length * CARD_W + Math.max(unit.members.length - 1, 0) * SPOUSE_GAP
          const preferredLeft = desiredCenter !== null ? Math.floor(desiredCenter - width / 2) : cursorX
          const left = Math.max(cursorX, preferredLeft)
          const centerX = left + width / 2

          const layout: UnitLayout = {
            ...unit,
            left,
            top: rowTop,
            width,
            centerX,
          }

          rowLayouts.push(layout)
          cursorX = left + width + UNIT_GAP
        })

        const rowDesiredCenters = withDesiredCenter
          .map(x => x.desiredCenter)
          .filter((x): x is number => x !== null)

        if (rowLayouts.length > 0 && rowDesiredCenters.length > 0) {
          const minLeft = Math.min(...rowLayouts.map(l => l.left))
          const maxRight = Math.max(...rowLayouts.map(l => l.left + l.width))
          const rowCenter = (minLeft + maxRight) / 2
          const desiredCenter = rowDesiredCenters.reduce((sum, x) => sum + x, 0) / rowDesiredCenters.length
          const shift = Math.round(desiredCenter - rowCenter)

          if (shift !== 0 && minLeft + shift >= PAD_X) {
            rowLayouts.forEach(layout => {
              layout.left += shift
              layout.centerX += shift
            })
          }
        }

        rowLayouts.forEach(layout => {
          layoutsByKey.set(layout.key, layout)
          layout.members.forEach((member, index) => {
            const centerX = layout.left + index * (CARD_W + SPOUSE_GAP) + CARD_W / 2
            memberCenterX.set(member.id, centerX)
          })
        })
      })

      return Array.from(layoutsByKey.values())
    },

    buildGraphPrimitives(layouts: UnitLayout[]) {

      const nodes: MemberNode[] = []
      let maxRight = 750
      let maxBottom = 1200

      layouts.forEach(layout => {
        layout.members.forEach((member, index) => {
          const left = layout.left + index * (CARD_W + SPOUSE_GAP)
          const top = layout.top

          nodes.push({
            id: member.id,
            memberJson: MEMBER_JSON_BY_ID[member.id],
            name: member.name,
            relation: member.relation,
            familyName: member.familyName,
            color: getFamilyColor(member.familyName),
            age: calculateAge(member.birthYear),
            avatarEmoji: member.gender === 'male' ? '👨' : '👩',
            isMe: member.id === this.data.currentMemberId,
            left,
            top,
          })

          maxRight = Math.max(maxRight, left + CARD_W + PAD_X)
          maxBottom = Math.max(maxBottom, top + CARD_H + PAD_Y)
        })
      })

      const edgeSegments: EdgeSegment[] = []
      const memberPos = new Map<string, { centerX: number; top: number; centerY: number }>()
      const pushSegment = (left: number, top: number, width: number, height: number, color: string, opacity = 0.35) => {
        if (width <= 0 || height <= 0) return
        edgeSegments.push({ left, top, width, height, color, opacity })
      }

      layouts.forEach(layout => {
        layout.members.forEach((member, index) => {
          const left = layout.left + index * (CARD_W + SPOUSE_GAP)
          memberPos.set(member.id, {
            centerX: left + CARD_W / 2,
            top: layout.top,
            centerY: layout.top + CARD_H / 2,
          })
        })
      })

      layouts.forEach(layout => {
        layout.members.forEach(member => {
          if (!member.parentId) return
          const parentPos = memberPos.get(member.parentId)
          const childPos = memberPos.get(member.id)
          if (!parentPos || !childPos) return

          const fromX = parentPos.centerX
          const fromY = parentPos.top + CARD_H
          const toX = childPos.centerX
          const toY = childPos.top
          if (toY <= fromY) return

          const midY = Math.floor((fromY + toY) / 2)
          const color = getFamilyColor(member.familyName)

          pushSegment(fromX - LINE_W / 2, fromY, LINE_W, midY - fromY, color)

          const hLeft = Math.min(fromX, toX)
          const hWidth = Math.max(Math.abs(toX - fromX), LINE_W)
          pushSegment(hLeft, midY - LINE_W / 2, hWidth, LINE_W, color)

          pushSegment(toX - LINE_W / 2, midY, LINE_W, toY - midY, color)
        })
      })

      const spouseDone = new Set<string>()
      layouts.forEach(layout => {
        layout.members.forEach(member => {
          if (!member.spouseId) return
          if (!memberPos.has(member.spouseId)) return
          const key = [member.id, member.spouseId].sort().join('_')
          if (spouseDone.has(key)) return
          spouseDone.add(key)

          const leftPos = memberPos.get(member.id)
          const rightPos = memberPos.get(member.spouseId)
          if (!leftPos || !rightPos) return

          const y = Math.round((leftPos.centerY + rightPos.centerY) / 2)
          const left = Math.min(leftPos.centerX, rightPos.centerX)
          const width = Math.max(Math.abs(rightPos.centerX - leftPos.centerX), LINE_W)
          pushSegment(left, y - LINE_W / 2, width, LINE_W, getFamilyColor(member.familyName), 0.25)
        })
      })

      return {
        nodes,
        edgeSegments,
        canvasWidth: maxRight,
        canvasHeight: maxBottom,
      }
    },

    onSearch(e: WechatMiniprogram.Input) {
      this.setData({ keyword: e.detail.value }, () => this.scheduleBuild(120))
    },

    toggleFamily(e: WechatMiniprogram.TouchEvent) {
      const name = (e.currentTarget.dataset as { name: string }).name
      const next = { ...this.data.activeFamilyMap }
      next[name] = !next[name]
      this.setData({ activeFamilyMap: next }, () => this.scheduleBuild())
    },

    resetFamilyFilters() {
      const allFamilies = getFamilyBranches()
      const currentFamily = familyMembers.find(member => member.id === this.data.currentMemberId)?.familyName
        ?? allFamilies[0]
        ?? ''
      const next = buildDefaultFamilyMap(allFamilies, currentFamily)
      this.setData({ activeFamilyMap: next }, () => this.buildGraph())
    },

    onCardTap(e: WechatMiniprogram.TouchEvent) {
      const json = (e.currentTarget.dataset as { json: string }).json
      this.setData({ showModal: true, selectedMemberJson: json })
    },

    onModalClose() {
      this.setData({ showModal: false, selectedMemberJson: '' })
    },
  }
})
