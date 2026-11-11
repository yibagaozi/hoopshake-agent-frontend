/**
 * edge 接口模拟服务，只给前端本地开发用，别在现场跑。
 *
 *   npm run mock      # 起在 8080，冒充 edge
 *   npm run dev       # 另开一个终端，vite 会把 /local 与 /ws 代理过来
 *
 * 覆盖了操作台和大屏用到的只读接口，写接口一律回成功，
 * WS 按固定节奏推 cue / actionFocus / poseFrame，方便看实时区的效果。
 */
import http from "node:http";
import crypto from "node:crypto";
import zlib from "node:zlib";

const PORT = Number(process.env.MOCK_PORT || 8080);

const bootAt = new Date();
const startedAt = new Date(bootAt.getTime() - 2535 * 1000).toISOString();

const ok = (data) => ({
  code: 0,
  message: "ok",
  data,
  traceId: crypto.randomUUID().slice(0, 8),
  timestamp: new Date().toISOString(),
});

const cameras = [
  { camId: "cam_01", role: "左侧", anchor: false, online: true, signal: true, fps: 29, processState: "RUNNING", rtspUrl: "rtsp://127.0.0.1:8554/cam_01" },
  { camId: "cam_02", role: "右侧", anchor: false, online: true, signal: true, fps: 30, processState: "RUNNING", rtspUrl: "rtsp://127.0.0.1:8554/cam_02" },
  { camId: "cam_03", role: "底线 · 主", anchor: true, online: true, signal: true, fps: 30, processState: "RUNNING", rtspUrl: "rtsp://127.0.0.1:8554/cam_03" },
  // 有帧但黑屏，用来看降级提示
  { camId: "cam_04", role: "篮板", anchor: false, online: true, signal: false, fps: 0, processState: "DEGRADED", rtspUrl: "rtsp://127.0.0.1:8554/cam_04" },
];

const lesson = {
  lessonId: "c14d0000-0000-0000-0000-000000000002",
  title: "投篮基础课",
  classCode: "2026060002",
  actionTypes: ["jump_shot", "layup"],
  enabledCheckpoints: ["elbow_alignment", "release_timing", "knee_valgus"],
  zoneConfigRef: null,
  selectedAt: startedAt,
};

const session = {
  sessionId: "5d2e0000-0000-0000-0000-000000000011",
  lessonId: lesson.lessonId,
  state: "RECORDING",
  dataDir: "C:/hoopshake/data/sessions/5d2e",
  startedAt,
  endedAt: null,
  segments: [],
  unavailableCameras: ["cam_04"],
};

const students = [
  ["李晓峰", "2026060014", true],
  ["王梓萱", "2026060015", true],
  ["陈一凡", "2026060016", true],
  ["刘思远", "2026060017", true],
  ["赵子墨", "2026060022", false],
  ["孙一诺", "2026060028", false],
].map(([displayName, studentNo, galleryReady], i) => ({
  studentId: `3a7b0000-0000-0000-0000-00000000000${i}`,
  studentNo,
  displayName,
  dominantHand: i % 3 === 0 ? "LEFT" : "RIGHT",
  galleryReady,
}));

/* ---------- 球场标定 ---------- */

// MOCK_CALIB: ready | missing | running | failed，默认 missing（更值得看的那一路）
const calibMode = process.env.MOCK_CALIB || "missing";
const calibState = {
  mode: calibMode,
  // runCalibration 之后转 RUNNING，几秒后按 mode 落到终态
  run: null,
};

const ALL_FILES = ["cameras.json", "camera_centers_world.json", "cam_01.json", "cam_02.json", "cam_03.json"];

function calibPayload(session) {
  const m = calibState.mode;
  const ready = m === "ready";
  const present = ready ? ALL_FILES : ALL_FILES.slice(0, 3);
  const missing = ready ? [] : ALL_FILES.slice(3);
  return {
    session,
    artifactDir: `C:/hoopshake/Basketball_inclass_system/data/calibration/live_${session}`,
    ready,
    dirExists: true,
    presentFiles: present,
    missingFiles: missing,
    calibratedAt: ready ? new Date(Date.now() - 900000).toISOString() : null,
    lastRun: calibState.run,
  };
}

