<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, formatAuthError } from '../stores/auth'
import { showToast } from 'vant'
import ActionButton from '../components/ActionButton.vue'
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
  if (!username.value.trim()) { showToast('请填写登录账号'); return }
  if (!displayName.value.trim()) { showToast('请填写显示名（员工姓名）'); return }
  if (!password.value || password.value.length < 6) { showToast('密码至少 6 位'); return }
  if (password.value !== confirmPassword.value) { showToast('两次密码不一致'); return }

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
    <div class="login-page__brand-panel">
      <div class="login-brand">
        <div class="login-brand__mark">◆</div>
        <h1 class="login-brand__title">项目资金支出记录</h1>
        <p class="login-brand__tagline">记录、统计、关联订单、生成对账表</p>
        <ul class="login-brand__features">
          <li>珠宝公司内部轻量财务工具</li>
          <li>支出凭证上传与资金对账中心</li>
          <li>一键生成财务外链与 Excel</li>
        </ul>
      </div>
    </div>
    <div class="login-page__inner">
      <div class="login-card ui-card">
        <h2 class="login-card__title">{{ mode === 'login' ? '登录系统' : '注册账号' }}</h2>
        <template v-if="mode === 'login'">
          <van-field v-model="username" label="登录账号" placeholder="请输入" @keyup.enter="onLogin" />
          <van-field v-model="password" type="password" label="密码" placeholder="请输入" @keyup.enter="onLogin" />
          <div class="login-card__submit">
            <ActionButton block size="lg" :loading="loading" data-testid="login-submit" @click="onLogin">
              {{ loading ? '正在进入...' : '进入系统' }}
            </ActionButton>
          </div>
          <div class="login-card__switch">
            <button type="button" data-testid="register-entry" @click="mode = 'register'">注册账号</button>
          </div>
        </template>
        <template v-else>
          <van-field v-model="username" label="登录账号" placeholder="以后用来登录" />
          <van-field v-model="displayName" label="显示名" placeholder="员工姓名" />
          <van-field v-model="phone" label="手机号" placeholder="可选" />
          <van-field v-model="password" type="password" label="密码" placeholder="至少 6 位" />
          <van-field v-model="confirmPassword" type="password" label="确认密码" placeholder="再输一次" />
          <div class="login-card__submit">
            <ActionButton block size="lg" :loading="loading" data-testid="register-submit" @click="onRegister">
              {{ loading ? '提交中...' : '提交注册' }}
            </ActionButton>
          </div>
          <div class="login-card__switch">
            <button type="button" @click="mode = 'login'">已有账号，去登录</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-brand__mark {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid #e7ddc8;
  color: var(--color-gold);
  font-size: 18px;
  margin-bottom: 20px;
}
.login-brand__title {
  margin: 0 0 12px;
  font-size: clamp(24px, 4vw, 32px);
  font-weight: 700;
  color: var(--color-text-main);
}
.login-brand__tagline {
  margin: 0 0 24px;
  font-size: 15px;
  color: var(--color-text-sub);
  line-height: 1.6;
}
.login-brand__features {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}
.login-brand__features li {
  font-size: 14px;
  color: var(--color-text-sub);
  padding-left: 16px;
  position: relative;
}
.login-brand__features li::before {
  content: '·';
  position: absolute;
  left: 0;
  color: var(--color-gold);
  font-weight: 700;
}
.login-card {
  padding: 28px 24px;
}
.login-card__title {
  margin: 0 0 20px;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-main);
}
.login-card__submit {
  margin-top: 20px;
}
.login-card__switch {
  margin-top: 16px;
  text-align: center;
}
.login-card__switch button {
  border: none;
  background: none;
  color: var(--color-gold);
  font-size: 14px;
  cursor: pointer;
}
</style>
