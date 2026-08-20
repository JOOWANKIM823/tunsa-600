const STORAGE_KEY = "tunsa600-progress-v1";
const DB_NAME = "tunsa600-study-db";
const DB_VERSION = 1;
const QUESTION_STORE = "questionBank";
const IMPORT_KEY = "imported-questions";

let questions = [...(window.QUESTIONS || [])];
const EXPECTED_PER_SET = 100;
const SET_GROUPS = [
  { title: "강의 회차", icon: "📘", sets: ["41회차", "42회차", "43회차"] },
  { title: "실전 모의고사", icon: "📝", sets: ["모의고사 1회", "모의고사 2회", "모의고사 3회", "모의고사 4회"] }
];
const ALL_SETS = SET_GROUPS.flatMap(group => group.sets);
const EXPECTED_TOTAL = ALL_SETS.length * EXPECTED_PER_SET;

let progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
let queue = [];
let currentIndex = 0;
let selectedChoice = null;
let checked = false;
let activeSet = null;

const dashboard = document.getElementById("dashboard");
const setOverview = document.getElementById("setOverview");
const quiz = document.getElementById("quiz");

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function openStudyDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUESTION_STORE)) {
        db.createObjectStore(QUESTION_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadImportedQuestions() {
  try {
    const db = await openStudyDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(QUESTION_STORE, "readonly");
      const store = tx.objectStore(QUESTION_STORE);
      const request = store.get(IMPORT_KEY);
      request.onsuccess = () => resolve(request.result?.questions || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("저장된 문제 데이터를 불러오지 못했습니다.", error);
    return [];
  }
}

async function saveImportedQuestions(importedQuestions) {
  const db = await openStudyDB();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(QUESTION_STORE, "readwrite");
    const store = tx.objectStore(QUESTION_STORE);
    store.put({ id: IMPORT_KEY, questions: importedQuestions, savedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function mergeQuestionLists(baseList, extraList) {
  const map = new Map();
  baseList.forEach(q => map.set(q.id, q));
  extraList.forEach(q => map.set(q.id, q));
  return [...map.values()];
}

function getLoadedCount(set) {
  return questions.filter(q => q.set === set).length;
}

function normalizeImportedQuestion(q, index) {
  const setAliases = {
    "1회": "모의고사 1회",
    "2회": "모의고사 2회",
    "3회": "모의고사 3회",
    "4회": "모의고사 4회",
    "모의 1회": "모의고사 1회",
    "모의 2회": "모의고사 2회",
    "모의 3회": "모의고사 3회",
    "모의 4회": "모의고사 4회"
  };

  const set = setAliases[q.set] || q.set;
  const number = Number(q.number);
  const answer = Number(q.answer);
  const choices = Array.isArray(q.choices) ? q.choices.map(v => String(v)) : [];

  if (!set || !ALL_SETS.includes(set)) throw new Error(`${index + 1}번째 문제의 회차(set)가 올바르지 않습니다.`);
  if (!Number.isInteger(number) || number < 1 || number > 100) throw new Error(`${index + 1}번째 문제의 번호가 올바르지 않습니다.`);
  if (!q.question || choices.length < 2) throw new Error(`${index + 1}번째 문제의 질문/보기가 부족합니다.`);
  if (!Number.isInteger(answer) || answer < 1 || answer > choices.length) throw new Error(`${index + 1}번째 문제의 정답 번호가 올바르지 않습니다.`);

  return {
    id: q.id || `${set.replaceAll(" ", "-")}-${number}`,
    set,
    subject: q.subject || "미분류",
    number,
    question: String(q.question),
    choices,
    answer,
    explanation: q.explanation ? String(q.explanation) : "해설이 아직 등록되지 않았습니다."
  };
}

async function importQuestionFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const rawQuestions = Array.isArray(parsed) ? parsed : parsed.questions;

    if (!Array.isArray(rawQuestions)) {
      throw new Error("JSON 파일 안에 문제 배열이 없습니다.");
    }

    const normalized = rawQuestions.map(normalizeImportedQuestion);
    const savedBefore = await loadImportedQuestions();
    const mergedImported = mergeQuestionLists(savedBefore, normalized);

    await saveImportedQuestions(mergedImported);
    questions = mergeQuestionLists([...(window.QUESTIONS || [])], mergedImported);

    if (navigator.storage?.persist) {
      try { await navigator.storage.persist(); } catch (_) {}
    }

    const importedSetCounts = normalized.reduce((acc, q) => {
      acc[q.set] = (acc[q.set] || 0) + 1;
      return acc;
    }, {});
    const importedSummary = Object.entries(importedSetCounts)
      .map(([set, count]) => `${set} ${count}문제`)
      .join(" · ");

    renderDashboard();
    alert(`${importedSummary}를 불러왔습니다.\n이 브라우저에 자동 저장되어 다음에 다시 들어와도 그대로 유지됩니다.`);
  } catch (error) {
    alert(`문제 파일을 불러오지 못했습니다.\n${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportProgress() {
  downloadJSON(`투운사_학습기록_${new Date().toISOString().slice(0, 10)}.json`, {
    version: 1,
    exportedAt: new Date().toISOString(),
    progress
  });
}

async function importProgressFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const incoming = parsed.progress || parsed;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      throw new Error("올바른 학습기록 파일이 아닙니다.");
    }

    progress = incoming;
    saveProgress();
    renderDashboard();
    alert("학습기록을 복원했습니다.");
  } catch (error) {
    alert(`학습기록을 복원하지 못했습니다.\n${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function stats() {
  let correct = 0;
  let wrong = 0;
  let attempted = 0;

  questions.forEach(q => {
    const p = progress[q.id];
    if (!p) return;
    attempted++;
    if (p.lastResult === true) correct++;
    if (p.everWrong === true) wrong++;
  });

  return {
    total: EXPECTED_TOTAL,
    loaded: questions.length,
    correct,
    wrong,
    attempted,
    unattempted: Math.max(EXPECTED_TOTAL - attempted, 0)
  };
}

function renderDashboard() {
  const s = stats();
  const rate = s.total ? Math.round((s.attempted / s.total) * 100) : 0;
  const mock4Loaded = getLoadedCount("모의고사 4회");

  dashboard.innerHTML = `
    <div class="stats">
      <div class="stat"><span>전체 구성</span><strong>${s.total}</strong><small>7회 × 100문제</small></div>
      <div class="stat"><span>맞힌 문제</span><strong>${s.correct}</strong><small>최근 결과 기준</small></div>
      <div class="stat"><span>오답 경험</span><strong>${s.wrong}</strong><small>한 번이라도 틀림</small></div>
      <div class="stat"><span>미풀이</span><strong>${s.unattempted}</strong><small>전체 700제 기준</small></div>
    </div>

    <div class="data-status-row">
      <div class="data-status">현재 등록된 문제 <strong>${s.loaded}</strong> / ${s.total}</div>
      <div class="auto-save-badge">☁️ 문제·학습기록 자동저장 ON</div>
    </div>

    <div class="mock4-connect ${mock4Loaded === 100 ? "complete" : ""}">
      <div class="mock4-copy">
        <span class="mock4-icon">${mock4Loaded === 100 ? "✅" : "📦"}</span>
        <div>
          <strong>모의고사 4회 데이터</strong>
          <span>${mock4Loaded === 100 ? "100문제 연결 완료 · 다음 방문부터 자동 로드됩니다." : `${mock4Loaded}/100문제 등록 · 받은 JSON 파일을 한 번만 불러오면 됩니다.`}</span>
        </div>
      </div>
      ${mock4Loaded === 100 ? `<button class="connect-done" onclick='openSet("모의고사 4회")'>4회 문제 보기 →</button>` : `<button class="connect-btn" onclick="document.getElementById('questionImport').click()">4회 JSON 연결하기</button>`}
    </div>

    <div class="data-tools">
      <div class="data-tools-copy">
        <strong>문제 데이터 관리</strong>
        <span>문제 파일은 한 번만 불러오면 이 기기의 브라우저에 저장돼요.</span>
      </div>
      <div class="data-tool-buttons">
        <button class="tool-btn primary-tool" onclick="document.getElementById('questionImport').click()">📥 문제파일 불러오기</button>
        <input id="questionImport" class="hidden-file" type="file" accept="application/json,.json" onchange="importQuestionFile(event)">
        <button class="tool-btn" onclick="exportProgress()">💾 학습기록 백업</button>
        <button class="tool-btn" onclick="document.getElementById('progressImport').click()">♻️ 학습기록 복원</button>
        <input id="progressImport" class="hidden-file" type="file" accept="application/json,.json" onchange="importProgressFile(event)">
      </div>
    </div>

    <div class="progress-wrap">
      <div class="progress-row"><span>전체 진행률</span><strong>${rate}%</strong></div>
      <div class="runner-track">
        <div class="runner-fill" style="width:${rate}%"></div>
        <div class="runner-character" style="left:min(max(calc(${rate}% - 18px), 0px), calc(100% - 40px))">🐱</div>
        <div class="runner-goal">🏁</div>
      </div>
    </div>

    <div class="actions">
      <button class="action-btn" onclick="startQuiz('all')">등록된 문제 전체 풀기</button>
      <button class="action-btn secondary" onclick="startQuiz('wrong')">오답만 풀기</button>
      <button class="action-btn secondary" onclick="startQuiz('unattempted')">등록된 미풀이 풀기</button>
    </div>

    <div class="study-groups">
      ${SET_GROUPS.map(group => `
        <section class="study-group">
          <div class="group-heading">
            <div><span class="group-icon">${group.icon}</span><h2>${group.title}</h2></div>
            <span>${group.sets.length * 100}문제</span>
          </div>
          <div class="sets ${group.sets.length === 4 ? "sets-four" : ""}">
            ${group.sets.map(set => renderSetCard(set)).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function renderSetCard(set) {
  const setQuestions = questions.filter(q => q.set === set);
  const loaded = setQuestions.length;
  const solved = setQuestions.filter(q => progress[q.id]).length;
  const percent = Math.round((solved / EXPECTED_PER_SET) * 100);

  return `
    <button class="set-btn" onclick='openSet(${JSON.stringify(set)})'>
      <div class="set-card-top">
        <strong>${set}</strong>
        <span class="set-percent">${percent}%</span>
      </div>
      <span class="set-progress-text">${solved} / 100 풀이</span>
      <div class="mini-progress"><i style="width:${percent}%"></i></div>
      <span class="set-loaded">문제 등록 ${loaded} / 100</span>
      <em>1~100번 보기 →</em>
    </button>
  `;
}

function startQuiz(mode) {
  if (mode === "wrong") queue = questions.filter(q => progress[q.id]?.everWrong);
  else if (mode === "unattempted") queue = questions.filter(q => !progress[q.id]);
  else queue = [...questions];

  if (!queue.length) {
    alert(mode === "wrong" ? "현재 오답 문제가 없습니다." : "아직 등록된 해당 문제가 없습니다.");
    return;
  }

  currentIndex = 0;
  showQuiz();
}

function openSet(set) {
  activeSet = set;
  dashboard.classList.add("hidden");
  quiz.classList.add("hidden");
  setOverview.classList.remove("hidden");
  renderSetOverview();
}

function renderSetOverview() {
  const setQuestions = questions
    .filter(q => q.set === activeSet)
    .sort((a, b) => a.number - b.number);

  const byNumber = new Map(setQuestions.map(q => [q.number, q]));
  const loaded = setQuestions.length;
  const solved = setQuestions.filter(q => progress[q.id]).length;
  const correct = setQuestions.filter(q => progress[q.id]?.lastResult === true).length;
  const wrong = setQuestions.filter(q => progress[q.id]?.everWrong === true).length;
  const rate = Math.round((solved / EXPECTED_PER_SET) * 100);

  setOverview.innerHTML = `
    <div class="set-overview-top">
      <div>
        <button class="back-link" onclick="goHome()">← 메인으로</button>
        <h2>${activeSet}</h2>
        <p>문제 등록 ${loaded}/100 · ${solved}문제 풀이 · ${correct}문제 정답 · ${wrong}문제 오답 경험</p>
      </div>
      <button class="primary" onclick='startSet(${JSON.stringify(activeSet)})' ${loaded ? "" : "disabled"}>이 회차 처음부터 풀기</button>
    </div>

    <div class="set-mini-run">
      <span>회차 진행률 ${rate}%</span>
      <div class="set-run-track"><i style="width:${rate}%"></i><b style="left:min(max(calc(${rate}% - 10px), 0px), calc(100% - 24px))">🐱</b><em>🏁</em></div>
    </div>

    <div class="status-legend">
      <span><i class="dot unattempted"></i>미풀이</span>
      <span><i class="dot correct"></i>최근 정답</span>
      <span><i class="dot wrong"></i>오답 경험</span>
      <span><i class="dot unavailable"></i>아직 미등록</span>
    </div>

    <div class="number-grid">
      ${Array.from({ length: 100 }, (_, i) => i + 1).map(num => {
        const q = byNumber.get(num);
        if (!q) return `<button class="number-btn unavailable" disabled title="아직 문제 데이터가 등록되지 않았어요">${num}</button>`;

        const p = progress[q.id];
        let statusClass = "unattempted";
        if (p?.everWrong) statusClass = "wrong";
        if (p?.lastResult === true && !p?.everWrong) statusClass = "correct";
        if (p?.lastResult === true && p?.everWrong) statusClass = "reviewed";

        return `<button class="number-btn ${statusClass}" onclick='openQuestionFromSet(${JSON.stringify(activeSet)}, ${num})'>${num}</button>`;
      }).join("")}
    </div>
  `;
}

function openQuestionFromSet(set, number) {
  queue = questions.filter(q => q.set === set).sort((a, b) => a.number - b.number);
  const idx = queue.findIndex(q => q.number === number);
  if (idx < 0) return;
  currentIndex = idx;
  showQuiz();
}

function startSet(set) {
  queue = questions.filter(q => q.set === set).sort((a, b) => a.number - b.number);
  if (!queue.length) {
    alert("아직 이 회차의 문제 데이터가 등록되지 않았어요.");
    return;
  }
  currentIndex = 0;
  showQuiz();
}

function showQuiz() {
  dashboard.classList.add("hidden");
  setOverview.classList.add("hidden");
  quiz.classList.remove("hidden");
  renderQuestion();
}

function renderQuestion() {
  selectedChoice = null;
  checked = false;
  const q = queue[currentIndex];

  quiz.innerHTML = `
    <div class="quiz-top">
      <div class="badges"><span class="badge">${q.set}</span><span class="badge">${q.subject}</span></div>
      <div class="question-number">${currentIndex + 1} / ${queue.length}</div>
    </div>
    <div class="question"><span class="question-no">${q.number}</span><span>${q.question}</span></div>
    <div class="choices">
      ${q.choices.map((choice, i) => `<button class="choice" data-choice="${i + 1}" onclick="selectChoice(${i + 1})"><span class="choice-number">${i + 1}</span><span class="choice-text">${choice}</span></button>`).join("")}
    </div>
    <div id="feedback"></div>
    <div class="quiz-actions">
      <button class="primary" onclick="checkAnswer()">정답 확인</button>
      <button class="ghost" onclick="goHome()">메인으로</button>
    </div>
  `;
}

function selectChoice(choice) {
  if (checked) return;
  selectedChoice = choice;
  document.querySelectorAll(".choice").forEach(el => {
    el.classList.toggle("selected", Number(el.dataset.choice) === choice);
  });
}

function checkAnswer() {
  if (checked) return;
  if (!selectedChoice) {
    alert("보기를 먼저 선택해 주세요.");
    return;
  }

  checked = true;
  const q = queue[currentIndex];
  const isCorrect = selectedChoice === q.answer;
  const prev = progress[q.id] || { attempts: 0, correctCount: 0, wrongCount: 0, correctStreak: 0, everWrong: false };

  prev.attempts++;
  prev.lastResult = isCorrect;

  if (isCorrect) {
    prev.correctCount++;
    prev.correctStreak = (prev.correctStreak || 0) + 1;
  } else {
    prev.wrongCount++;
    prev.correctStreak = 0;
    prev.everWrong = true;
  }

  progress[q.id] = prev;
  saveProgress();

  document.querySelectorAll(".choice").forEach(el => {
    const n = Number(el.dataset.choice);
    if (n === q.answer) el.classList.add("correct");
    if (n === selectedChoice && !isCorrect) el.classList.add("wrong");
    el.classList.remove("selected");
  });

  document.getElementById("feedback").innerHTML = `
    <div class="feedback">
      <h3>${isCorrect ? "✅ 정답입니다" : "❌ 틀렸습니다"}</h3>
      <strong>정답 ${q.answer}번</strong>\n\n${q.explanation}
    </div>
  `;

  const actions = document.querySelector(".quiz-actions");
  actions.innerHTML = `
    <button class="primary" onclick="nextQuestion()">${currentIndex + 1 < queue.length ? "다음 문제" : "학습 종료"}</button>
    <button class="ghost" onclick="goHome()">메인으로</button>
  `;
}

function nextQuestion() {
  if (currentIndex + 1 < queue.length) {
    currentIndex++;
    renderQuestion();
  } else {
    goHome();
  }
}

function goHome() {
  quiz.classList.add("hidden");
  setOverview.classList.add("hidden");
  dashboard.classList.remove("hidden");
  renderDashboard();
}

async function initApp() {
  const imported = await loadImportedQuestions();
  questions = mergeQuestionLists([...(window.QUESTIONS || [])], imported);
  renderDashboard();
}

initApp();