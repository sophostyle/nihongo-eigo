
/* =========================================================
   日本語→英語 スペルクイズ - app.js
   4択クイズ版と同じ words.json を単語データとして使用します。
   ========================================================= */
(() => {
  "use strict";

  /* ---------- DOM参照 ---------- */
  const el = {
    screenStart: document.getElementById("screen-start"),
    screenQuiz: document.getElementById("screen-quiz"),
    screenResult: document.getElementById("screen-result"),

    dataStatus: document.getElementById("data-status"),
    countOptions: document.getElementById("count-options"),
    startBtn: document.getElementById("start-btn"),
    startHint: document.getElementById("start-hint"),

    progressText: document.getElementById("progress-text"),
    scoreText: document.getElementById("score-text"),
    progressFill: document.getElementById("progress-fill"),

    promptDisplay: document.getElementById("prompt-display"),
    answerForm: document.getElementById("answer-form"),
    answerInput: document.getElementById("answer-input"),
    submitBtn: document.getElementById("submit-btn"),

    feedback: document.getElementById("feedback"),
    replayRow: document.getElementById("replay-row"),
    speakBtn: document.getElementById("speak-btn"),
    speechNote: document.getElementById("speech-note"),
    nextBtn: document.getElementById("next-btn"),

    scoreFraction: document.getElementById("score-fraction"),
    scoreRate: document.getElementById("score-rate"),
    wrongSection: document.getElementById("wrong-section"),
    wrongList: document.getElementById("wrong-list"),
    reviewBtn: document.getElementById("review-btn"),
    retryBtn: document.getElementById("retry-btn"),
  };

  /* ---------- 状態 ---------- */
  const state = {
    allWords: [],
    selectedCount: 20,
    sessionWords: [],
    currentIndex: 0,
    correctCount: 0,
    wrongWords: [],      // {english, japanese, userAnswer}
    answered: false,
    lastResultWrongWords: [],
  };

  const SPEECH_SUPPORTED = "speechSynthesis" in window;

  /* ---------- データ読み込み ---------- */
  async function loadWords() {
    try {
      const res = await fetch("words.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      if (!Array.isArray(data)) throw new Error("words.json の形式が不正です");

      const valid = data.filter(
        (w) => w && typeof w.english === "string" && typeof w.japanese === "string" &&
               w.english.trim() !== "" && w.japanese.trim() !== ""
      );

      state.allWords = valid;

      if (valid.length < 1) {
        showDataError("問題データがありません。words.json を確認してください。");
        return;
      }

      if (valid.length !== data.length) {
        el.dataStatus.textContent = `注意: words.json 内に読み込めない項目が ${data.length - valid.length} 件ありました。`;
      }

      el.startHint.textContent = `全 ${valid.length} 語を読み込みました。`;
      el.startBtn.disabled = false;
    } catch (err) {
      console.error(err);
      showDataError(
        "words.json を読み込めませんでした。ブラウザで直接 index.html を開いている場合、" +
        "ローカルサーバーやホスティング経由（Vercel等）で開き直してください。"
      );
    }
  }

  function showDataError(message) {
    el.dataStatus.textContent = message;
    el.startHint.textContent = "";
    el.startBtn.disabled = true;
  }

  /* ---------- ユーティリティ ---------- */
  function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 大文字小文字・前後や連続する空白の違いは正解として扱う
  function normalizeAnswer(str) {
    return str.trim().toLowerCase().replace(/\s+/g, " ");
  }

  function speak(text) {
    if (!SPEECH_SUPPORTED) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("音声再生に失敗しました:", err);
    }
  }

  function pickSessionWords(count) {
    const pool = shuffle(state.allWords);
    if (count === "all") return pool;
    return pool.slice(0, Math.min(count, pool.length));
  }

  /* ---------- 画面遷移・レンダリング ---------- */
  function showScreen(name) {
    el.screenStart.classList.toggle("hidden", name !== "start");
    el.screenQuiz.classList.toggle("hidden", name !== "quiz");
    el.screenResult.classList.toggle("hidden", name !== "result");
  }

  function renderCountOptions() {
    const buttons = el.countOptions.querySelectorAll(".count-btn");
    buttons.forEach((btn) => {
      btn.classList.toggle("is-selected", btn.dataset.count === String(state.selectedCount));
    });
  }

  function renderQuestion() {
    state.answered = false;
    const word = state.sessionWords[state.currentIndex];

    const total = state.sessionWords.length;
    const current = state.currentIndex + 1;
    el.progressText.textContent = `第 ${current} 問 / ${total} 問`;
    el.scoreText.textContent = `正解 ${state.correctCount}`;
    el.progressFill.style.width = `${((current - 1) / total) * 100}%`;

    el.promptDisplay.textContent = word.japanese;

    el.speechNote.classList.toggle("hidden", SPEECH_SUPPORTED);

    // 入力欄をリセットして有効化・フォーカス
    el.answerInput.value = "";
    el.answerInput.disabled = false;
    el.answerInput.classList.remove("is-correct", "is-wrong");
    el.submitBtn.disabled = false;
    el.submitBtn.classList.remove("hidden");

    el.feedback.className = "feedback hidden";
    el.feedback.innerHTML = "";
    el.replayRow.classList.add("hidden");
    el.nextBtn.classList.add("hidden");

    // モバイルでキーボードが自動で開くようフォーカス
    window.setTimeout(() => el.answerInput.focus(), 50);
  }

  function handleSubmit() {
    if (state.answered) return;
    const word = state.sessionWords[state.currentIndex];
    const userAnswerRaw = el.answerInput.value;

    if (userAnswerRaw.trim() === "") {
      el.answerInput.focus();
      return;
    }

    state.answered = true;
    el.answerInput.disabled = true;
    el.submitBtn.disabled = true;

    const isCorrect = normalizeAnswer(userAnswerRaw) === normalizeAnswer(word.english);

    if (isCorrect) {
      state.correctCount++;
      el.answerInput.classList.add("is-correct");
      el.feedback.className = "feedback is-correct";
      el.feedback.textContent = "正解！";
    } else {
      el.answerInput.classList.add("is-wrong");
      el.feedback.className = "feedback is-wrong";
      el.feedback.innerHTML = `不正解<span class="feedback-sub">正解：${word.english}</span>`;
      state.wrongWords.push({
        english: word.english,
        japanese: word.japanese,
        userAnswer: userAnswerRaw.trim(),
      });
    }

    el.scoreText.textContent = `正解 ${state.correctCount}`;
    const total = state.sessionWords.length;
    el.progressFill.style.width = `${((state.currentIndex + 1) / total) * 100}%`;

    if (SPEECH_SUPPORTED) {
      el.replayRow.classList.remove("hidden");
    }
    speak(word.english);

    const isLast = state.currentIndex === state.sessionWords.length - 1;
    el.nextBtn.textContent = isLast ? "結果を見る" : "次の問題";
    el.nextBtn.classList.remove("hidden");
  }

  function goToNextQuestion() {
    state.currentIndex++;
    if (state.currentIndex >= state.sessionWords.length) {
      showResult();
    } else {
      renderQuestion();
    }
  }

  function showResult() {
    if (SPEECH_SUPPORTED) window.speechSynthesis.cancel();

    const total = state.sessionWords.length;
    const percent = total > 0 ? Math.round((state.correctCount / total) * 100) : 0;

    el.scoreFraction.textContent = `${state.correctCount} / ${total} 正解`;
    el.scoreRate.textContent = `${percent}%`;

    state.lastResultWrongWords = state.wrongWords.slice();

    if (state.lastResultWrongWords.length > 0) {
      el.wrongSection.classList.remove("hidden");
      el.reviewBtn.classList.remove("hidden");
      el.wrongList.innerHTML = "";
      state.lastResultWrongWords.forEach((w) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div class="w-ja"></div>
          <div class="w-row">
            <span class="w-correct"></span>
            <span class="w-yours"></span>
          </div>
        `;
        li.querySelector(".w-ja").textContent = w.japanese;
        li.querySelector(".w-correct").textContent = `正解: ${w.english}`;
        li.querySelector(".w-yours").textContent = `あなたの解答: ${w.userAnswer || "(未入力)"}`;
        el.wrongList.appendChild(li);
      });
    } else {
      el.wrongSection.classList.add("hidden");
      el.reviewBtn.classList.add("hidden");
      el.wrongList.innerHTML = "";
    }

    showScreen("result");
  }

  /* ---------- イベントハンドラ ---------- */
  function startQuiz(count) {
    state.sessionWords = pickSessionWords(count);
    state.currentIndex = 0;
    state.correctCount = 0;
    state.wrongWords = [];

    if (state.sessionWords.length === 0) {
      showDataError("出題できる単語がありません。");
      showScreen("start");
      return;
    }

    showScreen("quiz");
    renderQuestion();
  }

  function startReview() {
    const reviewSource = state.lastResultWrongWords;
    if (reviewSource.length === 0) return;

    // 復習セッションでは japanese/english をそのまま単語として再利用
    state.sessionWords = shuffle(reviewSource.map((w) => ({ english: w.english, japanese: w.japanese })));
    state.currentIndex = 0;
    state.correctCount = 0;
    state.wrongWords = [];

    showScreen("quiz");
    renderQuestion();
  }

  el.countOptions.addEventListener("click", (e) => {
    const btn = e.target.closest(".count-btn");
    if (!btn) return;
    const raw = btn.dataset.count;
    state.selectedCount = raw === "all" ? "all" : Number(raw);
    renderCountOptions();
  });

  el.startBtn.addEventListener("click", () => {
    startQuiz(state.selectedCount);
  });

  el.answerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSubmit();
  });

  el.speakBtn.addEventListener("click", () => {
    const word = state.sessionWords[state.currentIndex];
    if (word) speak(word.english);
  });

  el.nextBtn.addEventListener("click", goToNextQuestion);

  el.retryBtn.addEventListener("click", () => {
    startQuiz(state.selectedCount);
  });

  el.reviewBtn.addEventListener("click", startReview);

  // 回答後、Enterキーで次の問題へ進めるようにする
  document.addEventListener("keydown", (e) => {
    if (el.screenQuiz.classList.contains("hidden")) return;
    if (!state.answered) return;
    if (e.key === "Enter" && !el.nextBtn.classList.contains("hidden")) {
      el.nextBtn.click();
    }
  });

  /* ---------- 初期化 ---------- */
  renderCountOptions();
  loadWords();
})();
