import { saveMember, type MemberInput } from '../../services/api'
import { ensureFamilyData, getCurrentSnapshot, invalidateFamilyData } from '../../services/familyStore'
import { FamilyMember } from '../../types/family'

interface MemberOption { id: string; name: string }

const emptyForm = (): MemberInput => ({
  name: '', nickName: '', relation: '', birthYear: null,
  gender: 'unknown', birthdayType: null, birthMonth: null, birthDay: null,
  isLeapMonth: false, parentIds: [], spouseId: null,
})

Component({
  data: {
    editingId: '',
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
    memberOptions: [{ id: '', name: '无' }] as MemberOption[],
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
          { id: '', name: '无' },
          ...snapshot.members
            .filter(member => member.id !== editing?.id)
            .map(member => ({ id: member.id, name: `${member.name}（${member.relation || '成员'}）` })),
        ]
        const form: MemberInput = editing ? {
          name: editing.name,
          nickName: editing.nickName ?? '',
          relation: editing.relation,
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
          title: editing ? '编辑成员' : '新增成员',
          form,
          genderIndex: form.gender === 'unknown' ? 0 : form.gender === 'male' ? 1 : 2,
          birthdayTypeIndex: form.birthdayType === 'lunar' ? 0 : 1,
          hasBirthday: form.birthdayType !== null,
          fatherIndex: Math.max(0, memberOptions.findIndex(item => item.id === fatherId)),
          motherIndex: Math.max(0, memberOptions.findIndex(item => item.id === motherId)),
          spouseIndex: Math.max(0, memberOptions.findIndex(item => item.id === form.spouseId)),
          memberOptions,
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

    onFatherChange(e: WechatMiniprogram.PickerChange) {
      const index = Number(e.detail.value)
      const fatherId = this.data.memberOptions[index]?.id || ''
      const motherId = this.data.memberOptions[this.data.motherIndex]?.id || ''
      this.setData({ fatherIndex: index, 'form.parentIds': [fatherId, motherId].filter(Boolean) })
    },

    onMotherChange(e: WechatMiniprogram.PickerChange) {
      const index = Number(e.detail.value)
      const fatherId = this.data.memberOptions[this.data.fatherIndex]?.id || ''
      const motherId = this.data.memberOptions[index]?.id || ''
      this.setData({ motherIndex: index, 'form.parentIds': [fatherId, motherId].filter(Boolean) })
    },

    onSpouseChange(e: WechatMiniprogram.PickerChange) {
      const index = Number(e.detail.value)
      this.setData({ spouseIndex: index, 'form.spouseId': this.data.memberOptions[index]?.id || null })
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
  },
})
