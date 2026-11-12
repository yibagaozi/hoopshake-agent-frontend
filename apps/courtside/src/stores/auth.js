// 教师登录态。access token 只放内存，刷新页面即失效；勾选「7 天内自动登录」才存 refresh token。

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { setVocabulary } from "@hoopshake/core";
import * as cloud from "@/api/cloud.js";

const LS_REFRESH = "hoopshake.refreshToken";
const SS_OFFLINE = "hoopshake.offlineMode";

export const useAuthStore = defineStore("auth", () => {
  const accessToken = ref("");
  const user = ref(null);
  const lessons = ref([]);
  const loading = ref(false);
  const error = ref("");

  // 云端不可达时也要能上课：跳过登录直接进操作台，edge 接口本来就不校验身份。
  // 存 sessionStorage，关掉窗口即失效，不会一直绕过登录。
  const offline = ref(sessionStorage.getItem(SS_OFFLINE) === "1");

  const signedIn = computed(() => !!accessToken.value);
  const displayName = computed(() => user.value?.displayName || user.value?.username || "");

  /**
   * 词表要带 token 才能读，所以登录成功后再拉，拉到交给 core 缓存。
   * 失败不影响上课 —— core 会退到本地缓存或兜底表，局域网断云时照常用。
   */
  async function syncVocabulary() {
    if (!accessToken.value) return;
    try {
      const v = await withAuth((t) => cloud.vocabulary(t));
      setVocabulary(v);
    } catch {
      // 断云或接口不可用时静默退兜底
    }
  }

  function apply(data, remember) {
    accessToken.value = data.accessToken;
    // refresh 的响应不一定带 user，别拿 undefined 把已有的盖掉
    if (data.user) user.value = data.user;
    if (remember && data.refreshToken) {
      localStorage.setItem(LS_REFRESH, data.refreshToken);
    }
  }

  /** 凭证本身被拒（过期、吊销、无效）。连不上云端、网关 502 这些不算 */
  function isAuthRejected(e) {
    const c = Number(e?.code) || 0;
    return (c >= 40100 && c < 40200) || c === 401 || c === 403;
  }

  async function signIn(identifier, password, remember = false) {
    loading.value = true;
    error.value = "";
    try {
      // 没勾「自动登录」就把上一次留下的 refresh token 清掉，否则刷新后照样自动登进去
      if (!remember) localStorage.removeItem(LS_REFRESH);
      apply(await cloud.login(identifier, password), remember);
      restoring = null;
      syncVocabulary();
      return true;
    } catch (e) {
      error.value = e.message;
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function signUp(payload) {
    loading.value = true;
    error.value = "";
    try {
      await cloud.register(payload);
      // 注册成功后直接登录，省一次输入
      return await signIn(payload.username, payload.password, false);
    } catch (e) {
      error.value = e.message;
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 用本地 refresh token 静默续期，页面刷新后恢复登录态。
   *
   * 之前「保持登录」不牢靠，毛病出在失败处理上：只要这一次续期没成，
   * 不管什么原因都把 refresh token 删掉 ——
   *   - 云端一时连不上 / nginx 回 502：token 明明还有效，被删了，
   *     之后网络恢复也只能重新输密码；
   *   - 开了两个操作台标签页：refresh token 是轮换的，两页拿同一个旧 token
   *     去换，后到的那个必然失败，然后把先到的那页刚存好的**新** token 删掉。
   * 现在只有云端明确说「凭证无效」才删，而且只删自己试过的那一个。
   */
  let restoring = null;

  function restore() {
    if (restoring) return restoring;

    restoring = (async () => {
      const token = localStorage.getItem(LS_REFRESH);
      if (!token) return false;

      let data;
      try {
        data = await cloud.refresh(token);
      } catch (e) {
        const latest = localStorage.getItem(LS_REFRESH);
        if (latest && latest !== token) {
          // 另一个标签页已经换过了，用它存的新 token 再试一次
          try {
            data = await cloud.refresh(latest);
          } catch (e2) {
            if (isAuthRejected(e2) && localStorage.getItem(LS_REFRESH) === latest) {
              localStorage.removeItem(LS_REFRESH);
            }
          }
        } else if (isAuthRejected(e)) {
          localStorage.removeItem(LS_REFRESH);
        }
        if (!data) {
          // 网络类失败不算定论，下次进页面/下次请求还能再试
          restoring = null;
          return false;
        }
      }

      apply(data, true);
      if (!user.value) {
        try {
          user.value = await cloud.me(accessToken.value);
        } catch {
          // 拿不到资料不影响登录态，只是头像上没名字
        }
      }
      syncVocabulary();
      return true;
    })();

    return restoring;
  }

  /**
   * 带登录态调云端。access token 只在内存里、寿命也短，课上到一半过期很正常：
   * 遇到「未登录/已过期」就用 refresh token 续一次再重放，而不是直接报错。
   */
  async function withAuth(call) {
    try {
      return await call(accessToken.value);
    } catch (e) {
      if (!isAuthRejected(e) || !localStorage.getItem(LS_REFRESH)) throw e;
      restoring = null;
      if (!(await restore())) throw e;
      return call(accessToken.value);
    }
  }

  /** 跳过登录进操作台 */
  function enterOffline() {
    offline.value = true;
    sessionStorage.setItem(SS_OFFLINE, "1");
  }

  function signOut() {
    accessToken.value = "";
    user.value = null;
    lessons.value = [];
    restoring = null;
    offline.value = false;
    sessionStorage.removeItem(SS_OFFLINE);
    localStorage.removeItem(LS_REFRESH);
  }

  /** 拉本教师待上 / 进行中的课 */
  async function loadLessons() {
    error.value = "";
    try {
      lessons.value = await withAuth((t) => cloud.listLessons(t));
    } catch (e) {
      error.value = e.message;
      lessons.value = [];
    }
    return lessons.value;
  }

  return {
    accessToken, user, lessons, loading, error, offline,
    signedIn, displayName,
    signIn, signUp, restore, signOut, enterOffline, loadLessons,
  };
});
