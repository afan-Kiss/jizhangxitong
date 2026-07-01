<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'
import { useBreakpoint } from '../composables/useBreakpoint'

defineProps<{
  moduleName?: string
}>()

const router = useRouter()
const { isDesktop } = useBreakpoint()
</script>

<template>
  <AppShell :title="moduleName ? `${moduleName}已停用` : '功能已停用'" data-testid="module-disabled-page" @back="router.push('/')">
    <LuxuryCard padding="18px 16px">
      <p class="module-disabled__text">
        {{ moduleName || '这个模块' }}已经停用，请回到首页继续使用记支出、报销、扫码工作台等功能。
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