/* ---------- 人脸注册：6 张脸，两张故意没缩略图 ---------- */
// MOCK_NO_FLAG=1 模拟「后端压根不返回 hasThumbnail」——真机上多半就是这种
const OMIT_FLAG = !!process.env.MOCK_NO_FLAG;
const FACES = Array.from({ length: 6 }, (_, i) => {
  const f = {
    localId: `stu_${String(i + 1).padStart(2, "0")}`,
    globalId: i < 4 ? `g-${i + 1}` : null,
    bound: i === 0,
    boundStudentNo: i === 0 ? "2026060002" : "",
    boundDisplayName: i === 0 ? "李晓峰" : "",
  };
  if (!OMIT_FLAG) f.hasThumbnail = i < 4;
  return f;
});
/** 只有前 4 个真有图，后 2 个缩略图接口 404 —— 和 hasThumbnail 说什么无关 */
const HAS_IMG = new Set(["stu_01", "stu_02", "stu_03", "stu_04"]);

/** 缩略图：现画一张带编号的 PNG，尺寸可调，用来验「原图小时放大会不会糊」 */
const THUMB_PX = Number(process.env.MOCK_THUMB_PX || 240);
function facePng(seed) {
  const W = THUMB_PX;
  const hues = [[255, 106, 44], [47, 177, 112], [76, 141, 214], [138, 107, 214]];
  const c = hues[seed % hues.length];
  const rows = [];
  for (let y = 0; y < W; y++) {
    const row = [0];
    for (let x = 0; x < W; x++) {
      // 斜纹 + 中间一块深色，放大后能一眼看出是不是同一张、糊不糊
      const band = ((x + y) >> 4) % 2;
      const mid = Math.abs(x - W / 2) < W / 5 && Math.abs(y - W / 2) < W / 5;
      const k = mid ? 0.45 : band ? 1 : 0.82;
      row.push(Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k));
    }
    rows.push(Buffer.from(row));
  }
  const raw = Buffer.concat(rows);
  const chunk = (tag, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(tag), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(W, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let CRC_T = null;
function crc32(buf) {
  if (!CRC_T) {
    CRC_T = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_T[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const routes = {
  "GET /local/state": () =>
    ok({
      edgeId: "edge-01",
      lesson,
      session,
      cameras,
      capture: {
        mediamtx: "RUNNING",
        recording: true,
        processes: { cam_01: "RUNNING", cam_02: "RUNNING", cam_03: "RUNNING", cam_04: "DEGRADED" },
      },
      disk: { freeBytes: 512e9, totalBytes: 2e12, estimatedRemainingMinutes: 2000 },
    }),

  "GET /local/lesson": () => ok(lesson),
  "GET /local/session": () => ok(session),

  "POST /local/calibration/run": (body) => {
    if (calibState.mode === "unavailable") {
      return { code: 50333, message: "编排未启用或命令未配置", data: null };
    }
    if (calibState.run?.state === "RUNNING") {
      return { code: 40918, message: "已有标定任务在进行中", data: null };
    }
    if (calibState.mode === "ready" && !body.force) {
      // 产物已齐且没强制：直接回上次结果，不重复执行
      return ok(calibState.run || { session: body.session, state: "SUCCEEDED", message: "产物已齐，未重复执行" });
    }
    calibState.run = {
      session: body.session,
      state: "RUNNING",
      exitCode: null,
      message: "标定进程已拉起，等待人工标注",
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    const settleTo = process.env.MOCK_CALIB_RESULT || "SUCCEEDED";
    setTimeout(() => {
      calibState.run = {
        ...calibState.run,
        state: settleTo,
        exitCode: 0,
        message:
          settleTo === "FAILED" ? "标定进程已结束但产物不完整: [cam_03.json]" : "标定完成",
        finishedAt: new Date().toISOString(),
      };
      if (settleTo === "SUCCEEDED") calibState.mode = "ready";
    }, Number(process.env.MOCK_CALIB_MS || 2000));
    return ok(calibState.run);
  },

  "GET /local/enroll/status": () =>
    ok({ session: lesson.lessonId, state: "SUCCEEDED", capturedPersons: 6, message: "注册完成" }),

  "GET /local/enroll/identities": () =>
    ok({
      session: lesson.lessonId,
      enrollCamera: "cam_03",
      people: FACES,
    }),

  "GET /local/roster": () =>
    ok({ lessonId: lesson.lessonId, syncedAt: startedAt, total: 18, galleryReadyCount: 16, students }),

  "POST /local/roster/match": (body) => {
    const s = students.find((x) => x.studentNo === body.studentNo);
    return ok({ matched: !!s, student: s || null });
  },

  "GET /local/record/status": () =>
    ok({
      state: "RECORDING",
      recordingId: "rec-20260729-100400",
      sessionId: session.sessionId,
      startedAt: new Date(bootAt.getTime() - 758 * 1000).toISOString(),
      elapsedSeconds: 758,
      cameras: [
        { cameraId: "cam_01", state: "RECORDING", file: "cam_01.mp4", error: null },
        { cameraId: "cam_02", state: "RECORDING", file: "cam_02.mp4", error: null },
        { cameraId: "cam_03", state: "RECORDING", file: "cam_03.mp4", error: null },
        { cameraId: "cam_04", state: "FAILED", file: null, error: "机位离线" },
      ],
    }),

  "GET /local/record/today": () =>
    ok({
      date: new Date().toISOString().slice(0, 10),
      dir: "C:/hoopshake/data",
      records: [
        { recordingId: "rec-20260729-091400", startedAt: new Date(bootAt.getTime() - 9e6).toISOString(), durationSeconds: 312, cameraCount: 4, recording: false, outputDir: "C:/hoopshake/data/2026-07-29/091400_rec", files: [] },
        { recordingId: "rec-20260729-093100", startedAt: new Date(bootAt.getTime() - 8e6).toISOString(), durationSeconds: 288, cameraCount: 4, recording: false, outputDir: "C:/hoopshake/data/2026-07-29/093100_rec", files: [] },
        { recordingId: "rec-20260729-100400", startedAt: new Date(bootAt.getTime() - 758e3).toISOString(), durationSeconds: 758, cameraCount: 4, recording: true, outputDir: "C:/hoopshake/data/2026-07-29/100400_rec", files: [] },
      ],
    }),

  "POST /local/enroll/start": (body) =>
    ok({ taskId: crypto.randomUUID(), studentNo: body.studentNo, camId: body.camId || "cam_03", frames: body.frames || 5, status: "CAPTURING" }),
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const key = `${req.method} ${url.pathname}`;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    // 采集进度按 taskId 逐次推进，看得到进度条动
    if (/^GET \/local\/enroll\/[^/]+\/progress$/.test(key)) {
      const taskId = url.pathname.split("/")[3];
      const n = bumpEnroll(taskId);
      return json(res, ok({
        taskId,
        status: n >= 5 ? "REGISTERED" : "CAPTURING",
        capturedFrames: Math.min(n, 5),
        totalFrames: 5,
        galleryId: n >= 5 ? crypto.randomUUID() : null,
        galleryVersion: n >= 5 ? 2 : null,
        failReason: null,
      }));
    }

    if (url.pathname === "/local/enroll/thumbnail") {
      const id = url.searchParams.get("id") || "";
      if (!HAS_IMG.has(id)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ code: 40400, message: "no thumbnail" }));
      }
      const seed = Number(id.replace(/\D/g, "")) || 1;
      const png = facePng(seed);
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.length });
      return res.end(png);
    }

    if (url.pathname === "/local/calibration/status") {
      const sess = url.searchParams.get("session") || "";
      if (!sess) return json(res, { code: 40000, message: "session 非法", data: null });
      return json(res, ok(calibPayload(sess)));
    }

    const handler = routes[key];
    // 没显式实现的写接口一律回成功，避免页面卡在 loading
    json(res, handler ? handler(body ? JSON.parse(body) : {}) : ok(null));
  });
});

