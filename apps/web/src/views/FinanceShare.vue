<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { downloadFinanceExcel } from '../utils/finance-export'

const route = useRoute()
const loading = ref(true)
const error = ref('')
const data = ref<any>(null)

const api = axios.create({ baseURL: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`, timeout: 60000 })

onMounted(async () => {
  const token = route.params.token as string
  try {
    const res = await api.get(`/finance/share-links/${token}`)
    data.value = res.data.data
  } catch (err: unknown) {
    error.value = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '对账链接无效'
  } finally {
    loading.value = false
  }
})

function exportExcel() {
  if (!data.value) return
  const token = route.params.token as string
  downloadFinanceExcel({
    startDate: data.value.startDate,
    endDate: data.value.endDate,
    title: data.value.title,
    token,
  }).catch(() => { error.value = 'Excel 导出失败' })
}

function printPage() {
  window.print()
}
</script>

<template>
  <div class="fshare">
    <div v-if="loading" class="fshare__state">加载中…</div>
    <div v-else-if="error" class="fshare__state fshare__state--error">{{ error }}</div>
    <template v-else-if="data">
      <header class="fshare__header">
        <div>
          <h1>{{ data.title }}</h1>
          <p>时间范围：{{ data.startDate }} 至 {{ data.endDate }}</p>
          <p class="fshare__muted">生成时间：{{ new Date(data.generatedAt).toLocaleString() }}</p>
          <p v-if="data.expiresAt" class="fshare__muted">链接有效期至：{{ new Date(data.expiresAt).toLocaleString() }}</p>
        </div>
        <div class="fshare__actions">
          <button type="button" class="fshare__btn fshare__btn--gold" @click="exportExcel">下载 Excel</button>
          <button type="button" class="fshare__btn" @click="printPage">打印</button>
        </div>
      </header>

      <section class="fshare__kpis">
        <div class="fshare__kpi"><span>总金额</span><strong>¥{{ Number(data.summary.totalAmount).toFixed(2) }}</strong></div>
        <div class="fshare__kpi"><span>支出笔数</span><strong>{{ data.summary.totalCount }}</strong></div>
        <div class="fshare__kpi"><span>待补凭证</span><strong>{{ data.summary.needsAttachmentCount }}</strong></div>
        <div class="fshare__kpi"><span>有凭证笔数</span><strong>{{ data.summary.withVoucherCount ?? 0 }}</strong></div>
        <div class="fshare__kpi"><span>未关联订单/物流</span><strong>{{ data.summary.unlinkedOrderLogisticsCount ?? 0 }}</strong></div>
      </section>

      <section v-if="!data.summary.totalCount" class="fshare__empty">
        <h2>当前时间范围内还没有支出</h2>
        <p>
          本链接时间范围为 {{ data.startDate }} 至 {{ data.endDate }}。
          记一笔支出并落在该范围内后，刷新此页即可看到对账数据。
        </p>
      </section>

      <section v-if="data.byType?.length" class="fshare__card">
        <h2>分类汇总</h2>
        <table class="fshare__table">
          <thead><tr><th>分类</th><th>金额</th><th>笔数</th><th>占比</th></tr></thead>
          <tbody>
            <tr v-for="row in data.byType" :key="row.name">
              <td>{{ row.name }}</td>
              <td class="num">¥{{ row.amount.toFixed(2) }}</td>
              <td>{{ row.count }}</td>
              <td>{{ (row.ratio * 100).toFixed(1) }}%</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="data.byOperator?.length" class="fshare__card">
        <h2>经手人汇总</h2>
        <table class="fshare__table">
          <thead><tr><th>经手人</th><th>金额</th><th>笔数</th></tr></thead>
          <tbody>
            <tr v-for="row in data.byOperator" :key="row.name">
              <td>{{ row.name }}</td>
              <td class="num">¥{{ row.amount.toFixed(2) }}</td>
              <td>{{ row.count }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="data.byPaySource?.length" class="fshare__card">
        <h2>付款来源汇总</h2>
        <table class="fshare__table">
          <thead><tr><th>付款来源</th><th>金额</th><th>笔数</th></tr></thead>
          <tbody>
            <tr v-for="row in data.byPaySource" :key="row.name">
              <td>{{ row.name }}</td>
              <td class="num">¥{{ row.amount.toFixed(2) }}</td>
              <td>{{ row.count }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="data.details?.length" class="fshare__card">
        <h2>支出明细</h2>
        <div class="fshare__table-wrap">
          <table class="fshare__table">
            <thead>
              <tr>
                <th>日期</th><th>分类</th><th>用途</th><th>金额</th><th>经手人</th><th>付款来源</th>
                <th>关联</th><th>凭证</th><th>备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in data.details" :key="row.id">
                <td>{{ row.occurredAt }}</td>
                <td>{{ row.expenseType }}</td>
                <td>{{ row.expensePurpose || '普通支出' }}</td>
                <td class="num">¥{{ row.amount.toFixed(2) }}</td>
                <td>{{ row.operatorName }}</td>
                <td>{{ row.paySource }}</td>
                <td>{{ row.linkText }}</td>
                <td>
                  <template v-if="row.voucherLinks?.length">
                    <a v-for="(u, i) in row.voucherLinks" :key="i" :href="u" target="_blank" rel="noopener">图{{ i + 1 }}</a>
                  </template>
                  <span v-else>{{ row.voucherLabel }}</span>
                </td>
                <td>{{ row.remark || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.fshare {
  min-height: 100vh;
  background: #f7f4ec;
  color: #1f2933;
  padding: 20px 16px 40px;
}
.fshare__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.fshare h1 { margin: 0 0 8px; font-size: 22px; }
.fshare__muted { color: #667085; font-size: 13px; margin: 4px 0 0; }
.fshare__actions { display: flex; gap: 8px; }
.fshare__btn {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid #e9e1d0;
  background: #fff;
  cursor: pointer;
}
.fshare__btn--gold {
  background: linear-gradient(135deg, #c7a45d, #b08d57);
  border-color: #b08d57;
  color: #fff;
}
.fshare__kpis {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
@media (min-width: 768px) { .fshare__kpis { grid-template-columns: repeat(4, 1fr); } }
.fshare__kpi {
  background: #fff;
  border: 1px solid #e9e1d0;
  border-radius: 12px;
  padding: 14px;
}
.fshare__kpi span { display: block; font-size: 12px; color: #667085; }
.fshare__kpi strong { display: block; margin-top: 6px; font-size: 18px; color: #b08d57; }
.fshare__card {
  background: #fff;
  border: 1px solid #e9e1d0;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}
.fshare__card h2 { margin: 0 0 12px; font-size: 16px; }
.fshare__table-wrap { overflow-x: auto; }
.fshare__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.fshare__table th, .fshare__table td {
  padding: 8px 10px;
  border-bottom: 1px solid #f0ebe0;
  text-align: left;
}
.fshare__table th { background: #f8f7f3; color: #667085; }
.fshare__table .num { text-align: right; font-weight: 600; color: #b08d57; }
.fshare__state { text-align: center; padding: 48px 16px; color: #667085; }
.fshare__state--error { color: #c44; }
.fshare__empty {
  background: #fff;
  border: 1px dashed #e9e1d0;
  border-radius: 12px;
  padding: 28px 20px;
  margin-bottom: 16px;
  text-align: center;
}
.fshare__empty h2 {
  margin: 0 0 10px;
  font-size: 16px;
  color: #1f2933;
}
.fshare__empty p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #667085;
}
@media print { .fshare__actions { display: none; } }
</style>
