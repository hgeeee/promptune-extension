// 아무 사이트의 textarea/input/contenteditable에 포커스가 가면 작은 "PrompTune" 버튼을 띄우고,
// 클릭하면 /api/improve 호출 결과를 팝오버로 보여줌.
// 정확한 글자 위치(span) 밑줄까지는 아니고, "다듬기 제안" 팝오버 수준의 MVP.

let ptCurrentEl = null;
let ptBtn = null;
let ptPopover = null;
let ptCompareModeActive = false; // "적용" 눌러서 결과 비교 단계에 들어가면 true - 이후 입력창 포커스 여부와 무관하게 팝오버 유지
let ptBubble = null; // 카드를 접었을 때 뜨는 작은 플로팅 아이콘
let ptLastResult = null; // 재확장 시 다시 그리기 위해 마지막 다듬기 결과 보관
let ptLastTargetEl = null; // 재확장 시 어느 입력창 대상이었는지 보관

function ptIsEditable(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT" && ["text", "search", "email"].includes(el.type)) return true;
  if (el.isContentEditable) return true;
  return false;
}

function ptGetText(el) {
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value;
  return el.innerText;
}

function ptSetText(el, text) {
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    el.innerText = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function ptRemoveUI() {
  if (ptBtn) { ptBtn.remove(); ptBtn = null; }
  if (ptPopover) { ptPopover.remove(); ptPopover = null; }
  if (ptBubble) { ptBubble.remove(); ptBubble = null; }
  ptCompareModeActive = false; // 다음 번 새로 열 때는 다시 정상적으로 focusout 감지되도록
}

// 카드를 접어서 화면 구석의 작은 아이콘으로 최소화 (완전히 닫는 것과 다름 -
// 다시 클릭하면 방금 상태 그대로 펼쳐짐)
function ptMinimize() {
  if (!ptPopover) return;
  ptPopover.remove();
  ptPopover = null;
  ptShowBubble();
}

function ptShowBubble() {
  if (ptBubble) ptBubble.remove();

  ptBubble = document.createElement("div");
  ptBubble.className = "pt-bubble";
  ptBubble.title = "PrompTune 다시 열기";

  const bubbleIcon = document.createElement("img");
  bubbleIcon.src = chrome.runtime.getURL("icons/icon48.png");
  bubbleIcon.alt = "PrompTune";
  ptBubble.appendChild(bubbleIcon);

  ptBubble.addEventListener("mousedown", (e) => e.preventDefault());
  ptBubble.addEventListener("click", () => {
    ptBubble.remove();
    ptBubble = null;
    if (ptLastTargetEl && ptLastResult) {
      ptShowPopover(ptLastTargetEl, ptLastResult);
    }
  });

  document.body.appendChild(ptBubble);
}

function ptShowButton(el) {
  ptRemoveUI();
  ptCurrentEl = el;
  const rect = el.getBoundingClientRect();
  if (rect.width < 60 || rect.height < 20) return; // 너무 작은 입력창(검색창 등)엔 안 띄움

  ptBtn = document.createElement("button");
  ptBtn.type = "button";
  ptBtn.className = "pt-float-btn";
  ptBtn.textContent = "✦ PrompTune";
  ptBtn.style.top = `${window.scrollY + rect.top + 4}px`;
  ptBtn.style.left = `${window.scrollX + rect.right - 88}px`;
  // mousedown에서 막아야 클릭해도 원래 입력창 포커스가 안 풀림
  ptBtn.addEventListener("mousedown", (e) => e.preventDefault());
  ptBtn.addEventListener("click", () => ptRunImprove(el));
  document.body.appendChild(ptBtn);
}

async function ptRunImprove(el) {
  const text = ptGetText(el);
  if (!text || !text.trim()) return;
  ptBtn.textContent = "다듬는 중…";
  ptBtn.disabled = true;
  try {
    const res = await ptCallViaBackground("/api/improve", { text });
    ptShowPopover(el, res);
  } catch (e) {
    console.error("[PrompTune] improve 실패:", e);
    ptBtn.textContent = e.message.includes("401") || e.message.includes("403") ? "로그인이 필요해요" : "오류 발생";
    setTimeout(() => { if (ptBtn) ptBtn.textContent = "✦ PrompTune"; }, 1800);
  } finally {
    if (ptBtn) ptBtn.disabled = false;
  }
}

function ptShowPopover(el, res) {
  if (ptPopover) ptPopover.remove();

  // currentText: 사용자가 칩을 골라 선택할 때마다 갱신되는 최종 텍스트
  let currentText = res.improvedPrompt || "";
  let remainingPlaceholders = Array.isArray(res.placeholders) ? [...res.placeholders] : [];

  ptPopover = document.createElement("div");
  // 사이트마다 레이아웃이 다 달라서 입력창 기준 상대 위치는 불안정함 -
  // 뷰포트 기준 고정(우하단)이 훨씬 견고하고 어떤 사이트에서도 절대 안 가림
  ptPopover.className = "pt-popover pt-popover-fixed";

  // 버튼/칩이 아닌 영역(제목, 텍스트 등)을 클릭했을 때 원래 입력창의 포커스가
  // 뺏겨서 focusout으로 오인 닫힘되는 것 방지. input/textarea는 예외 -
  // 나중에 GPT 답변 붙여넣기 칸을 추가해도 그 칸은 정상적으로 타이핑 포커스를 받아야 하므로.
  ptPopover.addEventListener("mousedown", (e) => {
    const tag = e.target.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && tag !== "OPTION") {
      e.preventDefault();
    }
  });

  // 재확장(접었다 펼치기)을 위해 지금 상태를 기억해둠
  ptLastResult = res;
  ptLastTargetEl = el;

  const collapseBtn = document.createElement("button");
  collapseBtn.className = "pt-collapse-btn";
  collapseBtn.textContent = "–";
  collapseBtn.title = "접기";
  collapseBtn.addEventListener("mousedown", (e) => e.preventDefault());
  collapseBtn.addEventListener("click", ptMinimize);
  ptPopover.appendChild(collapseBtn);

  const title = document.createElement("div");
  title.className = "pt-popover-title";
  title.textContent = "AI가 프롬프트를 다듬어봤어요";
  ptPopover.appendChild(title);

  const preview = document.createElement("div");
  preview.className = "pt-popover-preview";
  preview.textContent = currentText;
  ptPopover.appendChild(preview);

  // 부족했던 요소별로 칩(버튼) 나열 - 진짜 <button>이라 Tab으로 자연스럽게
  // 포커스 이동 가능, Enter/Space로 바로 선택됨 (별도 키보드 로직 불필요)
  const chipsWrap = document.createElement("div");
  chipsWrap.className = "pt-chips-wrap";
  ptPopover.appendChild(chipsWrap);

  function renderChips() {
    chipsWrap.innerHTML = "";
    remainingPlaceholders.forEach((ph) => {
      const row = document.createElement("div");
      row.className = "pt-chip-row";

      const label = document.createElement("span");
      label.className = "pt-chip-label";
      label.textContent = ph.element;
      row.appendChild(label);

      [ph.primary, ...ph.alternatives].forEach((option) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "pt-chip";
        chip.textContent = option;
        chip.addEventListener("mousedown", (e) => e.preventDefault());
        chip.addEventListener("click", () => {
          chrome.runtime.sendMessage({ type: "PT_BEHAVIOR_LOG", element: ph.element, action: "applied" });
          currentText = currentText.replace(ph.placeholderText, option);
          preview.textContent = currentText;
          remainingPlaceholders = remainingPlaceholders.filter((p) => p !== ph);
          renderChips();
        });
        row.appendChild(chip);
      });

      chipsWrap.appendChild(row);
    });
  }
  renderChips();

  const actions = document.createElement("div");
  actions.className = "pt-popover-actions";

  const applyBtn = document.createElement("button");
  applyBtn.className = "pt-apply";
  applyBtn.textContent = "적용 (팝오버 유지)";
  applyBtn.addEventListener("mousedown", (e) => e.preventDefault());
  applyBtn.addEventListener("click", () => {
    ptSetText(el, currentText);
    ptCompareModeActive = true; // 이제부터 focusout 감지 무시
    // 팝오버를 안 닫음 - 이어서 결과 비교까지 이 창에서 진행
  });

  const copyBtn = document.createElement("button");
  copyBtn.className = "pt-copy";
  copyBtn.textContent = "복사하기";
  copyBtn.addEventListener("mousedown", (e) => e.preventDefault());
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentText);
      copyBtn.textContent = "복사됨!";
      setTimeout(() => { copyBtn.textContent = "복사하기"; }, 1200);
    } catch {
      copyBtn.textContent = "복사 실패";
    }
  });

  const dismissBtn = document.createElement("button");
  dismissBtn.className = "pt-dismiss";
  dismissBtn.textContent = "닫기";
  dismissBtn.addEventListener("mousedown", (e) => e.preventDefault());
  dismissBtn.addEventListener("click", ptRemoveUI);

  actions.appendChild(applyBtn);
  actions.appendChild(copyBtn);
  actions.appendChild(dismissBtn);
  ptPopover.appendChild(actions);

  ptAppendCompareSection(ptPopover, () => currentText);

  document.body.appendChild(ptPopover);
}