const enrollTicks = new Map();
function bumpEnroll(taskId) {
  const n = (enrollTicks.get(taskId) || 0) + 1;
  enrollTicks.set(taskId, n);
  return n;
}

function json(res, payload) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

/* ---------- WebSocket：够用的最小实现，只发不收 ---------- */

server.on("upgrade", (req, socket) => {
  const accept = crypto
    .createHash("sha1")
    .update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  let seq = 0;
  const send = (type, payload) => {
    const data = Buffer.from(JSON.stringify({ type, seq: seq++, ts: new Date().toISOString(), payload }));
    const head =
      data.length < 126
        ? Buffer.from([0x81, data.length])
        : Buffer.concat([Buffer.from([0x81, 126]), Buffer.from([data.length >> 8, data.length & 255])]);
    try {
      socket.write(Buffer.concat([head, data]));
    } catch {
      /* 已断开 */
    }
  };

  // 接入快照
  cameras.forEach((c) => send("cameraStatus", c));
  send("sessionStatus", {
    sessionId: session.sessionId,
    lessonId: lesson.lessonId,
    state: session.state,
    unavailableCameras: session.unavailableCameras,
  });

  const cues = [
    { displayName: "李晓峰", checkpointId: "elbow_alignment", severity: "MAJOR", cueText: "收肘，肘尖对准篮筐", measured: { 肘角: "118°", 偏: "+20°" } },
    { displayName: "王梓萱", checkpointId: "release_timing", severity: "POSITIVE", cueText: "出手时机稳定，保持", measured: {} },
    { displayName: "陈一凡", checkpointId: "knee_valgus", severity: "MAJOR", cueText: "落地时膝盖对准脚尖", measured: {} },
    { displayName: "刘思远", checkpointId: "follow_through", severity: "POSITIVE", cueText: "随挥到位", measured: {} },
  ];

  let i = 0;
  const focusTimer = setInterval(() => {
    const c = cues[i % cues.length];
    const s = students[i % students.length];
    send("actionFocus", {
      studentId: s.studentId,
      displayName: s.displayName,
      studentNo: s.studentNo,
      actionType: i % 3 === 0 ? "layup" : "jump_shot",
      actionLabel: i % 3 === 0 ? "上篮" : "投篮",
      measured: {},
    });
    send("cue", {
      eventId: `fb-${seq}`,
      studentId: s.studentId,
      actionType: "jump_shot",
      occurredAt: new Date().toISOString(),
      ...c,
    });
    if (i % 5 === 4) {
      send("safetyAlert", {
        eventId: `sa-${seq}`,
        studentId: s.studentId,
        displayName: s.displayName,
        actionType: "jump_shot",
        checkpointId: "knee_valgus",
        message: "落地重心不稳",
        occurredAt: new Date().toISOString(),
      });
    }
    i += 1;
  }, 4000);

  // 骨架帧只用来喂「动作识别」的活性判断，坐标留空
  const poseTimer = setInterval(
    () =>
      send("poseFrame", {
        camId: "cam_03",
        frameNo: seq,
        persons: [{ studentId: students[0].studentId, displayName: students[0].displayName, confidence: 0.98, keypoints: [], bbox: [0.4, 0.2, 0.2, 0.6] }],
      }),
    500,
  );

  const stop = () => {
    clearInterval(focusTimer);
    clearInterval(poseTimer);
  };
  socket.on("close", stop);
  socket.on("error", stop);
});

server.listen(PORT, () => {
  console.log(`edge mock 已启动: http://127.0.0.1:${PORT}`);
  console.log("另开终端跑 npm run dev，vite 会把 /local 与 /ws 代理过来");
});
