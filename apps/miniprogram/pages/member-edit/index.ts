import { saveMember, type MemberInput } from '../../services/api'
import { ensureFamilyData, getCurrentSnapshot, invalidateFamilyData } from '../../services/familyStore'
import { FamilyMember } from '../../types/family'

interface MemberOption { id: string; name: string }

const emptyForm = (): MemberInput => ({
  branchName: '', generation: 1, name: '', nickName: '', relation: '', birthYear: null,
  gender: 'male', birthdayType: 'lunar', birthMonth: 1, birthDay: 1,
  isLeapMonth: false, parentId: null, spouseId: null,
})

Component({
  data: {
    editingId: '',
    title: '新增成员',
    form: emptyForm(),
    genderOptions: ['男', '女'],
    birthdayTypeOptions: ['农历', '阳历'],
    genderIndex: 0,
    birthdayTypeIndex: 0,
    parentIndex: 0,
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
          branchName: editing.familyName,
          generation: editing.generation,
          name: editing.name,
          nickName: editing.nickName ?? '',
          relation: editing.relation,
          birthYear: editing.birthYear,
          gender: editing.gender,
          birthdayType: editing.birthdayType,
          birthMonth: editing.birthMonth,
          birthDay: editing.birthDay,
          isLeapMonth: editing.isLeapMonth ?? false,
          parentId: editing.parentId,
          spouseId: editing.spouseId,
        } : emptyForm()
        this.setData({
          editingId: editing?.id ?? '',
          title: editing ? '编辑成员' : '新增成员',
          form,
          genderIndex: form.gender === 'male' ? 0 : 1,
          birthdayTypeIndex: form.birthdayType === 'lunar' ? 0 : 1,
          parentIndex: Math.max(0, memberOptions.findIndex(item => item.id === form.parentId)),
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
      this.setData({ genderIndex: index, 'form.gender': index === 0 ? 'male' : 'female' })
    },

    onBirthdayTypeChange(e: WechatMiniprogram.PickerChange) {
      const index = Number(e.detail.value)
      this.setData({ birthdayTypeIndex: index, 'form.birthdayType': index === 0 ? 'lunar' : 'solar' })
    },

    onLeapMonthChange(e: WechatMiniprogram.SwitchChange) {
      this.setData({ 'form.isLeapMonth': e.detail.value })
    },

    onParentChange(e: WechatMiniprogram.PickerChange) {
      const index = Number(e.detail.value)
      this.setData({ parentIndex: index, 'form.parentId': this.data.memberOptions[index]?.id || null })
    },

    onSpouseChange(e: WechatMiniprogram.PickerChange) {
      const index = Number(e.detail.value)
      this.setData({ spouseIndex: index, 'form.spouseId': this.data.memberOptions[index]?.id || null })
    },

    async submit() {
      const form = this.data.form
      if (!form.name.trim() || !form.branchName.trim()) {
        wx.showToast({ title: '姓名和家族分支不能为空', icon: 'none' })
        return
      }
      if (!Number.isInteger(form.generation) || !Number.isInteger(form.birthMonth) || !Number.isInteger(form.birthDay)) {
        wx.showToast({ title: '请填写有效的代际和生日', icon: 'none' })
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