// 개선된 프롬프트를 /api/execute로 실행해서 프롬프튠 자체 결과를 보여주고,
// GPT/Claude 답변을 붙여넣으면 차이점을 정리해줌 (자동 스크래핑 없음)
function ptAppendCompareSection(popoverEl, getCurrentText) {
  const section = document.createElement("div");
  section.className = "pt-compare-section";

  // 참고 문서 선택 (여러 개 선택 가능)
  const docLabel = document.createElement("div");
  docLabel.className = "pt-compare-label";
  docLabel.textContent = "참고 문서 (선택)";
  section.appendChild(docLabel);

  const docSelect = document.createElement("select");
  docSelect.className = "pt-select";
  docSelect.multiple = true;
  docSelect.size = 3;
  section.appendChild(docSelect);

  ptCallViaBackground("/api/documents", null, "GET")
    .then((docs) => {
      (docs || []).forEach((doc) => {
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = doc.title;
        docSelect.appendChild(opt);
      });
    })
    .catch(() => {
      docSelect.disabled = true;
    });

  // 수신자 선택 (한 명만)
  const receiverLabel = document.createElement("div");
  receiverLabel.className = "pt-compare-label";
  receiverLabel.textContent = "수신자 (선택)";
  section.appendChild(receiverLabel);

  const receiverSelect = document.createElement("select");
  receiverSelect.className = "pt-select";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "선택 안 함";
  receiverSelect.appendChild(noneOpt);
  section.appendChild(receiverSelect);

  ptCallViaBackground("/api/receiver-profiles", null, "GET")
    .then((profiles) => {
      (profiles || []).forEach((profile) => {
        const opt = document.createElement("option");
        opt.value = profile.id;
        opt.textContent = profile.name || profile.displayName || `수신자 #${profile.id}`;
        receiverSelect.appendChild(opt);
      });
    })
    .catch(() => {
      receiverSelect.disabled = true;
    });

  const runBtn = document.createElement("button");
  runBtn.className = "pt-run-btn";
  runBtn.textContent = "프롬프튠 결과 보기";

  const resultBox = document.createElement("div");
  resultBox.className = "pt-result-box";
  resultBox.hidden = true;

  runBtn.addEventListener("mousedown", (e) => e.preventDefault());
  runBtn.addEventListener("click", async () => {
    runBtn.textContent = "생성 중…";
    runBtn.disabled = true;
    try {
      const documentIds = Array.from(docSelect.selectedOptions).map((o) => Number(o.value));
      const receiverProfileId = receiverSelect.value ? Number(receiverSelect.value) : undefined;

      const execRes = await ptCallViaBackground("/api/execute", {
        finalPrompt: getCurrentText(),
        documentIds: documentIds.length > 0 ? documentIds : undefined,
        receiverProfileId,
      });
      const answerText = (execRes && execRes.result && execRes.result.result) || "결과를 가져오지 못했습니다.";
      resultBox.textContent = answerText;
      resultBox.hidden = false;
      runBtn.textContent = "다시 생성";
      ptAppendGptCompareUI(section, answerText);
    } catch {
      resultBox.textContent = "실행 중 오류가 발생했습니다.";
      resultBox.hidden = false;
      runBtn.textContent = "프롬프튠 결과 보기";
    } finally {
      runBtn.disabled = false;
    }
  });

  section.appendChild(runBtn);
  section.appendChild(resultBox);
  popoverEl.appendChild(section);
}

