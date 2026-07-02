<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  type DateRangeState,
  type DateRangeKey,
  RANGE_PRESETS,
  resolveDateRange,
  rangeLabel,
  formatDisplayDate,
  last7Days,
  last30Days,
} from '../utils/date-range'

const props = withDefaults(
  defineProps<{
     modelValue: DateRangeState
  /** dark：系统默认深色；light：报账中心等浅色页面 */
  theme?: 'dark' | 'light'
}>(),
  { theme: 'dark' },
)

const emit = defineEmits<{
  'update:modelValue': [DateRangeState]
  change: [DateRangeState]
}>()

const showPicker = ref(false)
const draftStart = ref('')
const draftEnd = ref('')
const toastMsg = ref('')
const isDesktop = ref(typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true)

const currentLabel = computed(() => rangeLabel(props.modelValue))

function selectPreset(key: DateRangeKey) {
  const next = resolveDateRange(key)
  emit('update:modelValue', next)
  emit('change', next)
}

function openCustom() {
  draftStart.value = props.modelValue.startDate
  draftEnd.value = props.modelValue.endDate
  showPicker.value = true
}

function closeCustom() {
  showPicker.value = false
}

function applyShortcut(kind: 'last7' | 'last30' | 'this_month' | 'last_month') {
  if (kind === 'last7') {
    const s = last7Days()
    draftStart.value = s.startDate
    draftEnd.value = s.endDate
  } else if (kind === 'last30') {
    const s = last30Days()
    draftStart.value = s.startDate
    draftEnd.value = s.endDate
  } else if (kind === 'this_month') {
    const s = resolveDateRange('this_month')
    draftStart.value = s.startDate
    draftEnd.value = s.endDate
  } else {
    const s = resolveDateRange('last_month')
    draftStart.value = s.startDate
    draftEnd.value = s.endDate
  }
}

function confirmCustom() {
  if (!draftStart.value || !draftEnd.value) return
  if (draftEnd.value < draftStart.value) {
    toastMsg.value = '结束日期不能早于开始日期'
    return
  }
  const next: DateRangeState = {
    range: 'custom',
    startDate: draftStart.value,
    endDate: draftEnd.value,
  }
  emit('update:modelValue', next)
  emit('change', next)
  toastMsg.value = `已切换到 ${formatDisplayDate(next.startDate)} 至 ${formatDisplayDate(next.endDate)}`
  showPicker.value = false
  setTimeout(() => { toastMsg.value = '' }, 2800)
}

function onMedia(e: MediaQueryListEvent | MediaQueryList) {
  isDesktop.value = e.matches
}

let mq: MediaQueryList | null = null
onMounted(() => {
  mq = window.matchMedia('(min-width: 768px)')
  isDesktop.value = mq.matches
  mq.addEventListener('change', onMedia)
})
onUnmounted(() => {
  mq?.removeEventListener('change', onMedia)
})

watch(showPicker, (open) => {
  if (open) {
    draftStart.value = props.modelValue.startDate
    draftEnd.value = props.modelValue.endDate
    toastMsg.value = ''
  }
})
</script>

