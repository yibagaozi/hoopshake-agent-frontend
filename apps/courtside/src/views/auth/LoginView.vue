<script setup>
// 教师电脑端 · 登录。直连云端 POST /api/auth/login，token 拿到后留在内存。
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppLogo from "@/components/AppLogo.vue";
import { useAuthStore } from "@/stores/auth.js";
import { cloudBaseUrl, setCloudBaseUrl } from "@/api/cloud.js";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const identifier = ref("");
const password = ref("");
const remember = ref(true);
const showPassword = ref(false);

const editingCloud = ref(!cloudBaseUrl());
const cloudUrl = ref(cloudBaseUrl());

const canSubmit = computed(
  () => identifier.value.trim() && password.value && !auth.loading,
);

function saveCloud() {
  setCloudBaseUrl(cloudUrl.value);
  editingCloud.value = false;
}

async function submit() {
  if (!canSubmit.value) return;
  if (!cloudBaseUrl()) {
    editingCloud.value = true;
    return;
  }
  const ok = await auth.signIn(identifier.value.trim(), password.value, remember.value);
  if (ok) router.push(route.query.next || "/console/live");
}

/** 云端不可用时也要能进操作台，edge 接口不依赖登录 */
function skip() {
  auth.enterOffline();
  router.push("/console/live");
}
</script>

<template>
  <div class="screen">
    <!-- 左侧品牌区 -->
    <aside class="brand">
      <div class="mark">
        <AppLogo :size="44" />
        <span class="word">Hoopshake</span>
      </div>

      <div class="copy">
        <h1>用 AI 看清<br />每一次投篮</h1>
        <p>实时动作反馈 · 安全提醒 · 课堂录制与课后简报，尽在一处。</p>
      </div>

      <div class="foot mono">场边主机 · 教师操作台</div>

      <div class="ring big" />
      <div class="ring small" />
    </aside>

    <!-- 右侧表单 -->
    <main class="panel">
      <form class="form" @submit.prevent="submit">
        <h2>登录操作台</h2>
        <p class="lead">欢迎回来，请使用教师账号登录</p>

        <label class="lab">账号</label>
        <input
          v-model="identifier"
          class="field"
          placeholder="用户名 / 邮箱 / 手机号 / 工号"
          autocomplete="username"
        />

        <div class="lab-row">
          <span class="lab">密码</span>
          <a href="#" @click.prevent>忘记密码？</a>
        </div>
        <div class="pw">
          <input
            v-model="password"
            class="field"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
          />
          <button type="button" class="reveal" @click="showPassword = !showPassword">
            {{ showPassword ? "隐藏" : "显示" }}
          </button>
        </div>

        <label class="check">
          <span class="box" :class="{ on: remember }">
            <svg v-if="remember" width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5 9-11" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <input v-model="remember" type="checkbox" class="sr" />
          7 天内自动登录
        </label>

        <div v-if="auth.error" class="err">{{ auth.error }}</div>

        <button class="submit" type="submit" :disabled="!canSubmit">
          {{ auth.loading ? "登录中…" : "登录" }}
        </button>

        <!-- 云端地址：现场部署时按学校环境填一次 -->
        <div class="cloud">
          <template v-if="editingCloud">
            <input v-model="cloudUrl" class="field small" placeholder="https://云端地址" />
            <button type="button" class="mini" @click="saveCloud">保存</button>
          </template>
          <template v-else>
            <span class="mono url">{{ cloudUrl || "未配置云端" }}</span>
            <button type="button" class="mini" @click="editingCloud = true">修改</button>
          </template>
        </div>

        <div class="tail">
          还没有账号？<RouterLink to="/register">申请注册</RouterLink>
          <span class="sep">·</span>
          <a href="#" @click.prevent="skip">离线进入操作台</a>
        </div>
      </form>
    </main>
  </div>
</template>

<style scoped>
.screen {
  height: 100%;
  display: flex;
  background: var(--dark);
  color: var(--dark-ink);
}

/* ---- 品牌区 ---- */
.brand {
  width: 44%;
  flex: none;
  padding: 76px 62px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
}

.mark {
  display: flex;
  align-items: center;
  gap: 15px;
  position: relative;
  z-index: 2;
}

.word {
  font-size: 27px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.copy {
  position: relative;
  z-index: 2;
}

.copy h1 {
  font-size: 46px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.14;
}

.copy p {
  font-size: 17px;
  color: var(--dark-ink-4);
  line-height: 1.65;
  margin-top: 24px;
  max-width: 380px;
}

.foot {
  font-size: 12px;
  color: #54545c;
  position: relative;
  z-index: 2;
}

.ring {
  position: absolute;
  border-radius: 50%;
}

.ring.big {
  right: -160px;
  bottom: -160px;
  width: 480px;
  height: 480px;
  border: 1px solid #1b1b20;
}

.ring.small {
  right: -80px;
  bottom: -80px;
  width: 300px;
  height: 300px;
  border: 1px solid var(--dark-2);
}

/* ---- 表单区 ---- */
.panel {
  flex: 1;
  background: var(--page);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px;
  overflow-y: auto;
}

.form {
  width: 100%;
  max-width: 420px;
}

h2 {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 9px;
}

.lead {
  font-size: 15px;
  color: var(--ink-4);
  margin-bottom: 36px;
}

.lab {
  display: block;
  font-size: 13px;
  color: var(--ink-4);
  font-weight: 600;
  margin-bottom: 9px;
}

.lab-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 9px;
}

.lab-row .lab {
  margin-bottom: 0;
}

.lab-row a {
  font-size: 13px;
  font-weight: 600;
}

.field {
  width: 100%;
  height: 54px;
  border: 1px solid var(--line-3);
  border-radius: 14px;
  background: var(--card);
  padding: 0 16px;
  font-size: 16px;
  outline: none;
  margin-bottom: 22px;
}

.field:focus {
  border-color: var(--brand);
}

.pw {
  position: relative;
}

.pw .field {
  padding-right: 60px;
}

.reveal {
  position: absolute;
  right: 16px;
  top: 27px;
  transform: translateY(-50%);
  font-size: 13px;
  color: var(--ink-4);
  font-weight: 600;
}

.check {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  color: var(--ink-3);
  margin-bottom: 28px;
  cursor: pointer;
}

.box {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1px solid var(--line-3);
  background: var(--card);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.box.on {
  background: var(--brand);
  border-color: var(--brand);
}

.sr {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.err {
  background: var(--red-bg-2);
  border: 1px solid var(--red-line);
  color: var(--red-deep);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 16px;
}

.submit {
  width: 100%;
  height: 56px;
  border-radius: 14px;
  background: var(--brand);
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(255, 106, 44, 0.28);
}

.cloud {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}

.field.small {
  height: 42px;
  font-size: 13px;
  margin-bottom: 0;
  border-radius: 11px;
}

.url {
  flex: 1;
  font-size: 12px;
  color: var(--ink-6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini {
  font-size: 12px;
  font-weight: 700;
  color: var(--brand-deep);
  flex: none;
}

.tail {
  text-align: center;
  font-size: 14px;
  color: var(--ink-4);
  margin-top: 22px;
}

.sep {
  margin: 0 8px;
  color: var(--ink-7);
}
</style>
