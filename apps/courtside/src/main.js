import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./styles/base.css";

// 旧版本允许在登录页手填云端地址并存在这里。现在地址只从构建期配置读，
// 这个键已经没人再读；留着会让排障的人以为它还生效，开机顺手清掉。
try {
  localStorage.removeItem("hoopshake.cloudBaseUrl");
} catch {
  /* 隐私模式等场景忽略 */
}

createApp(App).use(createPinia()).use(router).mount("#app");
