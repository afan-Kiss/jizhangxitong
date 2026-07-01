<script setup lang="ts">
defineProps<{
  moduleName?: string
  message?: string
}>()

import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'

const router = useRouter()
</script>

<template>
  <AppShell :title="moduleName ? `${moduleName}已停用` : '功能已停用'" data-testid="module-disabled-page" @back="router.push('/')">
    <LuxuryCard padding="18px 16px">
      <p class="module-disabled__text" data-testid="module-disabled-message">
        {{ message || `${moduleName || '这个模块'}已经停用，请回到首页继续使用记支出、扫码工作台等功能。` }}
      </p>
      <ActionButton block data-testid="module-disabled-home" @click="router.push('/')">返回首页</ActionButton>
    </LuxuryCard>
  </AppShell>
</template>

<style scoped>
.module-disabled__text {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-sub);
}
</style>
