<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'
import { loadQianfanConfig, useQianfan } from '../composables/useQianfan'
import ActionButton from '../components/ActionButton.vue'

const route = useRoute()
const router = useRouter()
const { qianfanEnabled, copyOrderNo, openQianfan } = useQianfan()
const sale = ref<any>(null)

onMounted(async () => {
  await loadQianfanConfig(api)
  const res = await api.get(`/sales/${route.params.id}`)
  sale.value = res.data.data
})

async function onRefund() {
  const amount = prompt('退款金额', String(sale.value?.saleAmount || ''))
  if (!amount) return
  await api.post(`/sales/${route.params.id}/refund`, {
    refundAmount: Number(amount),
    refundReason: '客户退款',
  })
  showToast('已处理退款')
  const res = await api.get(`/sales/${route.params.id}`)
  sale.value = res.data.data
}
</script>

<template>
  <div class="page" v-if="sale">
    <van-nav-bar title="销售详情" left-arrow @click-left="router.back()" />
    <div class="card">
      <div class="stat-value">¥{{ Number(sale.saleAmount).toFixed(2) }}</div>
      <div>{{ sale.braceletCode }} · {{ sale.platform }} · {{ sale.status }}</div>
      <div class="muted">{{ sale.customerName || '-' }} · {{ sale.soldAt?.slice(0, 10) }}</div>
    </div>
    <van-cell-group inset>
      <van-cell v-if="sale.externalOrderNo" title="小红书订单号" :value="sale.externalOrderNo" data-testid="sale-detail-order-no">
        <template #extra>
          <ActionButton size="md" plain @click="copyOrderNo(sale.externalOrderNo)">复制</ActionButton>
          <ActionButton v-if="qianfanEnabled" size="md" plain data-testid="sale-open-qianfan" @click="openQianfan(sale.externalOrderNo)">打开千帆</ActionButton>
        </template>
      </van-cell>
      <van-cell title="入库成本" :value="`¥${Number(sale.inboundCostSnapshot).toFixed(2)}`" />
      <van-cell title="证书费" :value="`¥${Number(sale.certificateFeeSnapshot).toFixed(2)}`" />
      <van-cell title="包装盒费" :value="`¥${Number(sale.packageFeeSnapshot).toFixed(2)}`" />
      <van-cell title="快递费" :value="`¥${Number(sale.expressFeeSnapshot).toFixed(2)}`" />
      <van-cell title="成本调整" :value="`¥${Number(sale.costAdjustmentSnapshot).toFixed(2)}`" />
      <van-cell title="销售时总成本" :value="`¥${Number(sale.totalCostSnapshot).toFixed(2)}`" />
      <van-cell title="销售毛利" :value="`¥${Number(sale.grossProfit).toFixed(2)}`" />
      <van-cell title="客户相关支出" :value="`¥${Number(sale.customerPaymentDeduction ?? sale.compensationAmount).toFixed(2)}`" />
      <van-cell title="最终到手利润" :value="`¥${Number(sale.finalProfit).toFixed(2)}`" />
    </van-cell-group>

    <div class="card" v-if="sale.expenses?.length">
      <h4>相关支出</h4>
      <div v-for="e in sale.expenses" :key="e.id" class="list-item" @click="router.push(`/expense/${e.id}`)">
        {{ e.expenseType }} · ¥{{ Number(e.amount).toFixed(2) }}
      </div>
    </div>

    <div style="padding:16px;">
      <van-button v-if="sale.status === 'sold'" type="warning" block @click="onRefund">处理退款</van-button>
    </div>
  </div>
</template>
