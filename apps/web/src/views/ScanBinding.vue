<script setup lang="ts">
import { useRouter } from 'vue-router'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'

const router = useRouter()
</script>

<template>
  <div class="scan-paused page-enter" data-testid="scan-binding-page">
    <LuxuryCard padding="20px 16px">
      <h1 class="scan-paused__title">扫码绑定功能已暂停</h1>
      <p class="scan-paused__lead">现在先直接记账，少一步操作。</p>
      <p class="scan-paused__hint muted">
        请直接使用记支出、销售登记、镯子查询。需要查货品时，请去镯子查询；需要登记成交时，请去销售登记。
      </p>

      <div class="scan-paused__ops">
        <ActionButton
          block
          data-testid="scan-paused-expense-btn"
          @click="router.push('/expense/create')"
        >
          去记支出
        </ActionButton>
        <ActionButton
          block
          plain
          data-testid="scan-paused-sale-btn"
          @click="router.push('/sales/create')"
        >
          去销售登记
        </ActionButton>
        <ActionButton
          block
          plain
          data-testid="scan-paused-bracelet-btn"
          @click="router.push('/bracelets')"
        >
          去镯子查询
        </ActionButton>
      </div>
    </LuxuryCard>
  </div>
</template>

<style scoped>
.scan-paused {
  overflow-x: hidden;
  max-width: 100%;
}

.scan-paused__title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 12px;
  color: var(--color-text, #333);
}

.scan-paused__lead {
  font-size: 16px;
  margin: 0 0 8px;
  line-height: 1.5;
}

.scan-paused__hint {
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 20px;
}

.scan-paused__ops {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
