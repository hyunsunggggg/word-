(() => {
  "use strict";

  const STORAGE_KEY = "wordseed_v1";
  const pageMeta = {
    dashboard: ["VOCABULARY", "대시보드"],
    upload: ["IMPORT", "CSV 업로드"],
    words: ["MY WORDS", "단어 목록"],
    flashcards: ["STUDY", "플래시카드"],
    quiz: ["PRACTICE", "퀴즈"],
    stats: ["INSIGHTS", "학습 통계"]
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const shuffle = array => {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[ch]);
  const formatDate = iso => new Intl.DateTimeFormat("ko-KR", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(iso));

  const defaultWords = [
    { word: "improve", part: "v.", meaning: "향상하다" },
    { word: "keep", part: "phr.", meaning: "a journal 일지를 쓰다, 기록을 남기다" },
    { word: "matter", part: "v.", meaning: "중요하다" },
    { word: "reflect", part: "phr.", meaning: "on ~을 되돌아보다" }
  ];

  const makeWord = ({ word, part = "", meaning }) => ({
    id: uid(),
    word: String(word).trim(),
    part: String(part).trim(),
    meaning: String(meaning).trim(),
    reviews: 0,
    correct: 0,
    wrong: 0,
    mastery: 0,
    lastReviewed: null
  });

  const initialState = () => {
    const deckId = uid();
    return {
      currentDeckId: deckId,
      decks: [{
        id: deckId,
        name: "기본 단어장",
        createdAt: new Date().toISOString(),
        words: defaultWords.map(makeWord),
        sessions: 0,
        quizHistory: []
      }],
      recentActivity: null
    };
  };

  let state = loadState();
  let currentView = "dashboard";
  let parsedUpload = [];
  let uploadFileName = "";
  let cardSession = { words: [], index: 0 };
  let quizSession = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.decks?.length) return saved;
    } catch (error) {
      console.warn("저장 데이터를 읽지 못했습니다.", error);
    }
    return initialState();
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function currentDeck() {
    let deck = state.decks.find(d => d.id === state.currentDeckId);
    if (!deck) {
      deck = state.decks[0];
      state.currentDeckId = deck?.id || null;
    }
    return deck;
  }

  function wordStatus(word) {
    if (word.mastery >= 3) return "mastered";
    if (word.reviews > 0) return "learning";
    return "new";
  }

  function wordAccuracy(word) {
    const total = word.correct + word.wrong;
    return total ? Math.round(word.correct / total * 100) : 0;
  }

  function deckStats(deck = currentDeck()) {
    if (!deck) return { total: 0, mastered: 0, learning: 0, fresh: 0, reviews: 0, accuracy: 0, best: 0 };
    const total = deck.words.length;
    const mastered = deck.words.filter(w => wordStatus(w) === "mastered").length;
    const learning = deck.words.filter(w => wordStatus(w) === "learning").length;
    const fresh = total - mastered - learning;
    const correct = deck.words.reduce((sum, w) => sum + w.correct, 0);
    const wrong = deck.words.reduce((sum, w) => sum + w.wrong, 0);
    const reviews = deck.words.reduce((sum, w) => sum + w.reviews, 0);
    const accuracy = correct + wrong ? Math.round(correct / (correct + wrong) * 100) : 0;
    const best = Math.max(0, ...deck.quizHistory.map(h => h.percent));
    return { total, mastered, learning, fresh, reviews, accuracy, best };
  }

  function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 2400);
  }

  function showView(view) {
    currentView = view;
    $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${view}`));
    $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
    $("#pageEyebrow").textContent = pageMeta[view][0];
    $("#pageTitle").textContent = pageMeta[view][1];
    $("#sidebar").classList.remove("open");

    if (view === "dashboard") renderDashboard();
    if (view === "words") renderWords();
    if (view === "flashcards") startCardSession();
    if (view === "stats") renderStats();
    if (view === "quiz") resetQuizView();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderDeckSelectors() {
    const deck = currentDeck();
    const options = state.decks.map(d =>
      `<option value="${d.id}" ${d.id === state.currentDeckId ? "selected" : ""}>${escapeHTML(d.name)} (${d.words.length})</option>`
    ).join("");
    $("#deckSelect").innerHTML = options;

    $("#uploadDeckSelect").innerHTML = [
      ...state.decks.map(d => `<option value="${d.id}" ${d.id === deck?.id ? "selected" : ""}>${escapeHTML(d.name)}</option>`),
      `<option value="__new__">＋ 새 단어장 만들기</option>`
    ].join("");
  }

  function renderAll() {
    renderDeckSelectors();
    renderDashboard();
    if (currentView === "words") renderWords();
    if (currentView === "stats") renderStats();
  }

  function renderDashboard() {
    const deck = currentDeck();
    const stats = deckStats(deck);
    $("#heroDeckName").textContent = deck?.name || "나의 단어장";
    const sample = deck?.words[Math.floor(Math.random() * Math.max(1, deck.words.length))];
    $("#heroWord").textContent = sample?.word || "improve";
    $("#heroMeaning").textContent = sample?.meaning || "향상하다";
    $("#metricTotal").textContent = stats.total;
    $("#metricMastered").textContent = stats.mastered;
    $("#metricAccuracy").textContent = `${stats.accuracy}%`;
    $("#metricSessions").textContent = deck?.sessions || 0;

    const progress = stats.total ? Math.round(stats.mastered / stats.total * 100) : 0;
    $("#progressPercent").textContent = `${progress}%`;
    $("#progressBar").style.width = `${progress}%`;
    $("#progressText").textContent = stats.total
      ? `${stats.total}개 중 ${stats.mastered}개를 암기했습니다.`
      : "단어를 업로드하고 학습을 시작하세요.";

    const activity = state.recentActivity;
    $("#recentActivity").innerHTML = activity
      ? `<div class="activity"><div class="activity-icon">✓</div><div><strong>${escapeHTML(activity.title)}</strong><span>${escapeHTML(activity.detail)} · ${formatDate(activity.at)}</span></div></div>`
      : "아직 학습 기록이 없습니다.";
  }

  // CSV parsing
  function detectDelimiter(text) {
    const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] || "";
    const candidates = [",", "\t", ";"];
    return candidates.sort((a, b) =>
      (firstLine.split(b).length - firstLine.split(a).length)
    )[0];
  }

  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, "");
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [], field = "", quoted = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (quoted) {
        if (char === '"' && next === '"') {
          field += '"';
          i++;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === delimiter) {
        row.push(field.trim());
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && next === "\n") i++;
        row.push(field.trim());
        if (row.some(cell => cell !== "")) rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
    row.push(field.trim());
    if (row.some(cell => cell !== "")) rows.push(row);
    return rows;
  }

  function normalizeHeader(value) {
    return String(value || "").toLowerCase().replace(/\s/g, "");
  }

  function mapCSVRows(rows) {
    if (!rows.length) return [];
    const aliases = {
      word: ["어휘", "단어", "영어", "word", "vocabulary"],
      part: ["품사", "part", "partofspeech", "pos"],
      meaning: ["뜻", "의미", "해석", "meaning", "definition"]
    };
    const headers = rows[0].map(normalizeHeader);
    const indexes = {};
    Object.entries(aliases).forEach(([key, list]) => {
      indexes[key] = headers.findIndex(h => list.includes(h));
    });

    if (indexes.word < 0 || indexes.meaning < 0) {
      throw new Error("'어휘'와 '뜻' 열을 찾을 수 없습니다. 첫 줄의 열 이름을 확인해 주세요.");
    }

    return rows.slice(1).map((cells, index) => {
      const word = (cells[indexes.word] || "").trim();
      const part = indexes.part >= 0 ? (cells[indexes.part] || "").trim() : "";
      const meaning = (cells[indexes.meaning] || "").trim();
      const errors = [];
      if (!word) errors.push("어휘 없음");
      if (!meaning) errors.push("뜻 없음");
      return { rowNumber: index + 2, word, part, meaning, errors, valid: errors.length === 0 };
    });
  }

  function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast("CSV 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("파일 크기는 5MB 이하여야 합니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        parsedUpload = mapCSVRows(parseCSV(reader.result));
        uploadFileName = file.name;
        renderUploadPreview();
      } catch (error) {
        toast(error.message);
      }
    };
    reader.onerror = () => toast("파일을 읽는 중 오류가 발생했습니다.");
    reader.readAsText(file, "UTF-8");
  }

  function setUploadStep(step) {
    $$("[data-step-indicator]").forEach((el, index) => {
      el.classList.toggle("active", index + 1 === step);
      el.classList.toggle("done", index + 1 < step);
    });
  }

  function renderUploadPreview() {
    $("#uploadStage").hidden = true;
    $("#previewStage").hidden = false;
    $("#completeStage").hidden = true;
    setUploadStep(2);
    $("#previewFileName").textContent = uploadFileName;
    const validCount = parsedUpload.filter(r => r.valid).length;
    const invalidCount = parsedUpload.length - validCount;
    $("#previewSummary").textContent = `총 ${parsedUpload.length}행 · 유효 ${validCount}행 · 오류 ${invalidCount}행`;
    $("#validationMessages").innerHTML = invalidCount
      ? `<div class="validation error">${invalidCount}개 행에 필수 값이 없습니다. 오류 행은 저장되지 않습니다.</div>`
      : `<div class="validation ok">모든 행이 올바르게 인식되었습니다.</div>`;

    $("#previewTableBody").innerHTML = parsedUpload.slice(0, 100).map(row => `
      <tr>
        <td>${row.rowNumber}</td>
        <td><strong>${escapeHTML(row.word || "-")}</strong></td>
        <td>${escapeHTML(row.part || "-")}</td>
        <td>${escapeHTML(row.meaning || "-")}</td>
        <td><span class="status ${row.valid ? "valid" : "invalid"}">${row.valid ? "정상" : escapeHTML(row.errors.join(", "))}</span></td>
      </tr>
    `).join("");
    renderDeckSelectors();
  }

  function resetUpload() {
    parsedUpload = [];
    uploadFileName = "";
    $("#fileInput").value = "";
    $("#uploadStage").hidden = false;
    $("#previewStage").hidden = true;
    $("#completeStage").hidden = true;
    $("#newDeckNameWrap").hidden = true;
    setUploadStep(1);
  }

  function saveUploadedWords() {
    const validRows = parsedUpload.filter(row => row.valid);
    if (!validRows.length) return toast("저장할 수 있는 단어가 없습니다.");

    let deckId = $("#uploadDeckSelect").value;
    if (deckId === "__new__") {
      const name = $("#newDeckNameInput").value.trim();
      if (!name) return toast("새 단어장 이름을 입력해 주세요.");
      deckId = uid();
      state.decks.push({ id: deckId, name, createdAt: new Date().toISOString(), words: [], sessions: 0, quizHistory: [] });
    }

    const deck = state.decks.find(d => d.id === deckId);
    const existing = new Set(deck.words.map(w => `${w.word.toLowerCase()}|${w.meaning}`));
    let added = 0, duplicates = 0;
    validRows.forEach(row => {
      const key = `${row.word.toLowerCase()}|${row.meaning}`;
      if (existing.has(key)) {
        duplicates++;
      } else {
        deck.words.push(makeWord(row));
        existing.add(key);
        added++;
      }
    });

    state.currentDeckId = deckId;
    state.recentActivity = {
      title: "CSV 단어 업로드",
      detail: `${deck.name}에 ${added}개 단어 추가`,
      at: new Date().toISOString()
    };
    saveState();
    renderAll();
    $("#previewStage").hidden = true;
    $("#completeStage").hidden = false;
    $("#completeMessage").textContent = `${added}개 단어를 저장했습니다.${duplicates ? ` 중복 ${duplicates}개는 제외했습니다.` : ""}`;
    setUploadStep(3);
  }

  // Word list
  function renderWords() {
    const deck = currentDeck();
    const query = $("#wordSearch").value.trim().toLowerCase();
    const filter = $("#masteryFilter").value;
    let words = deck?.words || [];
    words = words.filter(w =>
      (!query || w.word.toLowerCase().includes(query) || w.meaning.toLowerCase().includes(query)) &&
      (filter === "all" || wordStatus(w) === filter)
    );

    $("#wordTableBody").innerHTML = words.length ? words.map(word => {
      const status = wordStatus(word);
      const statusText = { new: "미학습", learning: "학습 중", mastered: "암기 완료" }[status];
      return `<tr>
        <td><strong>${escapeHTML(word.word)}</strong></td>
        <td>${escapeHTML(word.part || "-")}</td>
        <td>${escapeHTML(word.meaning)}</td>
        <td><span class="status ${status}">${statusText}</span></td>
        <td>${wordAccuracy(word)}%</td>
        <td>
          <button class="action-btn" data-edit-word="${word.id}">수정</button>
          <button class="action-btn delete" data-delete-word="${word.id}">삭제</button>
        </td>
      </tr>`;
    }).join("") : `<tr><td class="empty-row" colspan="6">조건에 맞는 단어가 없습니다.</td></tr>`;
    $("#wordCountInfo").textContent = `표시 ${words.length}개 · 전체 ${deck?.words.length || 0}개`;
  }

  function openWordModal(wordId = null) {
    const word = currentDeck()?.words.find(w => w.id === wordId);
    $("#wordModalTitle").textContent = word ? "단어 수정" : "단어 추가";
    $("#editWordId").value = word?.id || "";
    $("#wordInput").value = word?.word || "";
    $("#partInput").value = word?.part || "";
    $("#meaningInput").value = word?.meaning || "";
    $("#wordModal").showModal();
    setTimeout(() => $("#wordInput").focus(), 50);
  }

  function submitWord(event) {
    event.preventDefault();
    const deck = currentDeck();
    if (!deck) return;
    const id = $("#editWordId").value;
    const values = {
      word: $("#wordInput").value.trim(),
      part: $("#partInput").value.trim(),
      meaning: $("#meaningInput").value.trim()
    };
    if (!values.word || !values.meaning) return;

    if (id) {
      const word = deck.words.find(w => w.id === id);
      Object.assign(word, values);
      toast("단어를 수정했습니다.");
    } else {
      deck.words.push(makeWord(values));
      toast("단어를 추가했습니다.");
    }
    saveState();
    $("#wordModal").close();
    renderAll();
    renderWords();
  }

  function deleteWord(id) {
    const deck = currentDeck();
    const word = deck?.words.find(w => w.id === id);
    if (!word || !confirm(`'${word.word}' 단어를 삭제할까요?`)) return;
    deck.words = deck.words.filter(w => w.id !== id);
    saveState();
    renderAll();
    renderWords();
    toast("단어를 삭제했습니다.");
  }

  // Flashcards
  function getCardWords() {
    const deck = currentDeck();
    const scope = $("#cardScope").value;
    let words = [...(deck?.words || [])];
    if (scope === "learning") words = words.filter(w => wordStatus(w) !== "mastered");
    if (scope === "wrong") words = words.filter(w => w.wrong > 0).sort((a, b) => b.wrong - a.wrong);
    if ($("#shuffleCards").checked) words = shuffle(words);
    return words;
  }

  function startCardSession() {
    cardSession = { words: getCardWords(), index: 0 };
    $("#flashcard").classList.remove("flipped");
    renderCard();
  }

  function renderCard() {
    const hasWords = cardSession.words.length > 0;
    $("#flashcardEmpty").hidden = hasWords;
    $("#flashcardArea").hidden = !hasWords;
    if (!hasWords) return;

    if (cardSession.index >= cardSession.words.length) cardSession.index = 0;
    const word = cardSession.words[cardSession.index];
    $("#cardWord").textContent = word.word;
    $("#cardPart").textContent = word.part || "—";
    $("#cardMeaning").textContent = word.meaning;
    $("#cardCounter").textContent = `${cardSession.index + 1} / ${cardSession.words.length}`;
    $("#cardProgress").style.width = `${(cardSession.index + 1) / cardSession.words.length * 100}%`;
    $("#flashcard").classList.remove("flipped");
  }

  function rateCard(rating) {
    const word = cardSession.words[cardSession.index];
    if (!word) return;
    word.reviews++;
    word.lastReviewed = new Date().toISOString();
    if (rating === "again") {
      word.wrong++;
      word.mastery = Math.max(0, word.mastery - 1);
    } else if (rating === "hard") {
      word.correct++;
      word.mastery = Math.min(3, word.mastery + .5);
    } else {
      word.correct++;
      word.mastery = Math.min(3, word.mastery + 1);
    }

    const deck = currentDeck();
    deck.sessions++;
    state.recentActivity = {
      title: "플래시카드 학습",
      detail: `${word.word} 복습`,
      at: new Date().toISOString()
    };
    saveState();

    cardSession.index++;
    if (cardSession.index >= cardSession.words.length) {
      toast("카드 한 바퀴를 완료했습니다! 🎉");
      cardSession.index = 0;
    }
    renderCard();
  }

  function speakCurrentWord(event) {
    event.stopPropagation();
    const word = cardSession.words[cardSession.index]?.word;
    if (!word || !("speechSynthesis" in window)) return toast("이 브라우저에서는 음성 기능을 지원하지 않습니다.");
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = .85;
    speechSynthesis.speak(utterance);
  }

  // Quiz
  function resetQuizView() {
    $("#quizSetup").hidden = false;
    $("#quizPlay").hidden = true;
    $("#quizResult").hidden = true;
  }

  function startQuiz() {
    const words = currentDeck()?.words || [];
    if (words.length < 2) return toast("퀴즈를 시작하려면 단어가 2개 이상 필요합니다.");
    const countValue = $("#quizCount").value;
    const count = countValue === "all" ? words.length : Math.min(Number(countValue), words.length);
    quizSession = {
      questions: shuffle(words).slice(0, count),
      index: 0,
      correct: 0,
      answered: false,
      type: $("#quizType").value
    };
    $("#quizSetup").hidden = true;
    $("#quizPlay").hidden = false;
    $("#quizResult").hidden = true;
    renderQuestion();
  }

  function questionDirection() {
    if (quizSession.type === "mixed") return Math.random() < .5 ? "word-to-meaning" : "meaning-to-word";
    return quizSession.type;
  }

  function renderQuestion() {
    const question = quizSession.questions[quizSession.index];
    quizSession.direction = questionDirection();
    quizSession.answered = false;
    $("#quizCounter").textContent = `${quizSession.index + 1} / ${quizSession.questions.length}`;
    $("#quizProgress").style.width = `${quizSession.index / quizSession.questions.length * 100}%`;
    $("#quizScore").textContent = `${quizSession.correct}점`;
    $("#quizPromptLabel").textContent = quizSession.direction === "word-to-meaning" ? "다음 단어의 뜻은?" : "다음 뜻에 맞는 단어는?";
    $("#quizPrompt").textContent = quizSession.direction === "word-to-meaning" ? question.word : question.meaning;
    $("#quizFeedback").hidden = true;
    $("#nextQuestionBtn").hidden = true;

    const deckWords = currentDeck().words;
    const answerKey = quizSession.direction === "word-to-meaning" ? "meaning" : "word";
    const wrongPool = shuffle(deckWords.filter(w => w.id !== question.id))
      .map(w => w[answerKey])
      .filter((value, index, array) => array.indexOf(value) === index && value !== question[answerKey])
      .slice(0, 3);
    const options = shuffle([question[answerKey], ...wrongPool]);
    $("#quizOptions").innerHTML = options.map(option =>
      `<button class="quiz-option" data-answer="${escapeHTML(option)}">${escapeHTML(option)}</button>`
    ).join("");
  }

  function answerQuestion(button) {
    if (quizSession.answered) return;
    quizSession.answered = true;
    const question = quizSession.questions[quizSession.index];
    const correctAnswer = quizSession.direction === "word-to-meaning" ? question.meaning : question.word;
    const chosen = button.dataset.answer;
    const correct = chosen === correctAnswer;

    $$(".quiz-option").forEach(option => {
      option.disabled = true;
      if (option.dataset.answer === correctAnswer) option.classList.add("correct");
    });
    if (!correct) button.classList.add("wrong");

    question.reviews++;
    question.lastReviewed = new Date().toISOString();
    if (correct) {
      quizSession.correct++;
      question.correct++;
      question.mastery = Math.min(3, question.mastery + 1);
    } else {
      question.wrong++;
      question.mastery = Math.max(0, question.mastery - .5);
    }

    const feedback = $("#quizFeedback");
    feedback.hidden = false;
    feedback.className = `quiz-feedback ${correct ? "correct" : "wrong"}`;
    feedback.textContent = correct ? "정답입니다! 🎉" : `정답: ${correctAnswer}`;
    $("#quizScore").textContent = `${quizSession.correct}점`;
    $("#nextQuestionBtn").hidden = false;
    $("#nextQuestionBtn").textContent = quizSession.index === quizSession.questions.length - 1 ? "결과 보기" : "다음 문제";
    saveState();
  }

  function nextQuestion() {
    if (!quizSession.answered) return;
    quizSession.index++;
    if (quizSession.index >= quizSession.questions.length) finishQuiz();
    else renderQuestion();
  }

  function finishQuiz() {
    const deck = currentDeck();
    const total = quizSession.questions.length;
    const percent = Math.round(quizSession.correct / total * 100);
    deck.sessions++;
    deck.quizHistory.unshift({
      id: uid(),
      at: new Date().toISOString(),
      correct: quizSession.correct,
      total,
      percent
    });
    deck.quizHistory = deck.quizHistory.slice(0, 20);
    state.recentActivity = {
      title: "퀴즈 완료",
      detail: `${total}문제 중 ${quizSession.correct}문제 정답 (${percent}%)`,
      at: new Date().toISOString()
    };
    saveState();

    $("#quizPlay").hidden = true;
    $("#quizResult").hidden = false;
    $("#resultPercent").textContent = `${percent}%`;
    $("#resultRing").style.background = `conic-gradient(var(--primary) ${percent}%, #e9e9f1 ${percent}%)`;
    $("#resultSummary").textContent = percent >= 80 ? "훌륭해요! 단어가 잘 기억되고 있어요." : percent >= 50 ? "좋아요! 틀린 단어를 한 번 더 복습해 보세요." : "조금 더 연습하면 금방 좋아질 거예요.";
    $("#resultCorrect").textContent = quizSession.correct;
    $("#resultWrong").textContent = total - quizSession.correct;
    $("#resultTotal").textContent = total;
  }

  // Stats
  function renderStats() {
    const deck = currentDeck();
    const stats = deckStats(deck);
    $("#statsAccuracy").textContent = `${stats.accuracy}%`;
    $("#statsMastered").textContent = stats.mastered;
    $("#statsReviews").textContent = stats.reviews;
    $("#statsBest").textContent = `${stats.best}%`;

    const masteredPercent = stats.total ? Math.round(stats.mastered / stats.total * 100) : 0;
    const learningPercent = stats.total ? Math.round(stats.learning / stats.total * 100) : 0;
    $("#donutPercent").textContent = `${masteredPercent}%`;
    $("#masteryDonut").style.background = `conic-gradient(
      var(--green) 0 ${masteredPercent}%,
      var(--orange) ${masteredPercent}% ${masteredPercent + learningPercent}%,
      #e8e9ef ${masteredPercent + learningPercent}% 100%
    )`;
    $("#legendMastered").textContent = stats.mastered;
    $("#legendLearning").textContent = stats.learning;
    $("#legendNew").textContent = stats.fresh;

    const difficult = [...(deck?.words || [])]
      .filter(w => w.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong || wordAccuracy(a) - wordAccuracy(b))
      .slice(0, 5);
    $("#difficultWords").innerHTML = difficult.length ? difficult.map((w, i) => `
      <div class="rank-item">
        <div><strong>${i + 1}. ${escapeHTML(w.word)}</strong><span>${escapeHTML(w.meaning)}</span></div>
        <strong>오답 ${w.wrong}</strong>
      </div>
    `).join("") : `<div class="empty-compact">아직 어려운 단어가 없습니다.</div>`;

    const history = deck?.quizHistory || [];
    $("#quizHistory").innerHTML = history.length ? history.slice(0, 9).map(item => `
      <div class="history-item">
        <div><strong>${item.correct} / ${item.total} 정답</strong><span>${formatDate(item.at)}</span></div>
        <strong>${item.percent}%</strong>
      </div>
    `).join("") : `<div class="empty-compact">아직 퀴즈 기록이 없습니다.</div>`;
  }

  function resetProgress() {
    const deck = currentDeck();
    if (!deck || !confirm("현재 단어장의 모든 학습 기록을 초기화할까요? 단어는 삭제되지 않습니다.")) return;
    deck.words.forEach(w => Object.assign(w, { reviews: 0, correct: 0, wrong: 0, mastery: 0, lastReviewed: null }));
    deck.sessions = 0;
    deck.quizHistory = [];
    state.recentActivity = null;
    saveState();
    renderAll();
    renderStats();
    toast("학습 기록을 초기화했습니다.");
  }

  // Decks
  function createDeck(event) {
    event.preventDefault();
    const name = $("#deckNameInput").value.trim();
    if (!name) return;
    const id = uid();
    state.decks.push({ id, name, createdAt: new Date().toISOString(), words: [], sessions: 0, quizHistory: [] });
    state.currentDeckId = id;
    saveState();
    $("#deckModal").close();
    $("#deckNameInput").value = "";
    renderAll();
    toast("새 단어장을 만들었습니다.");
  }

  function changeDeck(id) {
    state.currentDeckId = id;
    saveState();
    renderAll();
    if (currentView === "flashcards") startCardSession();
    if (currentView === "quiz") resetQuizView();
    toast(`'${currentDeck().name}' 단어장을 선택했습니다.`);
  }

  function downloadSample() {
    const csv = "\uFEFF어휘,품사,뜻\r\nimprove,v.,향상하다\r\nkeep,phr.,\"a journal 일지를 쓰다, 기록을 남기다\"\r\nmatter,v.,중요하다\r\nreflect,phr.,on ~을 되돌아보다\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "sample-vocabulary.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    $$(".nav-item").forEach(item => item.addEventListener("click", () => showView(item.dataset.view)));
    $$("[data-go]").forEach(button => button.addEventListener("click", () => showView(button.dataset.go)));
    $("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
    document.addEventListener("click", event => {
      if (window.innerWidth <= 980 && $("#sidebar").classList.contains("open") &&
          !event.target.closest("#sidebar") && !event.target.closest("#menuBtn")) {
        $("#sidebar").classList.remove("open");
      }
    });

    $("#deckSelect").addEventListener("change", event => changeDeck(event.target.value));
    $("#newDeckBtn").addEventListener("click", () => $("#deckModal").showModal());
    $("#deckForm").addEventListener("submit", createDeck);
    $$(".dialog-close").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));

    $("#downloadSampleBtn").addEventListener("click", downloadSample);
    $("#chooseFileBtn").addEventListener("click", event => {
      event.stopPropagation();
      $("#fileInput").click();
    });
    $("#dropZone").addEventListener("click", () => $("#fileInput").click());
    $("#dropZone").addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") $("#fileInput").click();
    });
    $("#fileInput").addEventListener("change", event => handleFile(event.target.files[0]));
    ["dragenter", "dragover"].forEach(type => $("#dropZone").addEventListener(type, event => {
      event.preventDefault(); $("#dropZone").classList.add("dragover");
    }));
    ["dragleave", "drop"].forEach(type => $("#dropZone").addEventListener(type, event => {
      event.preventDefault(); $("#dropZone").classList.remove("dragover");
    }));
    $("#dropZone").addEventListener("drop", event => handleFile(event.dataTransfer.files[0]));
    $("#resetUploadBtn").addEventListener("click", resetUpload);
    $("#saveWordsBtn").addEventListener("click", saveUploadedWords);
    $("#uploadDeckSelect").addEventListener("change", event => {
      $("#newDeckNameWrap").hidden = event.target.value !== "__new__";
    });

    $("#wordSearch").addEventListener("input", renderWords);
    $("#masteryFilter").addEventListener("change", renderWords);
    $("#addWordBtn").addEventListener("click", () => openWordModal());
    $("#wordForm").addEventListener("submit", submitWord);
    $("#wordTableBody").addEventListener("click", event => {
      const edit = event.target.closest("[data-edit-word]");
      const remove = event.target.closest("[data-delete-word]");
      if (edit) openWordModal(edit.dataset.editWord);
      if (remove) deleteWord(remove.dataset.deleteWord);
    });

    $("#flashcard").addEventListener("click", () => $("#flashcard").classList.toggle("flipped"));
    $("#flashcard").addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        $("#flashcard").classList.toggle("flipped");
      }
    });
    $("#speakBtn").addEventListener("click", speakCurrentWord);
    $$(".rating").forEach(button => button.addEventListener("click", () => rateCard(button.dataset.rating)));
    $("#restartCardsBtn").addEventListener("click", startCardSession);
    $("#shuffleCards").addEventListener("change", startCardSession);
    $("#cardScope").addEventListener("change", startCardSession);

    $("#startQuizBtn").addEventListener("click", startQuiz);
    $("#quizOptions").addEventListener("click", event => {
      const button = event.target.closest(".quiz-option");
      if (button) answerQuestion(button);
    });
    $("#nextQuestionBtn").addEventListener("click", nextQuestion);
    $("#retryQuizBtn").addEventListener("click", resetQuizView);
    $("#resetProgressBtn").addEventListener("click", resetProgress);
  }

  bindEvents();
  renderAll();
  resetUpload();
  showView("dashboard");
})();
