/* =========================================================
   英単語4択クイズ - app.js
   構成:
     1. 状態 (state)
     2. データ読み込み
     3. ユーティリティ (shuffle / 選択肢生成 / 音声)
     4. 画面遷移・レンダリング
     5. イベントハンドラ
   今後の拡張ポイントは各セクションにコメントで記載しています。
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

    wordDisplay: document.getElementById("word-display"),
    speakBtn: document.getElementById("speak-btn"),
    speechNote: document.getElementById("speech-note"),
    choicesLabel: document.querySelector(".choices-label"),
    choices: document.getElementById("choices"),
    feedback: document.getElementById("feedback"),
    nextBtn: document.getElementById("next-btn"),

    scoreFraction: document.getElementById("score-fraction"),
    scoreRate: document.getElementById("score-rate"),
    wrongSection: document.getElementById("wrong-section"),
    wrongList: document.getElementById("wrong-list"),
    reviewBtn: document.getElementById("review-btn"),
    retryBtn: document.getElementById("retry-btn"),
  };

  /* ---------- 1. 状態 ---------- */
  const state = {
    allWords: [],          // words.json の全データ
    selectedCount: 20,      // スタート画面で選択中の出題数 (数値 or "all")
    sessionWords: [],       // 今回の出題リスト
    currentIndex: 0,
    correctCount: 0,
    wrongWords: [],         // 今回間違えた単語 {english, japanese}
    currentChoices: [],     // 現在の問題の選択肢
    answered: false,
    lastResultWrongWords: [], // 直近の結果画面用（復習ボタンの元データ）
  };

  const SPEECH_SUPPORTED = "speechSynthesis" in window;

  /* ---------- 2. データ読み込み ---------- */
  async function loadWords() {
    try {
      const res = await fetch("words.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      if (!Array.isArray(data)) throw new Error("words.json の形式が不正です");

      // 最低限の形式チェック（english / japanese が文字列であるものだけ採用）
      const valid = data.filter(
        (w) => w && typeof w.english === "string" && typeof w.japanese === "string" &&
               w.english.trim() !== "" && w.japanese.trim() !== ""
      );

      state.allWords = valid;

      if (valid.length < 2) {
        showDataError("問題データが不足しています（2語以上必要です）。words.json を確認してください。");
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
        "ローカルサーバー経由（例: python -m http.server）で開き直してください。"
      );
    }
  }

  function showDataError(message) {
    el.dataStatus.textContent = message;
    el.startHint.textContent = "";
    el.startBtn.disabled = true;
  }

  /* ---------- 3. ユーティリティ ---------- */

  // Fisher-Yates shuffle（元配列は破壊しない）
  function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 指定した単語に対する4択（最大4、データが少なければそれ以下）を生成
  // 優先順位: ① 同じ category の単語から誤答を集める → ② 足りない分だけ他の単語から補う
  // これにより「Germany（国名）の誤答は他の国名から」のような自然な選択肢になる。
  // category が無い単語や、同カテゴリーの候補が足りない場合でもエラーにならないようフォールバックする。
  function buildChoices(word) {
    const correctJapanese = word.japanese;
    const usedJapanese = new Set([correctJapanese]);
    const wrongJapanese = [];

    // ① 同じカテゴリーから候補を集める
    if (word.category) {
      const sameCategoryPool = state.allWords.filter(
        (w) => w.category === word.category && !usedJapanese.has(w.japanese)
      );
      const uniqueSameCategory = Array.from(new Set(sameCategoryPool.map((w) => w.japanese)));
      const shuffledSame = shuffle(uniqueSameCategory);
      for (const japanese of shuffledSame) {
        if (wrongJapanese.length >= 3) break;
        wrongJapanese.push(japanese);
        usedJapanese.add(japanese);
      }
    }

    // ② まだ3つに満たない場合は、カテゴリーを問わず他の単語から補完する
    if (wrongJapanese.length < 3) {
      const restPool = state.allWords.filter((w) => !usedJapanese.has(w.japanese));
      const uniqueRest = Array.from(new Set(restPool.map((w) => w.japanese)));
      const shuffledRest = shuffle(uniqueRest);
      for (const japanese of shuffledRest) {
        if (wrongJapanese.length >= 3) break;
        wrongJapanese.push(japanese);
        usedJapanese.add(japanese);
      }
    }

    const choices = shuffle([correctJapanese, ...wrongJapanese]).map((japanese) => ({
      japanese,
      isCorrect: japanese === correctJapanese,
    }));

    return choices; // 長さは 2〜4（データが極端に少ない場合は2になることもある）
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

  /* ---------- 4. 画面遷移・レンダリング ---------- */

  function showScreen(name) {
    el.screenStart.classList.toggle("hidden", name !== "start");
    el.screenQuiz.classList.toggle("hidden", name !== "quiz");
    el.screenResult.classList.toggle("hidden", name !== "result");
  }

  function renderCountOptions() {
    const buttons = el.countOptions.querySelectorAll(".count-btn");
    buttons.forEach((btn) => {
      const isSelected = btn.dataset.count === String(state.selectedCount);
      btn.classList.toggle("is-selected", isSelected);
    });
  }

  function renderQuestion() {
    state.answered = false;
    const word = state.sessionWords[state.currentIndex];

    // 進捗表示
    const total = state.sessionWords.length;
    const current = state.currentIndex + 1;
    el.progressText.textContent = `第 ${current} 問 / ${total} 問`;
    el.scoreText.textContent = `正解 ${state.correctCount}`;
    el.progressFill.style.width = `${((current - 1) / total) * 100}%`;

    // 単語表示
    el.wordDisplay.textContent = word.english;

    // 音声非対応の場合は注記を出し、手動ボタンも無効化
    el.speechNote.classList.toggle("hidden", SPEECH_SUPPORTED);
    el.speakBtn.disabled = !SPEECH_SUPPORTED;

    // 選択肢生成・描画
    state.currentChoices = buildChoices(word);
    el.choices.innerHTML = "";
    const letters = ["A", "B", "C", "D"];

    state.currentChoices.forEach((choice, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.dataset.japanese = choice.japanese;
      btn.innerHTML = `
        <span class="choice-badge">${letters[idx]}</span>
        <span class="choice-text"></span>
      `;
      btn.querySelector(".choice-text").textContent = choice.japanese;
      btn.addEventListener("click", () => handleChoiceClick(choice, btn));
      el.choices.appendChild(btn);
    });

    // フィードバック・次へボタンをリセット
    el.feedback.className = "feedback hidden";
    el.feedback.innerHTML = "";
    el.nextBtn.classList.add("hidden");

    // 自動読み上げ（ブラウザ制限で失敗しても手動ボタンで対応可能）
    speak(word.english);
  }

  function handleChoiceClick(choice, buttonEl) {
    if (state.answered) return;
    state.answered = true;

    const word = state.sessionWords[state.currentIndex];
    const allButtons = el.choices.querySelectorAll(".choice-btn");

    allButtons.forEach((btn) => {
      btn.disabled = true;
      if (btn.dataset.japanese === word.japanese) {
        btn.classList.add("is-correct");
      } else if (btn !== buttonEl) {
        btn.classList.add("is-dimmed");
      }
    });

    if (choice.isCorrect) {
      state.correctCount++;
      el.feedback.className = "feedback is-correct";
      el.feedback.textContent = "正解！";
    } else {
      buttonEl.classList.remove("is-dimmed");
      buttonEl.classList.add("is-wrong");
      el.feedback.className = "feedback is-wrong";
      el.feedback.innerHTML = `不正解<span class="feedback-sub">正解：${word.japanese}</span>`;
      state.wrongWords.push(word);
    }

    el.scoreText.textContent = `正解 ${state.correctCount}`;
    const total = state.sessionWords.length;
    el.progressFill.style.width = `${((state.currentIndex + 1) / total) * 100}%`;

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
        li.innerHTML = `<span class="w-en"></span><span class="w-ja"></span>`;
        li.querySelector(".w-en").textContent = w.english;
        li.querySelector(".w-ja").textContent = `→ ${w.japanese}`;
        el.wrongList.appendChild(li);
      });
    } else {
      el.wrongSection.classList.add("hidden");
      el.reviewBtn.classList.add("hidden");
      el.wrongList.innerHTML = "";
    }

    showScreen("result");
  }

  /* ---------- 5. イベントハンドラ ---------- */

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

    state.sessionWords = shuffle(reviewSource);
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
    // ユーザー操作（クリック）の直後に実行するため、以降の自動音声再生が
    // ブラウザの自動再生制限にかかりにくくなる
    startQuiz(state.selectedCount);
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

  // キーボード操作（PC向け補助機能）: 1〜4キーで選択肢を選べるようにする
  document.addEventListener("keydown", (e) => {
    if (el.screenQuiz.classList.contains("hidden")) return;
    if (state.answered) return;
    const idx = ["1", "2", "3", "4"].indexOf(e.key);
    if (idx === -1) return;
    const buttons = el.choices.querySelectorAll(".choice-btn");
    const btn = buttons[idx];
    if (btn) btn.click();
  });

  /* ---------- 初期化 ---------- */
  renderCountOptions();
  loadWords();

  /* =========================================================
     今後の機能拡張メモ（実装時の入り口）
     - 苦手な単語を優先出題    : state.allWords に各単語の間違えた回数を持たせ、
                                   pickSessionWords の重み付けサンプリングに利用
     - 正解率の保存 / 学習履歴 : localStorage に {date, total, correct} を保存する
                                   関数を追加し、結果画面表示時に呼び出す
     - 日本語→英語モード      : buildChoices / renderQuestion の表示方向を
                                   フラグで切り替えられるよう分離する
     - 入力式への切り替え     : renderQuestion 内の選択肢描画部分を
                                   テキスト入力＋判定関数に差し替える
     - 発音速度・声の変更     : speak() に rate / voice 引数を追加し、
                                   設定画面から state に保存した値を渡す
     ========================================================= */
})();
