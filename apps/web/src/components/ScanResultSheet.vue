<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import ActionButton from './ActionButton.vue'
import OrderLink from './OrderLink.vue'
import BraceletCard from './BraceletCard.vue'
import type { useScanOverlay } from '../composables/useScanOverlay'

const props = defineProps<{
  visible: boolean
  scan: ReturnType<typeof useScanOverlay>
}>()

const emit = defineEmits<{ close: [] }>()
const router = useRouter()

const result = computed(() => props.scan.result.value)
const profit = computed(() => props.scan.profit.value)
const bindGoodsCode = computed({
  get: () => props.scan.bindGoodsCode.value,
  set: (v: string) => {
    props.scan.bindGoodsCode.value = v
  },
})

function close() {
  emit('close')
}

function onCreateGoods() {
  const code = result.value?.normalizedCode || ''
  props.scan.createGoods(code)
}

function onManualOrder() {
  props.scan.goManualOrderExpense()
  close()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible && result" class="scan-result-sheet" data-testid="scan-result-sheet">
      <div class="scan-result-sheet__backdrop" @click="close" />
      <div class="scan-result-sheet__panel glass-surface">
        <header class="scan-result-sheet__head">
          <h3>识别结果</h3>
          <button type="button" class="scan-result-sheet__close" aria-label="关闭" data-testid="scan-result-close" @click="close">×</button>
        </header>

        <div class="scan-result-sheet__body" data-testid="scan-result-card">
          <div class="scan-result-sheet__meta">
            <span>类型：{{ result.scanTypeLabel }}</span>
            <span>编码：{{ result.normalizedCode }}</span>
            <span>{{ result.matched ? '已找到记录' : '未找到记录' }}</span>
          </div>
          <p class="scan-result-sheet__suggestion">{{ result.suggestion }}</p>

          <div v-if="result.goods" data-testid="scan-goods-card">
            <div class="section-title">货品</div>
            <BraceletCard
              :code="result.goods.code"
              :status="result.goods.status"
              :inbound-cost="result.goods.costTotal"
              show-cost
            />
            <div v-if="profit?.summary" class="scan-result-sheet__profit">
              <div>当前成本：¥{{ Number(profit.costs?.costTotal ?? 0).toFixed(2) }}</div>
              <div v-if="profit.summary.isSold">
                最终利润：¥{{ Number(profit.summary.finalProfit).toFixed(2) }}
              </div>
              <div v-if="profit.summary.isLoss" class="loss-tag" data-testid="scan-loss-hint">这件目前是亏的</div>
            </div>
            <ActionButton block data-testid="scan-expense-btn" @click="scan.goExpense(); close()">记一笔支出</ActionButton>
          </div>

          <div v-if="result.order" data-testid="scan-order-card">
            <div class="section-title">订单</div>
            <OrderLink :order-no="result.order.orderNo" data-testid="scan-order-link" />
            <div v-if="result.order.logisticsNo">物流：{{ result.order.logisticsNo }}</div>
            <div>状态：{{ result.order.orderStatus }}</div>
            <div v-if="result.order.braceletCode">关联货品：{{ result.order.braceletCode }}</div>
            <div class="scan-result-sheet__actions">
              <ActionButton block data-testid="scan-customer-refund-btn" @click="scan.goCustomerExpense('customer_refund'); close()">记客户返款</ActionButton>
              <ActionButton block plain data-testid="scan-customer-comp-btn" @click="scan.goCustomerExpense('customer_compensation'); close()">记客户补偿</ActionButton>
              <ActionButton block plain data-testid="scan-after-sale-btn" @click="scan.goCustomerExpense('after_sale_compensation'); close()">记售后补偿</ActionButton>
              <ActionButton block plain data-testid="scan-order-profit-btn" @click="scan.goOrderProfit(); close()">按这个订单记账</ActionButton>
            </div>
            <div v-if="result.order.needsGoodsBinding" class="scan-result-sheet__bind">
              <input v-model="bindGoodsCode" class="scan-result-sheet__bind-input" placeholder="输入货品码关联" />
              <ActionButton data-testid="scan-bind-goods-btn" @click="scan.bindOrderGoods()">关联这个货品</ActionButton>
            </div>
          </div>

          <div v-if="!result.matched && result.scanType === 'unknown'" class="scan-result-sheet__unknown">
            <ActionButton block plain @click="router.push('/expense/create'); close()">手动记账</ActionButton>
            <ActionButton block plain data-testid="scan-manual-order-btn" @click="onManualOrder">按订单号查找并记账</ActionButton>
            <ActionButton block plain @click="onCreateGoods">用这个编码新建货品</ActionButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.scan-result-sheet {
  position: fixed;
  inset: 0;
  z-index: 5100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.scan-result-sheet__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(6, 9, 8, 0.62);
}
.scan-result-sheet__panel {
  position: relative;
  width: min(560px, 100%);
  max-height: min(82vh, 720px);
  border-radius: 18px 18px 0 0;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: linear-gradient(145deg, rgba(22, 30, 27, 0.98), rgba(12, 16, 14, 0.99));
  border: 1px solid rgba(198, 161, 91, 0.28);
}
.scan-result-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.scan-result-sheet__head h3 {
  margin: 0;
  font-size: 16px;
  color: var(--color-text-light);
}
.scan-result-sheet__close {
  border: none;
  background: transparent;
  color: var(--color-text-sub);
  font-size: 24px;
  line-height: 1;
}
.scan-result-sheet__body {
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 8px;
}
.scan-result-sheet__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  margin-bottom: 8px;
}
.scan-result-sheet__suggestion {
  font-size: 15px;
  margin: 0 0 16px;
  line-height: 1.5;
}
.scan-result-sheet__profit {
  margin: 12px 0;
  font-size: 14px;
  line-height: 1.6;
}
.scan-result-sheet__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.scan-result-sheet__bind {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.scan-result-sheet__bind-input {
  padding: 14px 12px;
  min-height: 48px;
  border-radius: 10px;
  border: var(--border-glass);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-light);
  font-size: 16px;
}
.scan-result-sheet__unknown {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.loss-tag {
  color: #ee0a24;
  font-weight: 600;
  margin-top: 6px;
}
@media (min-width: 768px) {
  .scan-result-sheet {
    align-items: center;
    padding: 24px;
  }
  .scan-result-sheet__panel {
    border-radius: 18px;
    max-height: min(88vh, 760px);
  }
}
</style>
