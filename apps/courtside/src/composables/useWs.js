// 自重连 WebSocket。帧结构 { type, seq, ts, payload }，type 取后端 WsEventType 的线上名。

const RETRY_STEPS = [1000, 2000, 4000, 8000, 15000];
const HEARTBEAT_MS = 25000;

/**
 * @param {string} channel display / console / registration
 * @param {(type: string, payload: any) => void} onMessage
 * @param {(status: string) => void} onStatus
 * @param {() => void} onReopen 重连成功回调，用于 REST 对账
 */
export function openWs(channel, { onMessage, onStatus, onReopen } = {}) {
  let socket = null;
  let retry = 0;
  let heartbeat = null;
  let timer = null;
  let disposed = false;
  let opened = false;

  const wsUrl = () => {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${location.host}/ws/${channel}`;
  };

  function open() {
    if (disposed) return;
    onStatus?.(opened ? "reconnecting" : "connecting");

    try {
      socket = new WebSocket(wsUrl());
    } catch {
      scheduleRetry();
      return;
    }

    socket.onopen = () => {
      retry = 0;
      onStatus?.("open");
      if (opened) onReopen?.();
      opened = true;
      // 保活，避免中间设备掐掉空闲连接
      heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
      }, HEARTBEAT_MS);
    };

    socket.onmessage = (ev) => {
      let frame;
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (frame?.type) onMessage?.(frame.type, frame.payload, frame);
    };

    socket.onerror = () => onStatus?.("error");

    socket.onclose = () => {
      clearInterval(heartbeat);
      heartbeat = null;
      socket = null;
      if (!disposed) scheduleRetry();
    };
  }

  function scheduleRetry() {
    const wait = RETRY_STEPS[Math.min(retry, RETRY_STEPS.length - 1)];
    retry += 1;
    onStatus?.("closed");
    clearTimeout(timer);
    timer = setTimeout(open, wait);
  }

  open();

  return {
    close() {
      disposed = true;
      clearTimeout(timer);
      clearInterval(heartbeat);
      socket?.close();
    },
  };
}
