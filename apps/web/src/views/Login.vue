<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, formatAuthError } from '../stores/auth'
import { showToast } from 'vant'
import ActionButton from '../components/ActionButton.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import api from '../api'
import { validateLoginForm } from '../utils/login-form'
import { resolveApiErrorMessage } from '../utils/api-errors'

const router = useRouter()
const auth = useAuthStore()
const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const displayName = ref('')
const phone = ref('')
const loading = ref(false)

async function onLogin() {
  const validationError = validateLoginForm(username.value, password.value)
  if (validationError) {
    showToast(validationError)
    return
  }

  loading.value = true
  try {
    await auth.login(username.value.trim(), password.value)
    showToast('登录成功')
    await router.push('/')
  } catch (err) {
    showToast(formatAuthError(err) || resolveApiErrorMessage(err))
  } finally {
    loading.value = false
  }
}

async function onRegister() {
  if (!username.value.trim()) {
    showToast('请填写登录账号')
    return
  }
  if (!displayName.value.trim()) {
    showToast('请填写显示名（员工姓名）')
    return
  }
  if (!password.value || password.value.length < 6) {
    showToast('密码至少 6 位')
    return
  }
  if (password.value !== confirmPassword.value) {
    showToast('两次密码不一致')
    return
  }

  loading.value = true
  try {
    const res = await api.post('/auth/register', {
      username: username.value.trim(),
      password: password.value,
      confirmPassword: confirmPassword.value,
      displayName: displayName.value.trim(),
      phone: phone.value.trim() || undefined,
    })
    showToast(res.data.message || '注册成功，等管理员审核通过后就能登录。')
    mode.value = 'login'
    password.value = ''
    confirmPassword.value = ''
  } catch (err) {
    showToast(resolveApiErrorMessage(err))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page page-enter" data-testid="login-page">
    <div class="login-page__inner">
      <div class="login__hero">
        <div class="login__brand">和田玉镯子记账</div>
        <div class="login__tagline">老板随身财务工作台</div>
      </div>
      <LuxuryCard gold padding="24px 20px">
        <template v-if="mode === 'login'">
          <van-field
            v-model="username"
            label="登录账号"
            placeholder="请输入"
            @keyup.enter="onLogin"
          />
          <van-field
            v-model="password"
            type="password"
            label="密码"
            placeholder="请输入"
            @keyup.enter="onLogin"
          />
          <div style="margin-top:20px">
            <ActionButton block size="lg" :loading="loading" data-testid="login-submit" @click="onLogin">
              {{ loading ? '正在进入...' : '进入系统' }}
            </ActionButton>
          </div>
          <div class="login__switch">
            <button type="button" data-testid="register-entry" @click="mode = 'register'">注册账号</button>
          </div>
        </template>
        <template v-else>
          <van-field v-model="username" label="登录账号" placeholder="以后用来登录" />
          <van-field v-model="displayName" label="显示名" placeholder="员工姓名，大家都能看见" />
          <van-field v-model="phone" label="手机号" placeholder="可选" />
          <van-field v-model="password" type="password" label="密码" placeholder="至少 6 位" />
          <van-field v-model="confirmPassword" type="password" label="确认密码" placeholder="再输一次" />
          <div style="margin-top:20px">
            <ActionButton block size="lg" :loading="loading" data-testid="register-submit" @click="onRegister">
              {{ loading ? '提交中...' : '提交注册' }}
            </ActionButton>
          </div>
          <div class="login__switch">
            <button type="button" @click="mode = 'login'">已有账号，去登录</button>
          </div>
        </template>
      </LuxuryCard>
    </div>
  </div>
</template>

<style scoped>
.login__hero {
  text-align: center;
  margin-bottom: 32px;
}
.login__brand {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-gold-light);
  letter-spacing: 0.06em;
}
.login__tagline {
  margin-top: 10px;
  font-size: 14px;
  color: var(--color-text-sub);
}
.login__switch {
  margin-top: 16px;
  text-align: center;
}
.login__switch button {
  border: none;
  background: none;
  color: var(--color-gold);
  font-size: 14px;
}
</style>
