Component({
  properties: {
    mode: { type: String, value: 'empty' },
    title: { type: String, value: '' },
    desc: { type: String, value: '' },
    actionText: { type: String, value: '' },
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    },
  },
})
