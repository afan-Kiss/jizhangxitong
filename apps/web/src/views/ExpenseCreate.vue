<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import api from '../api'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ImageUploader from '../components/ImageUploader.vue'
import ActionButton from '../components/ActionButton.vue'

const router = useRouter()
const settings = ref<any>({})
const form = ref({
  amount: '',
  expenseType: '',
  paySource: '',
  reimbursementPerson: '',
  reimbursementStatus: 'pending',
  braceletCode: '',
  occurredAt: new Date().toISOString().slice(0, 10),
  expenseSummary: '',
  remark: '',
})
const uploadedFiles = ref<Array<{ fileId: number; fileType: string; name: string; preview?: string }>>([])
const loading = ref(false)
const amountFocused = ref(false)

const displayAmount = computed(() => {
  const v = form.value.amount
  if (!v) return ''
  const n = Number(v)
  if (Number.isNaN(n)) return v
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
})

onMounted(async () => {
  const res = await api.get('/settings')
  settings.value = res.data.data
  if (settings.value.expenseTypes?.length) form.value.expenseType = settings.value.expenseTypes[0].value
  if (settings.value.paySources?.length) form.value.paySource = settings.value.paySources[0].value
})

async function onSubmit() {
  if (!form.value.amount || !form.value.expenseType || !form.value.paySource) {
    showToast('请填写必填项')
    return
  }
  let needsAttachment = false
  if (!uploadedFiles.value.length) {
    try {
      await showConfirmDialog({
        title: '无图保存',
        message: '未上传凭证，将标记为待补充凭证，是否继续？',
        confirmButtonColor: '#1F4D3A',
      })
      needsAttachment = true
    } catch {
      return
    }
  }
  loading.value = true
  try {
    const res = await api.post('/expenses', {
      ...form.value,
      amount: Number(form.value.amount),
      attachments: uploadedFiles.value.map((f) => ({ fileId: f.fileId, fileType: f.fileType })),
      needsAttachment,
      reimbursementStatus: form.value.paySource === '员工垫付' ? form.value.reimbursementStatus : 'not_required',
    })
    showToast('保存成功')
    router.push(`/expense/${res.data.data.id}`)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppShell title="记支出" show-back no-tab-pad fixed-bottom @back="router.back()">
    <LuxuryCard gold padding="20px 16px">
      <div class="amount-zone" :class="{ 'amount-zone--focus': amountFocused }">
        <div class="amount-zone__label">这笔花了多少钱</div>
        <div class="amount-zone__input-row">
          <span class="amount-zone__prefix">¥</span>
          <input
            v-model="form.amount"
            type="number"
            inputmode="decimal"
            class="amount-zone__input money"
            placeholder="0.00"
            @focus="amountFocused = true"
            @blur="amountFocused = false"
          />
        </div>
        <div v-if="displayAmount && form.amount" class="amount-zone__hint muted">{{ displayAmount }}</div>
      </div>
    </LuxuryCard>

    <LuxuryCard>
      <div class="section-title">支出类型</div>
      <div class="pill-row">
        <button
          v-for="t in settings.expenseTypes || []"
          :key="t.value"
          class="pill"
          :class="{ 'pill--active': form.expenseType === t.value }"
          @click="form.expenseType = t.value"
        >{{ t.label }}</button>
      </div>
    </LuxuryCard>

    <LuxuryCard>
      <div class="section-title">付款来源</div>
      <div class="pay-grid">
        <button
          v-for="s in settings.paySources || []"
          :key="s.value"
          class="pay-card"
          :class="{ 'pay-card--active': form.paySource === s.value }"
          @click="form.paySource = s.value"
        >{{ s.label }}</button>
      </div>
    </LuxuryCard>

    <LuxuryCard v-if="form.paySource === '员工垫付'">
      <div class="section-title">报销状态</div>
      <div class="segment">
        <button
          v-for="opt in [{ v: 'pending', l: '未报销' }, { v: 'reimbursed', l: '已报销' }, { v: 'not_required', l: '不需要' }]"
          :key="opt.v"
          class="segment__item"
          :class="{ 'segment__item--active': form.reimbursementStatus === opt.v }"
          @click="form.reimbursementStatus = opt.v"
        >{{ opt.l }}</button>
      </div>
      <van-field v-model="form.reimbursementPerson" label="报销人" placeholder="如：范帅" class="field-custom" />
    </LuxuryCard>

    <LuxuryCard>
      <van-field v-model="form.braceletCode" label="镯子编号" placeholder="可扫码，可为空" class="field-custom" />
      <van-field v-model="form.occurredAt" label="支出时间" type="date" class="field-custom" />
      <van-field v-model="form.expenseSummary" label="摘要" class="field-custom" />
      <van-field v-model="form.remark" label="备注" type="textarea" rows="2" class="field-custom" />
    </LuxuryCard>

    <LuxuryCard>
      <div class="section-title">凭证图片</div>
      <ImageUploader v-model="uploadedFiles" />
    </LuxuryCard>

    <template #footer>
      <ActionButton block size="lg" :loading="loading" @click="onSubmit">保存支出</ActionButton>
    </template>
  </AppShell>
</template>

<style scoped>
.amount-zone { transition: transform var(--duration-fast); }
.amount-zone--focus { transform: scale(1.01); }
.amount-zone__label { font-size: 13px; color: var(--color-text-sub); margin-bottom: 8px; }
.amount-zone__input-row { display: flex; align-items: baseline; gap: 4px; }
.amount-zone__prefix { font-size: 28px; font-weight: 600; color: var(--color-gold); }
.amount-zone__input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 36px;
  font-weight: 600;
  color: var(--color-text-main);
  outline: none;
  min-width: 0;
}
.amount-zone__input::placeholder { color: rgba(111, 119, 114, 0.35); font-size: 28px; }
.amount-zone__hint { margin-top: 6px; }

.pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
.pill {
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid rgba(198, 161, 91, 0.2);
  background: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  color: var(--color-text-sub);
  transition: all var(--duration-fast);
}
.pill--active {
  background: rgba(31, 77, 58, 0.12);
  border-color: var(--color-jade);
  color: var(--color-jade-deep);
  font-weight: 500;
}
.pill:active { transform: scale(0.97); }

.pay-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.pay-card {
  padding: 14px;
  border-radius: 14px;
  border: var(--border-gold);
  background: rgba(255, 255, 255, 0.45);
  font-size: 14px;
  color: var(--color-text-main);
  transition: all var(--duration-fast);
}
.pay-card--active {
  border-color: var(--color-gold);
  background: rgba(198, 161, 91, 0.1);
  box-shadow: var(--shadow-glow);
}
.pay-card:active { transform: scale(0.97); }

.segment {
  display: flex;
  background: rgba(111, 119, 114, 0.08);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 12px;
}
.segment__item {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  font-size: 13px;
  color: var(--color-text-sub);
}
.segment__item--active {
  background: var(--color-card);
  color: var(--color-jade-deep);
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(16, 22, 20, 0.06);
}

:deep(.field-custom) { background: transparent; }
:deep(.field-custom .van-cell) { background: transparent; padding-left: 0; padding-right: 0; }
</style>
