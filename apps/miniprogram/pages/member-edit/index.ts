import { deleteMember, saveMember, type MemberInput } from '../../services/api'
import { ensureFamilyData, getCurrentSnapshot, invalidateFamilyData } from '../../services/familyStore'
import { FamilyMember } from '../../types/family'

type RelationField = 'father' | 'mother' | 'spouse'

interface MemberOption {
  id: string
  name: string
  avatar: string
  meta: string
  searchText: string
}

const emptyForm = (): MemberInput => ({
  name: '', nickName: '', relation: '', birthYear: null,
  gender: 'unknown', birthdayType: null, birthMonth: null, birthDay: null,
  isLeapMonth: false, parentIds: [], spouseId: null,
})

Component({
  data: {
    editingId: '',
    canDelete: false,
    title: '新增成员',
    form: emptyForm(),
    genderOptions: ['未知', '男', '女'],
    birthdayTypeOptions: ['农历', '阳历'],
    genderIndex: 0,
    birthdayTypeIndex: 0,
    hasBirthday: false,
    fatherIndex: 0,
    motherIndex: 0,
    spouseIndex: 0,
    memberOptions: [{ id: '', name: '无', avatar: '', meta: '', searchText: '' }] as MemberOption[],
    selectorVisible: false,
    selectorField: 'father' as RelationField,
    selectorTitle: '选择父亲',
    selectorKeyword: '',
    filteredMemberOptions: [] as MemberOption[],
    saving: false,
  },
  lifetimes: {
    attached() { void this.loadForm() },
  },
  methods: {
    async loadForm() {
      try {
        const snapshot = await ensureFamilyData()
        if (!snapshot) {
          wx.showToast({ title: '请先创建家庭', icon: 'none' })
          return
        }
        const raw = wx.getStorageSync('little-family:editing-member') as string
        const editing = raw ? JSON.parse(raw) as FamilyMember : null
        const memberOptions: MemberOption[] = [
          { id: '', name: '无', avatar: '', meta: '', searchText: '' },
          ...snapshot.members
            .filter(member => member.id !== editing?.id)
            .map(member => {
              const details = [
                member.relation || '成员',
                member.nickName ? `昵称：${member.nickName}` : '',
                member.birthYear ? `${member.birthYear} 年生` : '',
              ].filter(Boolean)
              return {
                id: member.id,
                name: member.name,
                avatar: member.name.slice(0, 1),
                meta: details.join(' · '),
                searchText: [member.name, member.nickName, member.relation, member.birthYear].filter(Boolean).join(' ').toLowerCase(),
              }
            }),
        ]
        const form: MemberInput = editing ? {
          name: editing.name,
          nickName: editing.nickName ?? '',
          relation: '',
          birthYear: editing.birthYear,
          gender: editing.gender,
          birthdayType: editing.birthdayType,
          birthMonth: editing.birthMonth,
          birthDay: editing.birthDay,
          isLeapMonth: editing.isLeapMonth ?? false,
          parentIds: editing.parentIds,
          spouseId: editing.spouseId,
        } : emptyForm()
        const parentMembers = (form.parentIds ?? [])
          .map(id => snapshot.members.find(member => member.id === id))
          .filter((member): member is FamilyMember => !!member)
        const fatherId = parentMembers.find(member => member.gender === 'male')?.id ?? parentMembers[0]?.id ?? ''
        const motherId = parentMembers.find(member => member.gender === 'female' && member.id !== fatherId)?.id
          ?? parentMembers.find(member => member.id !== fatherId)?.id
          ?? ''
        this.setData({
          editingId: editing?.id ?? '',
          canDelete: Boolean(editing?.id && snapshot.family.role === 'owner'),
          title: editing ? '编辑成员' : '新增成员',
          form,
          genderIndex: form.gender === 'unknown' ? 0 : form.gender === 'male' ? 1 : 2,
          birthdayTypeIndex: form.birthdayType === 'lunar' ? 0 : 1,
          hasBirthday: form.birthdayType !== null,
          fatherIndex: Math.max(0, memberOptions.findIndex(item => item.id === fatherId)),
          motherIndex: Math.max(0, memberOptions.findIndex(item => item.id === motherId)),
          spouseIndex: Math.max(0, memberOptions.findIndex(item => item.id === form.spouseId)),
          memberOptions,
          filteredMemberOptions: memberOptions.slice(1),
        })
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
      }
    },

    setText(e: WechatMiniprogram.Input) {
      const field = (e.currentTarget.dataset as { field: string }).field
      this.setData({ [`form.${field}`]: e.detail.value })
    },

    setNumber(e: WechatMiniprogram.Input) {
      const field = (e.currentTarget.dataset as { field: string }).field
      const value = e.detail.value === '' ? null : Number(e.detail.value)
      this.setData({ [`form.${field}`]: value })
    },

    onGenderChange(e: WechatMiniprogram.PickerChange) {
      const index = Number(e.detail.value)
      this.setData({ genderIndex: index, 'form.gender': index === 0 ? 'unknown' : index === 1 ? 'male' : 'female' })
    },

    onBirthdayTypeChange(e: WechatMiniprogram.PickerChange) {
      const index = Number(e.detail.value)
      this.setData({ birthdayTypeIndex: index, 'form.birthdayType': index === 0 ? 'lunar' : 'solar' })
    },

    onHasBirthdayChange(e: WechatMiniprogram.SwitchChange) {
      const enabled = e.detail.value
      this.setData({
        hasBirthday: enabled,
        'form.birthdayType': enabled ? 'lunar' : null,
        'form.birthMonth': enabled ? 1 : null,
        'form.birthDay': enabled ? 1 : null,
        'form.isLeapMonth': false,
        birthdayTypeIndex: 0,
      })
    },

    onLeapMonthChange(e: WechatMiniprogram.SwitchChange) {
      this.setData({ 'form.isLeapMonth': e.detail.value })
    },

    openMemberSelector(e: WechatMiniprogram.TouchEvent) {
      const field = (e.currentTarget.dataset as { field: RelationField }).field
      const titles: Record<RelationField, string> = {
        father: '选择父亲',
        mother: '选择母亲',
        spouse: '选择配偶',
      }
      this.setData({
        selectorVisible: true,
        selectorField: field,
        selectorTitle: titles[field],
        selectorKeyword: '',
        filteredMemberOptions: this.data.memberOptions.slice(1),
      })
    },

    closeMemberSelector() {
      this.setData({ selectorVisible: false, selectorKeyword: '' })
    },

    preventBubble() {},

    onSelectorSearch(e: WechatMiniprogram.Input) {
      const keyword = e.detail.value.trim().toLowerCase()
      const filteredMemberOptions = this.data.memberOptions
        .slice(1)
        .filter(member => !keyword || member.searchText.includes(keyword))
      this.setData({ selectorKeyword: e.detail.value, filteredMemberOptions })
    },

    clearSelectorSearch() {
      this.setData({
        selectorKeyword: '',
        filteredMemberOptions: this.data.memberOptions.slice(1),
      })
    },

    selectMember(e: WechatMiniprogram.TouchEvent) {
      const id = (e.currentTarget.dataset as { id: string }).id
      this.applyRelationSelection(this.data.selectorField, id)
    },

    clearRelationSelection() {
      this.applyRelationSelection(this.data.selectorField, '')
    },

    applyRelationSelection(field: RelationField, id: string) {
      const index = Math.max(0, this.data.memberOptions.findIndex(item => item.id === id))
      if (field === 'spouse') {
        this.setData({ spouseIndex: index, 'form.spouseId': id || null, selectorVisible: false, selectorKeyword: '' })
        return
      }

      const fatherId = field === 'father'
        ? id
        : this.data.memberOptions[this.data.fatherIndex]?.id || ''
      const motherId = field === 'mother'
        ? id
        : this.data.memberOptions[this.data.motherIndex]?.id || ''
      this.setData({
        [`${field}Index`]: index,
        'form.parentIds': [fatherId, motherId].filter(Boolean),
        selectorVisible: false,
        selectorKeyword: '',
      })
    },

    async submit() {
      const form = this.data.form
      if (!form.name.trim()) {
        wx.showToast({ title: '姓名不能为空', icon: 'none' })
        return
      }
      if (this.data.hasBirthday && (!Number.isInteger(form.birthMonth) || !Number.isInteger(form.birthDay))) {
        wx.showToast({ title: '请填写有效的生日', icon: 'none' })
        return
      }
      if ((form.parentIds?.length ?? 0) !== new Set(form.parentIds ?? []).size) {
        wx.showToast({ title: '父亲和母亲不能是同一人', icon: 'none' })
        return
      }
      const snapshot = getCurrentSnapshot()
      if (!snapshot) return
      this.setData({ saving: true })
      try {
        await saveMember(snapshot.family.id, form, this.data.editingId || undefined)
        invalidateFamilyData()
        wx.removeStorageSync('little-family:editing-member')
        wx.showToast({ title: '已保存', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 500)
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
      } finally {
        this.setData({ saving: false })
      }
    },

    deleteCurrentMember() {
      if (!this.data.canDelete || !this.data.editingId) return
      const snapshot = getCurrentSnapshot()
      if (!snapshot) return
      wx.showModal({
        title: `删除 ${this.data.form.name}？`,
        content: '相关亲缘关系也会一并删除，此操作无法撤销。',
        success: async result => {
          if (!result.confirm) return
          this.setData({ saving: true })
          try {
            await deleteMember(snapshot.family.id, this.data.editingId)
            invalidateFamilyData()
            wx.removeStorageSync('little-family:editing-member')
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 500)
          } catch (error) {
            wx.showToast({ title: error instanceof Error ? error.message : '删除失败', icon: 'none' })
          } finally {
            this.setData({ saving: false })
          }
        },
      })
    },
  },
})
