<script setup lang="ts">
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const steps = [
  { n: 1, title: '扫镯子', desc: '镯子页输入编号，从扫码枪同步成本与图片', path: '/bracelets' },
  { n: 2, title: '记一笔支出', desc: '记支出页填写金额、类型、报销人', path: '/expense/create' },
  { n: 3, title: '上传付款截图', desc: '支出详情上传付款截图（需 Worker 在线）', path: '/expense/create' },
  { n: 4, title: '登记销售', desc: '销售页登记金额，自动算毛利', path: '/sales/create' },
  { n: 5, title: '导出 Excel 报销', desc: '我的 → 报销导出，内嵌截图', path: '/expense/export' },
  { n: 6, title: '查看体检状态', desc: '电脑双击「一键系统体检.bat」', path: '/settings' },
]
</script>

<template>
  <AppShell title="新手试用流程">
    <LuxuryCard gold>
      <p class="intro">试用模式下的数据带「试用」标签，可一键清理或转正式，不会污染正式账本。</p>
    </LuxuryCard>

    <LuxuryCard v-for="s in steps" :key="s.n">
      <div class="step">
        <div class="step__n">{{ s.n }}</div>
        <div>
          <div class="step__title">{{ s.title }}</div>
          <div class="step__desc muted">{{ s.desc }}</div>
          <ActionButton variant="ghost" @click="router.push(s.path)">去试试</ActionButton>
        </div>
      </div>
    </LuxuryCard>
  </AppShell>
</template>

<style scoped>
.intro { font-size: 14px; line-height: 1.6; margin: 0; }
.step { display: flex; gap: 14px; align-items: flex-start; }
.step__n {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--color-gold-soft); color: var(--color-jade-deep);
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; flex-shrink: 0;
}
.step__title { font-size: 16px; font-weight: 500; }
.step__desc { font-size: 13px; margin: 4px 0 8px; }
</style>
