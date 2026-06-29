<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import api from '../api'
import { PERMISSION_LABELS } from '@jade-account/shared'
import LuxuryCard from '../components/LuxuryCard.vue'

const users = ref<any[]>([])
const roles = ref<any[]>([])
const permissions = ref<any[]>([])
const selectedRoleId = ref<number | null>(null)
const selectedUserId = ref<number | null>(null)
const roleForm = ref({ name: '', description: '', permissionIds: [] as number[] })
const saving = ref(false)

const permissionLabel = (code: string) => PERMISSION_LABELS[code] || code

const selectedRole = computed(() => roles.value.find((r) => r.id === selectedRoleId.value))
const selectedUser = computed(() => users.value.find((u) => u.id === selectedUserId.value))

onMounted(loadAll)

async function loadAll() {
  const [u, r, p] = await Promise.all([
    api.get('/permissions/users'),
    api.get('/permissions/roles'),
    api.get('/permissions/permissions'),
  ])
  users.value = u.data.data
  roles.value = r.data.data
  permissions.value = p.data.data
  if (!selectedRoleId.value && roles.value.length) selectRole(roles.value[0].id)
}

function selectRole(id: number) {
  selectedRoleId.value = id
  const role = roles.value.find((r) => r.id === id)
  roleForm.value = {
    name: role?.name || '',
    description: role?.description || '',
    permissionIds: role?.rolePermissions?.map((rp: any) => rp.permissionId) || [],
  }
}

function togglePermission(pid: number, checked: boolean) {
  const set = new Set(roleForm.value.permissionIds)
  if (checked) set.add(pid)
  else set.delete(pid)
  roleForm.value.permissionIds = [...set]
}

async function saveRole() {
  if (!selectedRoleId.value) return
  saving.value = true
  try {
    await api.patch(`/permissions/roles/${selectedRoleId.value}`, {
      name: roleForm.value.name,
      description: roleForm.value.description,
      permissionIds: roleForm.value.permissionIds,
    })
    showToast('角色权限已保存')
    await loadAll()
    selectRole(selectedRoleId.value!)
  } finally {
    saving.value = false
  }
}

async function saveUserRoles() {
  if (!selectedUserId.value) return
  const user = selectedUser.value
  const roleIds = user?._selectedRoleIds || user?.userRoles?.map((ur: any) => ur.roleId) || []
  saving.value = true
  try {
    await api.post(`/permissions/users/${selectedUserId.value}/roles`, { roleIds })
    showToast('用户角色已更新')
    await loadAll()
  } finally {
    saving.value = false
  }
}

function onUserRoleChange(user: any, roleId: number, checked: boolean) {
  const ids = new Set(user._selectedRoleIds || user.userRoles?.map((ur: any) => ur.roleId) || [])
  if (checked) ids.add(roleId)
  else ids.delete(roleId)
  user._selectedRoleIds = [...ids]
}
</script>

<template>
  <LuxuryCard gold>
    <div class="section-title">角色权限管理</div>

    <div class="sub-title">角色列表</div>
    <div class="chip-row">
      <button
        v-for="r in roles"
        :key="r.id"
        class="chip"
        :class="{ active: selectedRoleId === r.id }"
        @click="selectRole(r.id)"
      >
        {{ r.name }}
      </button>
    </div>

    <van-field v-model="roleForm.name" label="角色名称" />
    <van-field v-model="roleForm.description" label="说明" />

    <div class="sub-title">权限勾选</div>
    <van-checkbox-group :model-value="roleForm.permissionIds">
      <van-cell v-for="p in permissions" :key="p.id" :title="permissionLabel(p.code)" :label="p.code">
        <template #right-icon>
          <van-checkbox
            :name="p.id"
            :model-value="roleForm.permissionIds.includes(p.id)"
            @update:model-value="(v: boolean) => togglePermission(p.id, v)"
          />
        </template>
      </van-cell>
    </van-checkbox-group>

    <van-button block type="primary" :loading="saving" class="save-btn" @click="saveRole">保存角色权限</van-button>
  </LuxuryCard>

  <LuxuryCard>
    <div class="section-title">用户角色分配</div>
    <van-cell
      v-for="u in users"
      :key="u.id"
      :title="`${u.name} (${u.username})`"
      is-link
      @click="selectedUserId = selectedUserId === u.id ? null : u.id"
    />
    <div v-if="selectedUser" class="user-roles">
      <div class="sub-title">为 {{ selectedUser.name }} 分配角色</div>
      <van-checkbox-group>
        <van-cell v-for="r in roles" :key="r.id" :title="r.name">
          <template #right-icon>
            <van-checkbox
              :model-value="(selectedUser._selectedRoleIds || selectedUser.userRoles?.map((ur: any) => ur.roleId)).includes(r.id)"
              @update:model-value="(v: boolean) => onUserRoleChange(selectedUser, r.id, v)"
            />
          </template>
        </van-cell>
      </van-checkbox-group>
      <van-button block type="primary" :loading="saving" class="save-btn" @click="saveUserRoles">保存用户角色</van-button>
    </div>
  </LuxuryCard>
</template>

<style scoped>
.sub-title { font-size: 13px; color: var(--color-text-sub); margin: 12px 0 8px; }
.chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.chip {
  border: 1px solid rgba(111,119,114,.2);
  background: transparent;
  border-radius: 16px;
  padding: 6px 12px;
  font-size: 13px;
}
.chip.active { background: var(--color-gold-soft); border-color: var(--color-gold); }
.save-btn { margin-top: 16px; }
.user-roles { margin-top: 12px; }
</style>
