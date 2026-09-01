<script setup>
import { ref } from 'vue'
import { errText, isNotOpen, planApi } from '@hoopshake/core'
import { toast } from '../toast.js'

const checking = ref(false)

/** 探测接口是否已开放（后端上线后无需改前端即可用到提示） */
async function probe() {
  checking.value = true
  try {
    await planApi.listTasks()
    toast.ok('备课接口已开放！请联系前端同学启用完整功能')
  } catch (err) {
    toast.err(isNotOpen(err) ? '备课工作台暂未开放（50100）' : errText(err))
  } finally {
    checking.value = false
  }
}

const outline = [
  { n: 1, title: '热身与激活', sub: '动态拉伸 · 8 分钟', done: true },
  { n: 2, title: '投篮基础 · 手型与肘位', sub: '分解讲解 · 12 分钟', done: true },
  { n: 3, title: '收肘纠正练习（靠墙）', sub: '生成教案内容中…', cur: true },
  { n: 4, title: '出手时机与跟随', sub: '待生成' },
  { n: 5, title: '分组实战演练', sub: '待生成' },
  { n: 6, title: '冷身与总结', sub: '待生成' },
]
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <div class="head-title-row">
          <h2 class="page-title">备课工作台</h2>
          <span class="pill warn">未开放</span>
        </div>
        <p class="page-sub">AI 生成教案大纲、纠正练习与讲解稿（接口 /api/teacher/plan 返回 50100）</p>
      </div>
      <button class="btn" :disabled="checking" @click="probe">{{ checking ? '检测中…' : '检测接口状态' }}</button>
    </div>

    <div class="content" style="position: relative; padding: 0; overflow: hidden; display: flex">
      <!-- 预览版式（不可交互） -->
      <div class="preview">
        <div class="plan-pane">
          <div class="pp-head">
            <div class="pp-title">训练教案 · 大纲</div>
            <div class="steps">
              <span class="s done">✓ 计划</span>
              <i></i>
              <span class="s done">✓ 确认</span>
              <i class="hot"></i>
              <span class="s cur">3 执行中</span>
            </div>
          </div>
          <div class="pp-body">
            <div v-for="o in outline" :key="o.n" class="orow" :class="{ cur: o.cur, dim: !o.done && !o.cur }">
              <span class="on" :class="{ done: o.done, cur: o.cur }">{{ o.done ? '✓' : o.n }}</span>
              <div>
                <div class="ot">{{ o.title }}</div>
                <div class="os" :class="{ hot: o.cur }">{{ o.sub }}</div>
              </div>
            </div>
          </div>
          <div class="pp-input">让 AI 调整大纲，如「增加运球衔接」…</div>
        </div>
        <div class="doc-pane">
          <div class="dp-head">
            <span style="font-size: 16px; font-weight: 700">教案预览</span>
            <span class="gen"><span class="gd"></span>生成中 3/6</span>
          </div>
          <div class="doc">
            <div class="d-cap">训练教案 · 2026060002</div>
            <div class="d-title">投篮基础课</div>
            <div class="d-meta">45min · 教案由 AI 生成</div>
            <div class="d-h">一、热身与激活</div>
            <p>以动态拉伸带动肩、髋、踝关节，重点激活投篮相关的肩袖与核心。8 分钟，控制在中低强度。</p>
            <div class="d-h">二、投篮基础 · 手型与肘位</div>
            <p>强调「肘在球下」：出手前肘尖对准篮筐，前臂与地面接近垂直，避免肘部外翻导致的力量分散。</p>
            <div class="d-h" style="color: var(--ink-2)">三、收肘纠正练习（靠墙）</div>
            <div class="ph" style="width: 100%"></div>
            <div class="ph" style="width: 92%"></div>
            <div class="ph" style="width: 78%"></div>
          </div>
        </div>
      </div>

      <!-- 遮罩 -->
      <div class="veil">
        <div class="veil-card">
          <span class="veil-ic">🚧</span>
          <div class="veil-t">备课工作台暂未开放</div>
          <div class="veil-s">后端接口（/api/teacher/plan/**）当前返回 50100。<br />界面已按设计稿就位，接口开放后即可启用。</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview {
  flex: 1;
  display: flex;
  min-width: 0;
  filter: grayscale(0.25);
  opacity: 0.55;
  pointer-events: none;
  user-select: none;
}
.plan-pane {
  width: 400px;
  flex: none;
  border-right: 1px solid var(--line);
  background: #fff;
  display: flex;
  flex-direction: column;
}
.pp-head {
  padding: 22px 26px 16px;
  border-bottom: 1px solid var(--line);
}
.pp-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 16px;
}
.steps {
  display: flex;
  align-items: center;
}
.steps .s {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
  white-space: nowrap;
}
.steps .s.cur {
  color: var(--ink);
  font-weight: 700;
}
.steps i {
  flex: 1;
  height: 2px;
  background: var(--ok);
  margin: 0 10px;
}
.steps i.hot {
  background: var(--brand);
}
.pp-body {
  flex: 1;
  overflow: hidden;
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.orow {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding: 13px 15px;
  background: var(--panel-soft);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.orow.cur {
  background: #fff7f2;
  border: 1.5px solid var(--brand);
}
.orow.dim {
  background: #fff;
  opacity: 0.6;
}
.on {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--line);
  color: var(--gray-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex: none;
}
.on.done {
  background: var(--ok);
  color: #fff;
}
.on.cur {
  background: var(--brand);
  color: #fff;
  animation: recpulse 1.6s infinite;
}
.ot {
  font-size: 15px;
  font-weight: 600;
}
.os {
  font-size: 13px;
  color: var(--gray);
  margin-top: 2px;
}
.os.hot {
  color: var(--brand-deep);
}
.pp-input {
  flex: none;
  margin: 14px 22px 20px;
  background: var(--fill);
  border: 1px solid #e6e6e2;
  border-radius: 99px;
  padding: 11px 16px;
  font-size: 14px;
  color: var(--gray-2);
}
.doc-pane {
  flex: 1;
  background: #f2f2ef;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.dp-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 28px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.gen {
  display: flex;
  align-items: center;
  gap: 7px;
  font: 600 12px/1 var(--mono);
  color: var(--brand-deep);
  background: var(--brand-soft);
  border-radius: 99px;
  padding: 6px 12px;
}
.gd {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand);
  animation: recpulse 1.6s infinite;
}
.doc {
  flex: 1;
  margin: 24px 28px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 12px 32px rgba(0, 0, 0, 0.06);
  padding: 40px 44px;
  overflow: hidden;
}
.d-cap {
  font-size: 13px;
  color: var(--gray-2);
  letter-spacing: 0.04em;
  margin-bottom: 10px;
}
.d-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}
.d-meta {
  font: 500 13px/1 var(--mono);
  color: var(--gray-3);
  margin-bottom: 26px;
}
.d-h {
  font-size: 17px;
  font-weight: 700;
  margin: 20px 0 10px;
}
.doc p {
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink-2);
}
.ph {
  height: 11px;
  border-radius: 6px;
  background: #efefeb;
  margin-top: 9px;
}
.veil {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(247, 247, 245, 0.35);
  backdrop-filter: blur(1.5px);
}
.veil-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.14);
  padding: 30px 40px;
  text-align: center;
  max-width: 420px;
}
.veil-ic {
  font-size: 34px;
}
.veil-t {
  font-size: 19px;
  font-weight: 700;
  margin: 10px 0 8px;
}
.veil-s {
  font-size: 13px;
  color: var(--gray);
  line-height: 1.6;
}
</style>
