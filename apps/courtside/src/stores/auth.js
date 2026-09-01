// 教师登录态。access token 只放内存，刷新页面即失效；勾选「7 天内自动登录」才存 refresh token。

import { defineStore } from "pinia";
import { computed, ref } from "vue";
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
  const cloudReady = computed(() => !!cloud.cloudBaseUrl());

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
      if (!token || !cloudReady.value) return false;
      try {
        apply(await cloud.refresh(token), true);
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
    signedIn, displayName, cloudReady,
    signIn, signUp, restore, signOut, enterOffline, loadLessons,
  };
});
