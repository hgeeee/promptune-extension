// 공용 API 헬퍼. popup.js, content.js 양쪽에서 <script> 순서로 그대로 불러다 씀 (번들러 없음).

const PT_DEFAULT_API_BASE = "http://localhost:8080";

async function ptApiBase() {
  const { pt_api_base } = await chrome.storage.local.get("pt_api_base");
  return pt_api_base || PT_DEFAULT_API_BASE;
}

async function ptGetToken() {
  const { pt_token } = await chrome.storage.local.get("pt_token");
  return pt_token || null;
}

async function ptSaveToken(token) {
  await chrome.storage.local.set({ pt_token: token });
}

async function ptClearToken() {
  await chrome.storage.local.remove("pt_token");
}

async function ptAuthHeaders() {
  const token = await ptGetToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// 웹앱의 lib/auth.ts와 동일한 엔드포인트 재사용
async function ptLogin(email, password) {
  const base = await ptApiBase();
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "로그인 실패");
  }
  const data = await res.json();
  await ptSaveToken(data.token);
  return data;
}

// 웹앱의 lib/api.ts execute()와 동일
async function ptExecute(finalPrompt) {
  const base = await ptApiBase();
  const headers = { "Content-Type": "application/json", ...(await ptAuthHeaders()) };
  const res = await fetch(`${base}/api/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({ finalPrompt }),
  });
  if (!res.ok) throw new Error(`실행 실패: ${res.status}`);
  return res.json();
}

// 웹앱의 lib/api.ts improve()와 동일
async function ptImprove(text) {
  const base = await ptApiBase();
  const headers = { "Content-Type": "application/json", ...(await ptAuthHeaders()) };
  const res = await fetch(`${base}/api/improve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`개선 실패: ${res.status}`);
  return res.json();
}
