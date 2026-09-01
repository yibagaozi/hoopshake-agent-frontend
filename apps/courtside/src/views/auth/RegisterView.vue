<script setup>
// 教师电脑端 · 注册。字段对齐云端 POST /api/auth/register 的 RegisterRequest。
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import AppLogo from "@/components/AppLogo.vue";
import { useAuthStore } from "@/stores/auth.js";

const auth = useAuthStore();
const router = useRouter();

const form = ref({
  username: "",
  displayName: "",
  staffNo: "",
  phone: "",
  inviteCode: "",
  email: "",
  password: "",
  confirm: "",
});

const agreed = ref(true);
const localError = ref("");

const steps = ["填写基本信息与邀请码", "设置登录密码", "进入操作台开课"];

const filled = computed(() =>
  ["username", "displayName", "staffNo", "phone", "inviteCode", "password"].every(
    (k) => form.value[k].trim(),
  ),
);

const canSubmit = computed(() => filled.value && agreed.value && !auth.loading);

async function submit() {
  localError.value = "";

  if (form.value.password.length < 6) {
    localError.value = "密码至少 6 位";
    return;
  }
  if (form.value.password !== form.value.confirm) {
    localError.value = "两次输入的密码不一致";
    return;
  }

  const { confirm, email, ...rest } = form.value;
  const ok = await auth.signUp({ ...rest, email: email.trim() || undefined });
  if (ok) router.push("/console/live");
}
</script>

<template>
  <div class="screen">
    <aside class="brand">
      <div class="mark">
        <AppLogo :size="44" />
        <span class="word">Hoopshake</span>
      </div>

      <div class="copy">
        <h1>创建你的<br />教师账号</h1>
        <p>凭学校邀请码即可加入，几分钟完成开课准备。</p>

        <ol class="steps">
          <li v-for="(s, i) in steps" :key="s">
            <span class="idx mono">{{ i + 1 }}</span>{{ s }}
          </li>
        </ol>
      </div>

      <div class="foot mono">场边主机 · 教师操作台</div>
      <div class="ring" />
    </aside>

    <main class="panel">
      <form class="form" @submit.prevent="submit">
        <h2>申请注册</h2>
        <p class="lead">带 <span class="req">*</span> 为必填项</p>

        <div class="grid">
          <div>
            <label class="lab">用户名 <span class="req">*</span></label>
            <input v-model="form.username" class="field" placeholder="设置登录用户名" />
          </div>
          <div>
            <label class="lab">姓名 <span class="req">*</span></label>
            <input v-model="form.displayName" class="field" placeholder="真实姓名" />
          </div>
          <div>
            <label class="lab">工号 <span class="req">*</span></label>
            <input v-model="form.staffNo" class="field" placeholder="学校教工号" />
          </div>
          <div>
            <label class="lab">手机号 <span class="req">*</span></label>
            <input v-model="form.phone" class="field" placeholder="常用手机号" />
          </div>
          <div>
            <label class="lab">邀请码 <span class="req">*</span></label>
            <input v-model="form.inviteCode" class="field" placeholder="学校发放的邀请码" />
          </div>
          <div>
            <label class="lab">邮箱 <span class="opt">（选填）</span></label>
            <input v-model="form.email" class="field" placeholder="用于找回密码" />
          </div>
          <div>
            <label class="lab">设置密码 <span class="req">*</span></label>
            <input v-model="form.password" type="password" class="field" placeholder="至少 6 位" />
          </div>
          <div>
            <label class="lab">确认密码 <span class="req">*</span></label>
            <input v-model="form.confirm" type="password" class="field" placeholder="再次输入密码" />
          </div>
        </div>

        <label class="check">
          <span class="box" :class="{ on: agreed }">
            <svg v-if="agreed" width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5 9-11" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <input v-model="agreed" type="checkbox" class="sr" />
          我已阅读并同意
          <a href="#" @click.prevent>《服务协议》</a> 与
          <a href="#" @click.prevent>《隐私政策》</a>
        </label>

        <div v-if="localError || auth.error" class="err">{{ localError || auth.error }}</div>

        <button class="submit" type="submit" :disabled="!canSubmit">
          {{ auth.loading ? "提交中…" : "注册并进入操作台" }}
        </button>

        <div class="tail">
          已有账号？<RouterLink to="/login">返回登录</RouterLink>
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

.brand {
  width: 38%;
  flex: none;
  padding: 76px 56px;
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
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.16;
}

.copy p {
  font-size: 16px;
  color: var(--dark-ink-4);
  line-height: 1.65;
  margin-top: 22px;
  max-width: 300px;
}

.steps {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 34px;
}

.steps li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: #b4b4ba;
}

.idx {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--dark-2);
  color: var(--brand-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex: none;
}

.foot {
  font-size: 12px;
  color: #54545c;
  position: relative;
  z-index: 2;
}

.ring {
  position: absolute;
  right: -160px;
  bottom: -160px;
  width: 460px;
  height: 460px;
  border-radius: 50%;
  border: 1px solid #1b1b20;
}

.panel {
  flex: 1;
  background: var(--page);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 52px 60px;
  overflow-y: auto;
}

.form {
  width: 100%;
  max-width: 600px;
}

h2 {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 9px;
}

.lead {
  font-size: 15px;
  color: var(--ink-4);
  margin-bottom: 30px;
}

.req {
  color: var(--brand-deep);
}

.opt {
  color: var(--ink-6);
  font-weight: 500;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px 22px;
}

.lab {
  display: block;
  font-size: 13px;
  color: var(--ink-4);
  font-weight: 600;
  margin-bottom: 8px;
}

.field {
  width: 100%;
  height: 50px;
  border: 1px solid var(--line-3);
  border-radius: 13px;
  background: var(--card);
  padding: 0 15px;
  font-size: 15px;
  outline: none;
}

.field:focus {
  border-color: var(--brand);
}

.check {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  color: var(--ink-3);
  margin: 24px 0 22px;
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

.tail {
  text-align: center;
  font-size: 14px;
  color: var(--ink-4);
  margin-top: 20px;
}
</style>
