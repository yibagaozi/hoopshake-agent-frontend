<script setup>
import { ref } from 'vue'
import { errText, isNotOpen, teacherChatApi } from '@hoopshake/core'
import { toast } from '../toast.js'

const checking = ref(false)
const input = ref('')

async function probe() {
  checking.value = true
  try {
    await teacherChatApi.listSessions()
    toast.ok('教学助手接口已开放！请联系前端同学启用完整功能')
  } catch (err) {
    toast.err(isNotOpen(err) ? '教学助手暂未开放（50100）' : errText(err))
  } finally {
    checking.value = false
  }
}

function trySend() {
  toast.err('教学助手暂未开放（接口返回 50100）')
}
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <div class="head-title-row">
          <h2 class="page-title">教学助手</h2>
          <span class="pill warn">未开放</span>
        </div>
        <p class="page-sub">向教学助手提问、检索知识库并做多人分析（接口 /api/teacher/chat 返回 50100）</p>
      </div>
      <button class="btn" :disabled="checking" @click="probe">{{ checking ? '检测中…' : '检测接口状态' }}</button>
    </div>

    <div class="content" style="padding: 0; display: flex; overflow: hidden">
      <!-- 会话列表（占位） -->
      <div class="threads">
        <div class="th-head">
          <div style="font-size: 19px; font-weight: 700; letter-spacing: -0.02em">对话</div>
        </div>
        <button class="new-btn" @click="trySend">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <line x1="12" y1="5" x2="12" y2="19" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
            <line x1="5" y1="12" x2="19" y2="12" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
          </svg>
          新建对话
        </button>
        <div class="th-list">
          <div class="th-row dim">
            <div class="tt">2026060002 收肘专项设计</div>
            <div class="ts">接口开放后可用</div>
          </div>
          <div class="th-row dim">
            <div class="tt">安全 · 膝内扣防护建议</div>
            <div class="ts">接口开放后可用</div>
          </div>
          <div class="th-row dim">
            <div class="tt">3 人批量分析 · 收肘专项</div>
            <div class="ts">接口开放后可用</div>
          </div>
        </div>
      </div>

      <!-- 会话区 -->
      <div class="conv">
        <div class="conv-head">
          <span class="logo"><span class="ring"></span></span>
          <div>
            <div style="font-size: 16px; font-weight: 700">教学助手</div>
            <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--gray)">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: var(--gray-3)"></span>
              Teaching Agent · 待开放
            </div>
          </div>
        </div>
        <div class="conv-body">
          <div class="wip-center">
            <span class="ic">🚧</span>
            <div class="t">教学助手暂未开放</div>
            <div class="s">
              开放后你可以：向助手提问教学问题、基于课堂数据做多人对比分析、<br />
              生成纠正练习与讲解稿，并一键导出为教案。
            </div>
          </div>
        </div>
        <div class="conv-input">
          <input v-model="input" placeholder="向教学助手提问，或让它帮你备课…（暂未开放）" disabled />
          <button class="send" @click="trySend">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.threads {
  width: 288px;
  flex: none;
  background: #fff;
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.th-head {
  padding: 24px 22px 16px;
}
.new-btn {
  margin: 0 22px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--brand);
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  box-shadow: 0 5px 14px var(--brand-glow);
  opacity: 0.55;
}
.th-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.th-row {
  padding: 14px 15px;
  border-radius: 14px;
}
.th-row.dim {
  opacity: 0.55;
}
.tt {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ts {
  font-size: 13px;
  color: var(--gray-2);
  margin-top: 4px;
}
.conv {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg);
}
.conv-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 30px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.logo {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.55;
}
.logo .ring {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2.2px solid #fff;
}
.conv-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px;
}
.wip-center {
  text-align: center;
  max-width: 480px;
}
.wip-center .ic {
  font-size: 36px;
}
.wip-center .t {
  font-size: 20px;
  font-weight: 700;
  margin: 12px 0 10px;
}
.wip-center .s {
  font-size: 13px;
  color: var(--gray);
  line-height: 1.7;
}
.conv-input {
  flex: none;
  margin: 0 30px 26px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 26px;
  padding: 12px 12px 12px 20px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.05);
}
.conv-input input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 15px;
  background: transparent;
  color: var(--ink);
}
.conv-input input::placeholder {
  color: var(--gray-2);
}
.send {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  opacity: 0.55;
}
</style>
