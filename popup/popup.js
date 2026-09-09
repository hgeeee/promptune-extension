const loginView = document.getElementById("loginView");
const composerView = document.getElementById("composerView");
const logoutBtn = document.getElementById("logoutBtn");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

const promptText = document.getElementById("promptText");
const improveBtn = document.getElementById("improveBtn");
const composerError = document.getElementById("composerError");

const improveCard = document.getElementById("improveCard");
const missingElementsEl = document.getElementById("missingElements");
const typoWarningsEl = document.getElementById("typoWarnings");
const improvedPreview = document.getElementById("improvedPreview");
const placeholderChips = document.getElementById("placeholderChips");
const insertIntoPageBtn = document.getElementById("insertIntoPageBtn");
const copyImprovedBtn = document.getElementById("copyImprovedBtn");

let latestImproved = "";

async function refreshView() {
  const token = await ptGetToken();
  const loggedIn = Boolean(token);
  loginView.hidden = loggedIn;
  composerView.hidden = !loggedIn;
  logoutBtn.hidden = !loggedIn;
}

loginBtn.addEventListener("click", async () => {
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = "로그인 중…";
  try {
    await ptLogin(emailInput.value.trim(), passwordInput.value);
    passwordInput.value = "";
    await refreshView();
  } catch (e) {
    loginError.textContent = e.message || "로그인에 실패했습니다.";
    loginError.hidden = false;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "로그인";
  }
});

logoutBtn.addEventListener("click", async () => {
  await ptClearToken();
  await refreshView();
});

improveBtn.addEventListener("click", async () => {
  const text = promptText.value.trim();
  if (!text) return;
  composerError.hidden = true;
  improveBtn.disabled = true;
  improveBtn.textContent = "다듬는 중…";
  try {
    const res = await ptImprove(text);
    latestImproved = res.improvedPrompt || "";
    const missing = res.promptRule?.missing_elements || [];
    if (missing.length > 0) {
      missingElementsEl.hidden = false;
      missingElementsEl.textContent = `빠진 요소: ${missing.join(", ")}`;
    } else {
      missingElementsEl.hidden = true;
    }

    // 오탈자: 백엔드 응답(res.diagnose.typos)에는 이미 있었는데 화면에 안 쓰고 버려지던 것 - 노출만 추가
    const typos = res.diagnose?.typos || [];
    if (typos.length > 0) {
      typoWarningsEl.hidden = false;
      typoWarningsEl.innerHTML = "";
      typoWarningsEl.appendChild(document.createTextNode(
        `오탈자 의심: ${typos.map((t) => `${t.span ?? ""} → ${t.suggest ?? ""}`).join(", ")}`
      ));

      const fixTyposBtn = document.createElement("button");
      fixTyposBtn.type = "button";
      fixTyposBtn.textContent = "오탈자 전체 수정";
      fixTyposBtn.addEventListener("click", () => {
        typos.forEach((t) => {
          if (t.span && t.suggest) {
            latestImproved = latestImproved.split(t.span).join(t.suggest);
          }
        });
        improvedPreview.textContent = latestImproved;
        promptText.value = latestImproved;
        typoWarningsEl.hidden = true;
      });
      typoWarningsEl.appendChild(document.createElement("br"));
      typoWarningsEl.appendChild(fixTyposBtn);
    } else {
      typoWarningsEl.hidden = true;
    }

    improvedPreview.textContent = latestImproved;
    promptText.value = latestImproved;
    renderPlaceholderChips(res.placeholders || []);
    improveCard.hidden = false;
  } catch (e) {
    composerError.textContent = e.message || "프롬프트 개선에 실패했습니다.";
    composerError.hidden = false;
  } finally {
    improveBtn.disabled = false;
    improveBtn.textContent = "프롬프트 다듬기";
  }
});

// 다듬기 결과의 부족 요소별 후보 문구를 칩 버튼으로 나열.
// 클릭하면 그 자리(placeholderText)만 실제 문구로 바뀌고, 목록에서 빠짐.
function renderPlaceholderChips(placeholders) {
  placeholderChips.innerHTML = "";

  placeholders.forEach((ph) => {
    const row = document.createElement("div");
    row.className = "chip-row";

    const label = document.createElement("span");
    label.className = "chip-label";
    label.textContent = ph.element;
    row.appendChild(label);

    [ph.primary, ...(ph.alternatives || [])].forEach((option) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = option;
      chip.addEventListener("click", () => {
        latestImproved = latestImproved.replace(ph.placeholderText, option);
        improvedPreview.textContent = latestImproved;
        promptText.value = latestImproved; // 입력창에도 즉시 반영
        row.remove();
      });
      row.appendChild(chip);
    });

    placeholderChips.appendChild(row);
  });
}

// 현재 활성 탭의 포커스된 입력창(textarea/input/contenteditable)에 텍스트 삽입
async function insertIntoActiveTab(text) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return false;
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (value) => {
      const el = document.activeElement;
      if (!el) return false;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      } else if (el.isContentEditable) {
        el.innerText = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
      return false;
    },
    args: [text],
  });
  return result;
}

insertIntoPageBtn.addEventListener("click", async () => {
  const ok = await insertIntoActiveTab(latestImproved);
  insertIntoPageBtn.textContent = ok ? "붙여넣었어요" : "입력창을 찾지 못했어요";
  setTimeout(() => { insertIntoPageBtn.textContent = "현재 페이지에 붙여넣기"; }, 1500);
});

refreshView();
