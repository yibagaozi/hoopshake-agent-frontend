// 功能开关。用来在后端接口还没齐的阶段隔离掉未就绪的链路。
//
// 都从构建期环境变量读，缺省是「生产行为」，需要放宽时在 .env 里显式打开。

const on = (v) => v === "true" || v === "1";

/**
 * 允许不选课直接开录。
 *
 * edge 的 POST /local/session/start 本来就支持 lessonId 为 null（纯录制），
 * 但选课要走 POST /local/lesson/select，而它内部强依赖名单同步
 * （LessonContextServiceImpl 里名单拉取失败会直接抛错），
 * 云端 gallery 接口没就绪时选不了课，也就开不了课。
 * 打开这个开关可以跳过选课直接开录，用来联调 WS 与录制。
 */
export const ALLOW_NO_LESSON = on(import.meta.env.VITE_ALLOW_NO_LESSON);

/** 显示 WS 事件监视器（底部导航多一个「调试」页） */
export const SHOW_WS_DEBUG = on(import.meta.env.VITE_SHOW_WS_DEBUG);

/**
 * 骨架帧是否也记进事件日志。
 * poseFrame 有 15Hz 以上，默认只计数不留原文，否则日志瞬间被冲掉。
 */
export const LOG_POSE_FRAMES = on(import.meta.env.VITE_LOG_POSE_FRAMES);
