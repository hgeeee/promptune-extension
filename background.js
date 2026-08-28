chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

// content.js는 웹페이지 origin으로 fetch가 나가서 CORS에 걸리므로,
// service worker(여기)가 대신 요청을 보내줌 - 여긴 origin 제약이 없음.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PT_API_CALL") {
    (async () => {
      try {
        const { pt_api_base } = await chrome.storage.local.get("pt_api_base");
        const base = pt_api_base || "http://localhost:8080";
        const { pt_token } = await chrome.storage.local.get("pt_token");

        const headers = { "Content-Type": "application/json" };
        if (pt_token) headers.Authorization = `Bearer ${pt_token}`;

        const method = message.method || "POST";
        const fetchOptions = { method, headers };
        if (method !== "GET") {
          fetchOptions.body = JSON.stringify(message.body || {});
        }

        const res = await fetch(`${base}${message.path}`, fetchOptions);

        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok, status: res.status, data });
      } catch (err) {
        sendResponse({ ok: false, status: 0, data: { error: String(err) } });
      }
    })();
    return true;
  }

  // 웹앱의 recordBehaviorAction()과 동일 - 확장에서 칩을 고르거나 건너뛰어도
  // 개인화 학습 데이터(behavior_logs)에 똑같이 반영되도록 함
  if (message?.type === "PT_BEHAVIOR_LOG") {
    (async () => {
      try {
        const { pt_api_base } = await chrome.storage.local.get("pt_api_base");
        const base = pt_api_base || "http://localhost:8080";
        const { pt_token } = await chrome.storage.local.get("pt_token");

        const headers = { "Content-Type": "application/json" };
        if (pt_token) headers.Authorization = `Bearer ${pt_token}`;

        await fetch(`${base}/api/behavior-actions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            element: message.element,
            action: message.action,
            chatSessionId: null, // 확장은 채팅 세션 개념이 없어서 null로 전송 (백엔드가 nullable로 허용)
          }),
        });
      } catch {
        // 행동 기록 실패는 사용 흐름을 막지 않음 (조용히 무시, 웹앱과 동일한 원칙)
      }
    })();
    return false; // 응답 기다릴 필요 없음 (fire-and-forget)
  }

  return false;
});
