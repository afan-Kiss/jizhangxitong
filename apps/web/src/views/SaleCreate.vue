<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import api from '../api'
import { useBreakpoint } from '../composables/useBreakpoint'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'

const router = useRouter()
const { isDesktop } = useBreakpoint()
const form = ref({
  platform: '小红书',
  externalOrderNo: '',
  logisticsNo: '',
  customerName: '',
  braceletCode: '',
  saleAmount: '',
  depositAmount: '0',
  finalPaymentAmount: '',
  soldAt: new Date().toISOString().slice(0, 10),
  remark: '',
})
const costPreview = ref<any>(null)
const loading = ref(false)

async function syncBracelet() {
  if (!form.value.braceletCode) return
  try {
    const res = await api.get(`/bracelets/${form.value.braceletCode}`)
    const b = res.data.data
    const cost = await api.get(`/sales/cost-preview/${b.id}`)
    costPreview.value = { ...cost.data.data, bracelet: b }
    showToast('已查到货品信息')
  } catch (err: any) {
    showToast(err.response?.data?.message || '暂时查不到这个镯子')
  }
}

async function onSubmit() {
  if (!form.value.braceletCode || !form.value.saleAmount) {
    showToast('请填写镯子编号和销售金额')
    return
  }
  loading.value = true
  try {
    const res = await api.post('/sales', {
      ...form.value,
      saleAmount: Number(form.value.saleAmount),
      depositAmount: Number(form.value.depositAmount || 0),
      finalPaymentAmount: Number(form.value.finalPaymentAmount || form.value.saleAmount),
      braceletId: costPreview.value?.bracelet?.id,
    })
    try {
      await showConfirmDialog({
        title: '销售已登记',
        message: '接下来要做什么？',
        confirmButtonText: '查看销售详情',
        cancelButtonText: '继续登记',
        confirmButtonColor: '#1F4D3A',
      })
      router.push(`/sales/${res.data.data.id}`)
    } catch {
      form.value.externalOrderNo = ''
      form.value.logisticsNo = ''
      form.value.saleAmount = ''
      costPreview.value = null
      showToast('可以继续登记下一单')
    }
  } catch (err: any) {
    const msg = err.response?.data?.message || '保存失败，请重试'
    showToast(msg)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppShell title="销售登记" :show-back="!isDesktop" no-tab-pad @back="router.back()">
    <div class="desktop-two-column">
      <div class="desktop-two-column__main">
        <LuxuryCard>
          <van-cell-group inset>
            <van-field label="平台">
              <template #input>
                <van-radio-group v-model="form.platform" direction="horizontal">
                  <van-radio name="小红书">小红书</van-radio>
                  <van-radio name="微信私域">微信私域</van-radio>
                  <van-radio name="其他">其他</van-radio>
                </van-radio-group>
              </template>
            </van-field>
            <van-field v-model="form.externalOrderNo" label="订单号" />
            <van-field v-model="form.logisticsNo" label="物流单号" />
            <van-field v-model="form.customerName" label="客户昵称" />
            <van-field v-model="form.braceletCode" label="镯子编号" placeholder="输入编号后点查询" required>
              <template #button>
                <van-button size="small" type="primary" @click="syncBracelet">查询</van-button>
              </template>
            </van-field>
            <van-field v-model="form.saleAmount" label="销售金额" type="number" required />
            <van-field v-model="form.depositAmount" label="定金" type="number" />
            <van-field v-model="form.finalPaymentAmount" label="尾款" type="number" />
            <van-field v-model="form.soldAt" label="销售时间" type="date" />
            <van-field v-model="form.remark" label="备注" />
          </van-cell-group>
        </LuxuryCard>
      </div>

      <div class="desktop-two-column__aside">
        <LuxuryCard v-if="costPreview" gold>
          <div class="section-title">成本预览</div>
          <div class="cost-line">入库成本: ¥{{ costPreview.inboundCost }}</div>
          <div class="cost-line">证书费: ¥{{ costPreview.certificateFee }}</div>
          <div class="cost-line">包装盒: ¥{{ costPreview.packageFee }}</div>
          <div class="cost-line">快递费: ¥{{ costPreview.expressFee }}</div>
          <div class="cost-line">成本调整: ¥{{ costPreview.costAdjustment }}</div>
          <div class="cost-line"><strong>销售时总成本: ¥{{ costPreview.totalCost }}</strong></div>
          <div v-if="form.saleAmount" class="cost-line">
            <strong>预计毛利: ¥{{ (Number(form.saleAmount) - costPreview.totalCost).toFixed(2) }}</strong>
          </div>
        </LuxuryCard>

        <ActionButton block size="lg" :loading="loading" @click="onSubmit">保存销售</ActionButton>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.cost-line { padding: 6px 0; font-size: 14px; }
:deep(.van-cell-group--inset) { margin: 0; }
</style>
