const STORAGE_KEY = "tunsa600-progress-v1";
const questions = window.QUESTIONS || [];
let progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
let queue = [];
let currentIndex = 0;
let selectedChoice = null;
let checked = false;

const dashboard = document.getElementById("dashboard");
const quiz = document.getElementById("quiz");

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
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
  return { total: questions.length, correct, wrong, attempted, unattempted: questions.length - attempted };
}

function renderDashboard() {
  const s = stats();
  const rate = s.total ? Math.round((s.attempted / s.total) * 100) : 0;
  const sets = [...new Set(questions.map(q => q.set))];

  dashboard.innerHTML = `
    <div class="stats">
      <div class="stat"><span>전체 문제</span><strong>${s.total}</strong></div>
      <div class="stat"><span>맞힌 문제</span><strong>${s.correct}</strong></div>
      <div class="stat"><span>오답 경험</span><strong>${s.wrong}</strong></div>
      <div class="stat"><span>미풀이</span><strong>${s.unattempted}</strong></div>
    </div>
    <div class="progress-wrap">
      <div class="progress-row"><span>전체 진행률</span><strong>${rate}%</strong></div>
      <div class="progress"><div style="width:${rate}%"></div></div>
    </div>
    <div class="actions">
      <button class="action-btn" onclick="startQuiz('all')">전체 문제 풀기</button>
      <button class="action-btn secondary" onclick="startQuiz('wrong')">오답만 풀기</button>
      <button class="action-btn secondary" onclick="startQuiz('unattempted')">미풀이만 풀기</button>
    </div>
    <h2>회차별 학습</h2>
    <div class="sets">
      ${sets.map(set => {
        const count = questions.filter(q => q.set === set).length;
        const solved = questions.filter(q => q.set === set && progress[q.id]).length;
        return `<button class="set-btn" onclick='startSet(${JSON.stringify(set)})'><strong>${set}</strong><span>${solved} / ${count} 풀이</span></button>`;
      }).join("")}
    </div>
  `;
}

function startQuiz(mode) {
  if (mode === "wrong") queue = questions.filter(q => progress[q.id]?.everWrong);
  else if (mode === "unattempted") queue = questions.filter(q => !progress[q.id]);
  else queue = [...questions];

  if (!queue.length) {
    alert(mode === "wrong" ? "현재 오답 문제가 없습니다." : "해당 조건의 문제가 없습니다.");
    return;
  }
  currentIndex = 0;
  showQuiz();
}

function startSet(set) {
  queue = questions.filter(q => q.set === set);
  currentIndex = 0;
  showQuiz();
}

function showQuiz() {
  dashboard.classList.add("hidden");
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
    <div class="question">${q.number}번. ${q.question}</div>
    <div class="choices">
      ${q.choices.map((choice, i) => `<button class="choice" data-choice="${i + 1}" onclick="selectChoice(${i + 1})">${i + 1}. ${choice}</button>`).join("")}
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
  dashboard.classList.remove("hidden");
  renderDashboard();
}

renderDashboard();