<template>
  <div
    class="date-range-picker"
    :class="{ 'date-range-picker--light': theme === 'light' }"
    data-testid="date-range-picker"
  >
    <div class="date-range-picker__header">
      <span class="date-range-picker__title">经营时间范围</span>
      <span class="date-range-picker__current" data-testid="date-range-label">{{ currentLabel }}</span>
    </div>

    <div class="date-range-picker__presets">
      <button
        v-for="p in RANGE_PRESETS"
        :key="p.key"
        type="button"
        class="date-range-picker__preset"
        :class="{ 'date-range-picker__preset--active': modelValue.range === p.key }"
        :data-testid="`range-${p.key}`"
        @click="selectPreset(p.key)"
      >
        {{ p.label }}
      </button>
      <button
        type="button"
        class="date-range-picker__preset"
        :class="{ 'date-range-picker__preset--active': modelValue.range === 'custom' }"
        data-testid="range-custom"
        @click="openCustom"
      >
        自定义日期
      </button>
    </div>

    <p v-if="toastMsg" class="date-range-picker__toast" data-testid="date-range-toast">{{ toastMsg }}</p>

    <Teleport to="body">
      <div v-if="showPicker" class="date-range-picker__overlay" @click.self="closeCustom">
        <div
          class="date-range-picker__modal"
          :class="{
            'date-range-picker__modal--drawer': !isDesktop,
            'date-range-picker__modal--light': theme === 'light',
            'glass-surface': theme !== 'light',
          }"
          data-testid="date-range-modal"
        >
          <div class="date-range-picker__modal-head">
            <h3>选时间段</h3>
            <button type="button" class="date-range-picker__close" aria-label="关闭" @click="closeCustom">×</button>
          </div>

          <div class="date-range-picker__shortcuts">
            <button type="button" data-testid="shortcut-last7" @click="applyShortcut('last7')">最近 7 天</button>
            <button type="button" data-testid="shortcut-last30" @click="applyShortcut('last30')">最近 30 天</button>
            <button type="button" data-testid="shortcut-this-month" @click="applyShortcut('this_month')">本月</button>
            <button type="button" data-testid="shortcut-last-month" @click="applyShortcut('last_month')">上月</button>
          </div>

          <div class="date-range-picker__fields">
            <label class="date-range-picker__field">
              <span>开始日期</span>
              <div class="date-range-picker__input-wrap">
                <input v-model="draftStart" type="date" data-testid="date-start" />
              </div>
            </label>
            <label class="date-range-picker__field">
              <span>结束日期</span>
              <div class="date-range-picker__input-wrap">
                <input v-model="draftEnd" type="date" data-testid="date-end" />
              </div>
            </label>
          </div>

          <p v-if="draftEnd && draftStart && draftEnd < draftStart" class="date-range-picker__error">
            结束日期不能早于开始日期
          </p>

          <div class="date-range-picker__actions">
            <button type="button" class="date-range-picker__btn date-range-picker__btn--ghost" @click="closeCustom">
              先不选
            </button>
            <button
              type="button"
              class="date-range-picker__btn date-range-picker__btn--primary"
              data-testid="date-range-confirm"
              :disabled="!draftStart || !draftEnd || draftEnd < draftStart"
              @click="confirmCustom"
            >
              看这段时间
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.date-range-picker {
  margin-bottom: 14px;
}
.date-range-picker__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 12px;
  margin-bottom: 10px;
}
.date-range-picker__title {
  font-size: 13px;
  color: rgba(248, 243, 232, 0.72);
}
.date-range-picker__current {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-gold-light);
}
.date-range-picker__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.date-range-picker__preset {
  border: 1px solid rgba(215, 181, 109, 0.28);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-light);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
  transition: transform var(--duration-fast), border-color var(--duration-fast), box-shadow var(--duration-fast);
}
.date-range-picker__preset--active {
  border-color: var(--color-gold);
  background: rgba(198, 161, 91, 0.14);
  box-shadow: var(--shadow-glow);
}
@media (hover: hover) {
  .date-range-picker__preset:hover {
    transform: translateY(-1px);
    border-color: rgba(198, 161, 91, 0.45);
  }
}
.date-range-picker__toast {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--color-gold-light);
}
.date-range-picker__overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(6, 9, 8, 0.72);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.date-range-picker__modal {
  width: min(420px, 100%);
  border-radius: 18px;
  border: 1px solid rgba(198, 161, 91, 0.35);
  box-shadow: var(--shadow-glow), var(--shadow-card);
  padding: 18px 16px 16px;
  background: linear-gradient(145deg, rgba(22, 30, 27, 0.96), rgba(12, 16, 14, 0.98));
}
.date-range-picker__modal--drawer {
  align-self: flex-end;
  width: 100%;
  max-width: 100%;
  border-radius: 18px 18px 0 0;
  margin-top: auto;
}
.date-range-picker__modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.date-range-picker__modal-head h3 {
  margin: 0;
  font-size: 16px;
  color: var(--color-text-light);
}
.date-range-picker__close {
  border: none;
  background: transparent;
  color: var(--color-text-sub);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.date-range-picker__shortcuts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 14px;
}
.date-range-picker__shortcuts button {
  border: 1px solid rgba(198, 161, 91, 0.25);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-light);
  border-radius: 12px;
  padding: 10px 8px;
  font-size: 12px;
  cursor: pointer;
}
.date-range-picker__fields {
  display: grid;
  gap: 12px;
  margin-bottom: 12px;
}
.date-range-picker__field span {
  display: block;
  font-size: 12px;
  color: var(--color-text-sub);
  margin-bottom: 6px;
}
.date-range-picker__input-wrap {
  border: 1px solid rgba(198, 161, 91, 0.3);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 10px;
}
.date-range-picker__input-wrap input {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text-light);
  font-size: 14px;
  padding: 10px 0;
  color-scheme: dark;
}
.date-range-picker__input-wrap input::-webkit-calendar-picker-indicator {
  filter: invert(0.85) sepia(0.3) saturate(2);
  cursor: pointer;
}
.date-range-picker__error {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--color-danger);
}
.date-range-picker__actions {
  display: flex;
  gap: 10px;
}
.date-range-picker__btn {
  flex: 1;
  border-radius: 12px;
  padding: 12px 10px;
  font-size: 14px;
  cursor: pointer;
  border: none;
}
.date-range-picker__btn--ghost {
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-sub);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.date-range-picker__btn--primary {
  background: linear-gradient(135deg, var(--color-jade-deep), rgba(198, 161, 91, 0.85));
  color: var(--color-text-light);
  font-weight: 600;
}
.date-range-picker__btn--primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 浅色主题（报账中心等） */
.date-range-picker--light .date-range-picker__title {
  color: #667085;
}
.date-range-picker--light .date-range-picker__current {
  color: #b08d57;
}
.date-range-picker--light .date-range-picker__preset {
  border-color: #e9e1d0;
  background: #fff;
  color: #1f2933;
}
.date-range-picker--light .date-range-picker__preset--active {
  border-color: #b08d57;
  background: #faf6ee;
  box-shadow: 0 0 0 2px rgba(176, 141, 87, 0.12);
}
.date-range-picker--light .date-range-picker__toast {
  color: #b08d57;
}
.date-range-picker--light .date-range-picker__overlay {
  background: rgba(31, 41, 51, 0.35);
}
.date-range-picker__modal--light {
  background: #fff;
  border-color: #e9e1d0;
  box-shadow: 0 12px 40px rgba(31, 41, 51, 0.12);
}
.date-range-picker__modal--light .date-range-picker__modal-head h3 {
  color: #1f2933;
}
.date-range-picker__modal--light .date-range-picker__close {
  color: #667085;
}
.date-range-picker__modal--light .date-range-picker__shortcuts button {
  border-color: #e9e1d0;
  background: #faf8f3;
  color: #1f2933;
}
.date-range-picker__modal--light .date-range-picker__field span {
  color: #667085;
}
.date-range-picker__modal--light .date-range-picker__input-wrap {
  border-color: #e9e1d0;
  background: #fff;
}
.date-range-picker__modal--light .date-range-picker__input-wrap input {
  color: #1f2933;
  color-scheme: light;
}
.date-range-picker__modal--light .date-range-picker__input-wrap input::-webkit-calendar-picker-indicator {
  filter: none;
}
.date-range-picker__modal--light .date-range-picker__btn--ghost {
  background: #f8f7f3;
  color: #667085;
  border-color: #e9e1d0;
}
.date-range-picker__modal--light .date-range-picker__btn--primary {
  background: linear-gradient(135deg, #c7a45d, #b08d57);
  color: #fff;
}
</style>
