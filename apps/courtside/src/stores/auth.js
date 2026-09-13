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
      const v = await cloud.vocabulary(accessToken.value);
      setVocabulary(v);
    } catch {
      // 断云或接口不可用时静默退兜底
    }
  }

  function apply(data, remember) {
    accessToken.value = data.accessToken;
    user.value = data.user;
    if (remember && data.refreshToken) {
      localStorage.setItem(LS_REFRESH, data.refreshToken);
    }
  }

  async function signIn(identifier, password, remember = false) {
    loading.value = true;
    error.value = "";
    try {
      apply(await cloud.login(identifier, password), remember);
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

  /** 用本地 refresh token 静默续期，页面刷新后恢复登录态。整个会话只尝试一次 */
  let restoring = null;

  function restore() {
    if (restoring) return restoring;

    restoring = (async () => {
      const token = localStorage.getItem(LS_REFRESH);
      if (!token) return false;
      try {
        apply(await cloud.refresh(token), true);
        syncVocabulary();
        return true;
      } catch {
        localStorage.removeItem(LS_REFRESH);
        return false;
      }
    })();

    return restoring;
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
      lessons.value = await cloud.listLessons(accessToken.value);
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
