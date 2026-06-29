<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = withDefaults(defineProps<{
  value: number
  duration?: number
  prefix?: string
  decimals?: number
}>(), {
  duration: 480,
  prefix: '¥',
  decimals: 2,
})

const display = ref(0)

function animate(to: number) {
  const from = display.value
  const start = performance.now()
  const dur = props.duration

  function tick(now: number) {
    const p = Math.min((now - start) / dur, 1)
    const eased = 1 - Math.pow(1 - p, 3)
    display.value = from + (to - from) * eased
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

watch(() => props.value, (v) => animate(v), { immediate: false })
onMounted(() => animate(props.value))
</script>

<template>
  <span class="money count-up">{{ prefix }}{{ display.toFixed(decimals) }}</span>
</template>

<style scoped>
.count-up {
  display: inline-block;
}
</style>
