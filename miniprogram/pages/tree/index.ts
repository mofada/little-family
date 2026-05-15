import { familyMembers, getFamilyColor, getFamilyBranches, calculateAge } from '../../utils/familyData'

// Layout constants (in rpx)
const CW = 176   // card width
const CH = 220   // card height
const CG = 24    // couple gap
const UG = 72    // unit gap (sibling spacing)
const GH = 320   // generation height
const PL = 100   // padding left
const PT = 40    // padding top

const SPOUSE_TARGET_IDS = new Set(
  familyMembers
    .filter(m => m.parentId !== null && !!m.spouseId)
    .map(m => m.spouseId as string)
)

const MEMBER_JSON_BY_ID: Record<string, string> = Object.fromEntries(
  familyMembers.map(m => [m.id, JSON.stringify(m)])
)

let buildTimer: number | null = null

interface Unit {
  primary: typeof familyMembers[0]
  spouse?: typeof familyMembers[0]
  x: number   // center x in rpx
  y: number   // top y in rpx
}

interface CardView {
  id: string
  memberJson: string
  name: string
  relation: string
  familyName: string
  color: string
  age: number | null
  isMe: boolean
  isBirthday: boolean
  avatarEmoji: string
  left: number
  top: number
}

interface Connection {
  x1: number; y1: number
  x2: number; y2: number
  color: string
}

interface FamilyFilterItem {
  name: string
  color: string
  active: boolean
}