function ptAppendGptCompareUI(section, promptuneAnswer) {
  if (section.querySelector(".pt-gpt-compare")) return;

  const wrap = document.createElement("div");
  wrap.className = "pt-gpt-compare";

  const label = document.createElement("div");
  label.className = "pt-compare-label";
  label.textContent = "이 사이트의 답변을 붙여넣으면 차이점을 정리해드려요";
  wrap.appendChild(label);

  const textarea = document.createElement("textarea");
  textarea.className = "pt-gpt-textarea";
  textarea.placeholder = "여기에 답변을 붙여넣으세요 (Ctrl/Cmd+V)";
  wrap.appendChild(textarea);

  const diffBtn = document.createElement("button");
  diffBtn.className = "pt-diff-btn";
  diffBtn.textContent = "차이점 정리";
  diffBtn.addEventListener("mousedown", (e) => e.preventDefault());

  const diffBox = document.createElement("div");
  diffBox.className = "pt-result-box";
  diffBox.hidden = true;

  diffBtn.addEventListener("click", async () => {
    const otherAnswer = textarea.value.trim();
    if (!otherAnswer) {
      diffBox.textContent = "답변을 먼저 붙여넣어 주세요.";
      diffBox.hidden = false;
      return;
    }
    diffBtn.textContent = "정리 중…";
    diffBtn.disabled = true;
    try {
      const comparePrompt =
        `아래 두 개의 AI 답변을 비교해서, 핵심적인 차이점만 3~5개 간단히 정리해줘. ` +
        `답변 내용을 그대로 옮기지 말고 차이점(어조, 분량, 형식, 포함된 정보 등)만 요약해.\n\n` +
        `[답변 A - 원래 사이트]\n${otherAnswer}\n\n` +
        `[답변 B - 프롬프튠 개선 프롬프트로 생성한 답변]\n${promptuneAnswer}`;
      const execRes = await ptCallViaBackground("/api/execute", { finalPrompt: comparePrompt });
      const diffText = (execRes && execRes.result && execRes.result.result) || "비교 결과를 가져오지 못했습니다.";
      diffBox.textContent = diffText;
      diffBox.hidden = false;
      diffBtn.textContent = "다시 정리";
    } catch {
      diffBox.textContent = "비교 중 오류가 발생했습니다.";
      diffBox.hidden = false;
      diffBtn.textContent = "차이점 정리";
    } finally {
      diffBtn.disabled = false;
    }
  });

  wrap.appendChild(diffBtn);
  wrap.appendChild(diffBox);
  section.appendChild(wrap);
}

document.addEventListener("focusin", (e) => {
  if (ptIsEditable(e.target)) ptShowButton(e.target);
});

// 카드를 "접기" 버튼으로만 접고, 자동으로는 절대 안 사라지게 함
// (이전엔 포커스가 벗어나면 자동으로 닫히는 로직이었으나, 사이트마다
// 포커스가 예기치 않게 바뀌는 경우가 많아 오히려 불안정했음 - 이제 사용자가
// 명시적으로 접기/닫기 버튼을 눌러야만 UI가 바뀌도록 통일함)
document.addEventListener("focusout", () => {
  // 의도적으로 비워둠 - 자동 제거 없음
});

// content script에서 쓰는 전용 함수 - 직접 fetch하지 않고 background(service worker)에게 대신 호출을 부탁함
// (content script의 fetch는 웹페이지 origin으로 나가서 CORS에 걸리기 때문)
function ptCallViaBackground(path, body, method) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "PT_API_CALL", path, body, method }, (response) => {
      if (!response) {
        reject(new Error("background 응답 없음"));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.data?.error || `실패: ${response.status}`));
        return;
      }
      resolve(response.data);
    });
  });
}
