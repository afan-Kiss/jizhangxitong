<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { showToast } from 'vant'
import ActionButton from '../components/ActionButton.vue'
import LuxuryCard from '../components/LuxuryCard.vue'

const router = useRouter()
const auth = useAuthStore()
const username = ref('admin')
const password = ref('admin123')
const loading = ref(false)

async function onLogin() {
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    showToast('登录成功')
    router.push('/')
  } catch { /* */ }
  finally { loading.value = false }
}
</script>

<template>
  <div class="login page-enter">
    <div class="login__hero">
      <div class="login__brand">和田玉镯子记账</div>
      <div class="login__tagline">老板随身财务工作台</div>
    </div>
    <LuxuryCard gold padding="24px 20px">
      <van-field v-model="username" label="用户名" placeholder="请输入" />
      <van-field v-model="password" type="password" label="密码" placeholder="请输入" />
      <div style="margin-top:20px">
        <ActionButton block size="lg" :loading="loading" @click="onLogin">进入系统</ActionButton>
      </div>
    </LuxuryCard>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  padding: 80px 20px 40px;
  background: var(--color-bg);
}
.login__hero {
  text-align: center;
  margin-bottom: 32px;
}
.login__brand {
  font-size: 26px;
  font-weight: 600;
  color: var(--color-text-main);
  letter-spacing: 0.04em;
}
.login__tagline {
  margin-top: 8px;
  font-size: 14px;
  color: var(--color-text-sub);
}
</style>
