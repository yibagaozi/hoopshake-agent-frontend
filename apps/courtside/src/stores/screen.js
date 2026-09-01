// 大屏遥控。大屏与操作台是同一台主机上的两个窗口，同源，用 BroadcastChannel 直接对话。
//
// 消息约定：
//   remote  操作台 → 大屏，下发 { theme, view, focus }
//   hello   大屏 → 操作台，上线时请求补发当前配置
//   alive   大屏 → 操作台，心跳回执

import { defineStore } from "pinia";
import { computed, onScopeDispose, ref } from "vue";

const CHANNEL = "hoopshake.courtside";
const LS_REMOTE = "hoopshake.displayRemote";
const ALIVE_MS = 3000;

export const DISPLAY_VIEWS = [
  { id: "standby", label: "待机" },
  { id: "live", label: "实时反馈" },
  { id: "focus", label: "单人聚焦" },
  { id: "mirror", label: "注册镜像" },
  { id: "brief", label: "课末简报" },
];

export const useScreenStore = defineStore("screen", () => {
  const saved = JSON.parse(localStorage.getItem(LS_REMOTE) || "{}");

  const theme = ref(saved.theme || "dark");
  const view = ref(saved.view || "live");
  const focus = ref(saved.focus || null);

  /** 大屏最近一次心跳时间，操作台据此显示是否已连接 */
  const lastAlive = ref(0);
  const nowTick = ref(Date.now());

  const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;

  const displayOnline = computed(() => nowTick.value - lastAlive.value < ALIVE_MS * 2);

  const viewLabel = computed(
    () => DISPLAY_VIEWS.find((v) => v.id === view.value)?.label || view.value,
  );

  const themeLabel = computed(() => (theme.value === "dark" ? "深色" : "浅色"));

  /** ref 里的对象是响应式 Proxy，结构化克隆传不过去，出通道前先摊平成纯对象 */
  function snapshot() {
    return {
      theme: theme.value,
      view: view.value,
      focus: focus.value
        ? { studentId: focus.value.studentId, displayName: focus.value.displayName }
        : null,
    };
  }

  function persist() {
    localStorage.setItem(LS_REMOTE, JSON.stringify(snapshot()));
  }

  /** 操作台侧：下发当前配置 */
  function broadcast() {
    persist();
    bc?.postMessage({ kind: "remote", ...snapshot() });
  }

  function setTheme(next) {
    theme.value = next;
    broadcast();
  }

  function setView(next) {
    view.value = next;
    broadcast();
  }

  /** 点名聚焦某个学生，大屏切到单人聚焦 */
  function focusStudent(student) {
    focus.value = student ? { studentId: student.studentId, displayName: student.displayName } : null;
    if (student) view.value = "focus";
    broadcast();
  }

  /** 操作台侧：监听大屏心跳 */
  function listenAsConsole() {
    const timer = setInterval(() => (nowTick.value = Date.now()), 1000);
    const onMessage = (ev) => {
      const d = ev.data || {};
      if (d.kind === "hello") broadcast();
      if (d.kind === "alive") lastAlive.value = Date.now();
    };
    bc?.addEventListener("message", onMessage);
    broadcast();

    onScopeDispose(() => {
      clearInterval(timer);
      bc?.removeEventListener("message", onMessage);
    });
  }

  /** 大屏侧：接受遥控并按心跳汇报在线 */
  function listenAsDisplay() {
    const onMessage = (ev) => {
      const d = ev.data || {};
      if (d.kind !== "remote") return;
      theme.value = d.theme;
      view.value = d.view;
      focus.value = d.focus;
      persist();
    };
    bc?.addEventListener("message", onMessage);
    bc?.postMessage({ kind: "hello" });

    const timer = setInterval(() => bc?.postMessage({ kind: "alive" }), ALIVE_MS);

    onScopeDispose(() => {
      clearInterval(timer);
      bc?.removeEventListener("message", onMessage);
    });
  }

  /** 在第二块屏上打开大屏窗口 */
  function openDisplayWindow() {
    window.open(`${location.origin}/display`, "hoopshake-display", "width=1280,height=720");
  }

  return {
    theme, view, focus, displayOnline, viewLabel, themeLabel,
    setTheme, setView, focusStudent, broadcast,
    listenAsConsole, listenAsDisplay, openDisplayWindow,
  };
});