Component({
  data: {
    canvasWidth: 0,
    canvasHeight: 0,
    cards: [] as CardView[],
    connections: [] as Connection[],
    keyword: '',
    activeFamilyMap: {} as Record<string, boolean>,
    familyFilters: [] as FamilyFilterItem[],
    allFamilies: [] as string[],
    showModal: false,
    selectedMemberJson: '',
    legendItems: [] as { name: string; color: string }[],
    hasBuilt: false,
  },
  lifetimes: {
    attached() {},
    detached() {
      if (buildTimer !== null) {
        clearTimeout(buildTimer)
        buildTimer = null
      }
    }
  },
  pageLifetimes: {
    show() {
      if (this.data.hasBuilt) {
        this.drawConnections()
        return
      }
      this.buildTree()
    }
  },
  methods: {
    scheduleBuildTree(delay = 0) {
      if (buildTimer !== null) {
        clearTimeout(buildTimer)
      }
      buildTimer = setTimeout(() => {
        buildTimer = null
        this.buildTree()
      }, delay)
    },

    buildTree() {
      const { keyword } = this.data
      const activeFamilyMap = this.data.activeFamilyMap
      const allFamilies = getFamilyBranches()

      // Init active families if empty
      if (Object.keys(activeFamilyMap).length === 0) {
        const init: Record<string, boolean> = {}
        allFamilies.forEach(f => { init[f] = true })
        this.setData({ activeFamilyMap: init })
      }

      const activeSet = new Set(
        allFamilies.filter(f => this.data.activeFamilyMap[f] !== false)
      )

      const kw = keyword.trim().toLowerCase()

      // Build units per generation
      const memberById = new Map(familyMembers.map(m => [m.id, m]))

      // A unit has a primary (one with parentId or no spouse) + optional spouse
      // Primary members = those whose parentId is set OR generation=1 with no parentId
      const primaries = familyMembers.filter(m => !SPOUSE_TARGET_IDS.has(m.id))

      const units: Unit[] = primaries.map(p => {
        const spouse = p.spouseId ? memberById.get(p.spouseId) : undefined
        return { primary: p, spouse, x: 0, y: 0 }
      })

      // Group units by generation
      const genMap = new Map<number, Unit[]>()
      units.forEach(u => {
        const gen = u.primary.generation
        if (!genMap.has(gen)) genMap.set(gen, [])
        genMap.get(gen)!.push(u)
      })

      // Unit width: primary card + optional spouse card + couple gap
      const unitWidth = (u: Unit) => u.spouse ? CW * 2 + CG : CW

      // Compute positions generation by generation
      const unitMap = new Map<string, Unit>()
      const sortedGens = Array.from(genMap.keys()).sort()

      for (const gen of sortedGens) {
        const genUnits = genMap.get(gen)!

        if (gen === sortedGens[0]) {
          // First gen: sort by id, lay out from left
          genUnits.sort((a, b) => a.primary.id.localeCompare(b.primary.id))
          let x = PL
          for (const u of genUnits) {
            const w = unitWidth(u)
            u.x = x + w / 2
            u.y = PT + (gen - 1) * GH
            x += w + UG
            unitMap.set(u.primary.id, u)
          }
        } else {
          // Sort by parent center x
          genUnits.sort((a, b) => {
            const pa = unitMap.get(a.primary.parentId ?? '') ?? unitMap.get(a.primary.id)
            const pb = unitMap.get(b.primary.parentId ?? '') ?? unitMap.get(b.primary.id)
            return (pa?.x ?? 0) - (pb?.x ?? 0)
          })
          let x = PL
          for (const u of genUnits) {
            const parentUnit = unitMap.get(u.primary.parentId ?? '')
            const w = unitWidth(u)
            // If same parent as previous unit, keep close; else use next position
            u.x = Math.max(x + w / 2, (parentUnit?.x ?? x + w / 2))
            u.y = PT + (gen - 1) * GH
            x = u.x + w / 2 + UG
            unitMap.set(u.primary.id, u)
          }
        }
      }

      // Compute total canvas size
      let maxX = 0
      let maxY = 0
      for (const u of units) {
        const w = unitWidth(u)
        maxX = Math.max(maxX, u.x + w / 2 + PL)
        maxY = Math.max(maxY, u.y + CH + PT)
      }

      // Build card views
      const kSet = new Set<string>()
      if (kw) {
        familyMembers.forEach(m => {
          if (m.name.toLowerCase().includes(kw)) kSet.add(m.id)
        })
      }

      const cards: CardView[] = []
      for (const u of units) {
        const members = [u.primary, ...(u.spouse ? [u.spouse] : [])]
        for (let i = 0; i < members.length; i++) {
          const m = members[i]
          if (!activeSet.has(m.familyName)) continue
          const offset = i === 0 ? -(unitWidth(u) / 2) : (unitWidth(u) / 2 - CW)
          const left = u.x + offset
          const top = u.y
          cards.push({
            id: m.id,
            memberJson: MEMBER_JSON_BY_ID[m.id],
            name: m.name,
            relation: m.relation,
            familyName: m.familyName,
            color: getFamilyColor(m.familyName),
            age: calculateAge(m.birthYear),
            isMe: m.id === '121',
            isBirthday: false,
            avatarEmoji: m.gender === 'male' ? '👨' : '👩',
            left,
            top,
          })
        }
      }

      // Build connections
      const connections: Connection[] = []
      for (const u of units) {
        const parentUnit = unitMap.get(u.primary.parentId ?? '')
        if (parentUnit) {
          const fromX = parentUnit.x
          const fromY = parentUnit.y + CH
          const toX = u.x
          const toY = u.y
          connections.push({
            x1: fromX, y1: fromY,
            x2: toX, y2: toY,
            color: getFamilyColor(u.primary.familyName),
          })
        }
      }

      const familyFilters: FamilyFilterItem[] = allFamilies.map(name => ({
        name,
        color: getFamilyColor(name),
        active: activeSet.has(name),
      }))

      const legendItems = allFamilies.map(name => ({
        name,
        color: getFamilyColor(name),
      }))

      this.setData({
        canvasWidth: maxX,
        canvasHeight: maxY,
        cards,
        connections,
        familyFilters,
        allFamilies,
        legendItems,
        hasBuilt: true,
      }, () => {
        this.drawConnections()
      })
    },

    drawConnections() {
      const { connections, canvasWidth, canvasHeight } = this.data
      if (connections.length === 0 || canvasWidth === 0) return

      const query = wx.createSelectorQuery().in(this)
      query.select('#tree-canvas').fields({ node: true, size: true }).exec((res: WechatMiniprogram.SelectorQueryNodeInfo[]) => {
        if (!res[0] || !res[0].node) return
        const canvas = res[0].node as unknown as WechatMiniprogram.Canvas
        const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
        const dpr = wx.getWindowInfo().pixelRatio

        // Get actual CSS size from canvas element
        const cssW = (res[0] as { width: number }).width || canvasWidth / 2
        const cssH = (res[0] as { height: number }).height || canvasHeight / 2

        canvas.width = cssW * dpr
        canvas.height = cssH * dpr
        ctx.scale(dpr, dpr)

        // rpx → CSS px (screen width = 750rpx)
        const sysInfo = wx.getWindowInfo()
        const rpxRatio = sysInfo.windowWidth / 750

        ctx.clearRect(0, 0, cssW, cssH)

        for (const conn of connections) {
          const x1 = conn.x1 * rpxRatio
          const y1 = conn.y1 * rpxRatio
          const x2 = conn.x2 * rpxRatio
          const y2 = conn.y2 * rpxRatio
          const mid = (y2 - y1) / 2

          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.bezierCurveTo(x1, y1 + mid, x2, y2 - mid, x2, y2)
          ctx.strokeStyle = conn.color + 'aa'
          ctx.lineWidth = 2
          ctx.stroke()
        }
      })
    },

    onSearch(e: WechatMiniprogram.Input) {
      this.setData({ keyword: e.detail.value }, () => this.scheduleBuildTree(120))
    },

    toggleFamily(e: WechatMiniprogram.TouchEvent) {
      const name = (e.currentTarget.dataset as { name: string }).name
      const obj = { ...this.data.activeFamilyMap }
      obj[name] = !obj[name]
      this.setData({ activeFamilyMap: obj }, () => this.scheduleBuildTree())
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
