const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwyvvIWBO6NxdNj3FE5DLXOBZdd3BqkHEv5VNiBU3NTSMSsp7qOBIIy957w31mol1mi/exec';
const DATA_URLS = ['./vocabulary-question.json', './vocabulary-questions.json'];
const DATA_BUNDLE_URL = './vocabulary-data.js?v=2.5.0';
const HISTORY_KEY = 'clear_maker_2c_history';
const CHALLENGE_PROGRESS_PREFIX = 'clear_maker_2c_challenge20_';
const CHALLENGE_COMPLETE_PREFIX = 'clear_maker_2c_challenge20_complete_';
const REMEDY_STORAGE_PREFIX = 'clear_maker_2c_remedy_';
const DEVICE_ID_KEY = 'clear_maker_2c_device_id';
const PASS_RATE = 0.9;

const state = {
    studentId: '',
    studentName: '',
    vocabulary: [],
    test: null,
    images: [],
    cameraStream: null,
    facingMode: 'environment',
};

const byId = id => document.getElementById(id);
const els = {
    setupModal: byId('setup-modal'), studentId: byId('student-id'), studentName: byId('student-name'),
    saveSetup: byId('save-setup-btn'), settings: byId('settings-btn'), displayStudent: byId('display-student'), learnerRank: byId('learner-rank'), dataStatus: byId('data-status'),
    builder: byId('test-builder'), rangeStart: byId('range-start'), rangeEnd: byId('range-end'), questionCount: byId('question-count'),
    questionOrder: byId('question-order'), rangeMessage: byId('range-message'), challengeProgress: byId('challenge-progress'), createTest: byId('create-test-btn'),
    reviewControls: byId('review-controls'), reviewStageSelect: byId('review-stage-select'), reviewTest: byId('review-test-btn'),
    remedyControls: byId('remedy-controls'), remedyCountLabel: byId('remedy-count-label'), remedyTest: byId('remedy-test-btn'),
    historyToggle: byId('history-toggle-btn'), historyClose: byId('history-close-btn'), historySection: byId('history-section'), historyList: byId('history-list'),
    questionSection: byId('question-section'), questionList: byId('question-list'), testRangeLabel: byId('test-range-label'), replaceTest: byId('replace-test-btn'),
    uploadSection: byId('upload-section'), cameraInput: byId('camera-input'), upload: byId('upload-btn'), previewContainer: byId('preview-container'),
    previewList: byId('image-preview-list'), addMore: byId('add-more-btn'), clearAll: byId('clear-all-btn'), evaluate: byId('evaluate-btn'),
    loading: byId('loading-indicator'), resultSection: byId('result-section'), resultBadge: byId('result-badge'), resultScore: byId('result-score'),
    resultContent: byId('result-content'), screenshot: byId('screenshot-btn'), newTest: byId('new-test-btn'),
    cameraModal: byId('camera-modal'), cameraVideo: byId('camera-video'), cameraCanvas: byId('camera-canvas'),
    cameraShutter: byId('camera-shutter-btn'), cameraSwitch: byId('camera-switch-btn'), cameraClose: byId('camera-close-btn'),
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
    state.studentId = formatStudentId(localStorage.getItem('student_id') || '');
    state.studentName = localStorage.getItem('student_name') || '';
    els.studentId.value = state.studentId;
    els.studentName.value = state.studentName;
    updateStudentDisplay();
    if (!state.studentId || !state.studentName) els.setupModal.classList.remove('hidden');
    bindEvents();
    await loadVocabulary();
}

function bindEvents() {
    els.saveSetup.addEventListener('click', saveSetup);
    els.settings.addEventListener('click', () => els.setupModal.classList.remove('hidden'));
    [els.rangeStart, els.rangeEnd, els.questionCount].forEach(el => el.addEventListener('input', updateRangeMessage));
    els.questionOrder.addEventListener('change', updateModeUi);
    els.createTest.addEventListener('click', createTest);
    els.reviewTest.addEventListener('click', createReviewTest);
    els.remedyTest.addEventListener('click', createRemedyTest);
    els.replaceTest.addEventListener('click', recreateCurrentTest);
    els.historyToggle.addEventListener('click', showHistory);
    els.historyClose.addEventListener('click', () => els.historySection.classList.add('hidden'));
    els.upload.addEventListener('click', openCamera);
    els.addMore.addEventListener('click', openCamera);
    els.clearAll.addEventListener('click', clearImages);
    els.cameraInput.addEventListener('change', handleFileInput);
    els.cameraShutter.addEventListener('click', takePhoto);
    els.cameraSwitch.addEventListener('click', switchCamera);
    els.cameraClose.addEventListener('click', closeCamera);
    els.evaluate.addEventListener('click', evaluateAnswer);
    els.newTest.addEventListener('click', resetForNextTest);
    els.screenshot.addEventListener('click', saveResultImage);
    els.setupModal.addEventListener('click', event => {
        if (event.target === els.setupModal && state.studentId && state.studentName) els.setupModal.classList.add('hidden');
    });
}

const VOCABULARY_CACHE_KEY = 'clear_maker_2c_vocab_cache_v2';

async function loadVocabulary() {
    try {
        let source = null;
        let loadedUrl = '';
        let lastError = null;

        // 1. 端末内ローカルキャッシュをチェック（オフライン・高速起動）
        const cachedStr = localStorage.getItem(VOCABULARY_CACHE_KEY);
        if (cachedStr) {
            try {
                source = JSON.parse(cachedStr);
                loadedUrl = '端末内キャッシュ';
            } catch (err) {
                console.warn('Invalid cache:', err);
                localStorage.removeItem(VOCABULARY_CACHE_KEY);
            }
        }

        // 2. キャッシュがない場合、GASバックエンド（クラウド）から取得
        if (!source && GAS_API_URL) {
            els.dataStatus.textContent = '問題データを取得中…';
            try {
                const response = await fetch(GAS_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ action: 'getVocabularyData' })
                });
                if (response.ok) {
                    const resData = await response.json();
                    if (resData && resData.status === 'success' && resData.data?.items) {
                        source = resData.data;
                        loadedUrl = 'GAS クラウド';
                        try {
                            localStorage.setItem(VOCABULARY_CACHE_KEY, JSON.stringify(source));
                        } catch (cacheErr) {
                            console.warn('LocalStorage save failed:', cacheErr);
                        }
                    }
                }
            } catch (err) {
                console.warn('GAS fetch failed:', err);
                lastError = err;
            }
        }

        // 3. ローカルファイルからのフォールバック（開発時等）
        if (!source) {
            for (const url of DATA_URLS) {
                try {
                    const response = await fetch(url, { cache: 'no-cache' });
                    if (response.ok) {
                        source = await response.json();
                        loadedUrl = url;
                        break;
                    }
                } catch (err) {
                    lastError = err;
                }
            }
        }
        if (!source) {
            try {
                source = await loadVocabularyBundle();
                loadedUrl = 'vocabulary-data.js';
            } catch (err) {
                lastError = err;
            }
        }

        if (!source || !source.items) throw lastError || new Error('教材データを取得できませんでした');

        state.vocabulary = Object.values(source.items || {}).map((item, index) => ({
            number: index + 1,
            wordId: item.word_id,
            word: String(item.word || '').trim(),
            questions: Array.isArray(item.questions) ? item.questions.filter(q => q && q.question_text) : [],
        })).filter(item => item.word && item.questions.length);

        globalThis.CLEAR_MAKER_VOCABULARY = null;
        if (!state.vocabulary.length) throw new Error('有効な問題がありません');

        els.rangeStart.max = state.vocabulary.length;
        els.rangeEnd.max = state.vocabulary.length;
        els.dataStatus.textContent = `${state.vocabulary.length.toLocaleString()}語・${state.vocabulary.reduce((sum, item) => sum + item.questions.length, 0).toLocaleString()}問`;
        els.dataStatus.title = `${loadedUrl} から読み込みました`;
        els.dataStatus.classList.add('ready');
        els.createTest.disabled = false;
        updateModeUi();
        syncVocabularyProgress().catch(error => console.warn('Progress sync deferred:', error));
    } catch (error) {
        console.error(error);
        els.dataStatus.textContent = '単語データを読み込めません';
        els.rangeMessage.textContent = `単語データの読み込みに失敗しました（${error.message}）。通信状態を確認してページを再読み込みしてください。`;
        els.rangeMessage.classList.remove('hidden');
    }
}

function loadVocabularyBundle() {
    if (globalThis.CLEAR_MAKER_VOCABULARY) return Promise.resolve(globalThis.CLEAR_MAKER_VOCABULARY);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = DATA_BUNDLE_URL;
        script.onload = () => globalThis.CLEAR_MAKER_VOCABULARY
            ? resolve(globalThis.CLEAR_MAKER_VOCABULARY)
            : reject(new Error('vocabulary-data.js に有効なデータがありません'));
        script.onerror = () => reject(new Error('JSONとJSの両方を取得できませんでした'));
        document.head.appendChild(script);
    });
}

function saveSetup() {
    const id = formatStudentId(els.studentId.value);
    const name = els.studentName.value.trim();
    if (!id || !name) return alert('生徒番号と氏名を入力してください。');
    state.studentId = id;
    state.studentName = name;
    localStorage.setItem('student_id', id);
    localStorage.setItem('student_name', name);
    els.studentId.value = id;
    updateStudentDisplay();
    els.setupModal.classList.add('hidden');
    syncVocabularyProgress().catch(error => console.warn('Progress sync deferred:', error));
}

function formatStudentId(value) {
    const text = String(value || '').trim();
    return /^\d{1,4}$/.test(text) ? text.padStart(4, '0') : text;
}

function getDeviceId() {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY) || '';
    if (!deviceId) {
        deviceId = globalThis.crypto?.randomUUID
            ? globalThis.crypto.randomUUID()
            : `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
}

function updateStudentDisplay() {
    els.displayStudent.textContent = state.studentId && state.studentName ? `${state.studentId} / ${state.studentName}` : '未登録';
    updateLearnerRank();
    updateModeUi();
}

function getLearnerRank(clearedThrough) {
    const total = state.vocabulary.length || 1800;
    if (typeof clearedThrough !== 'number') {
        clearedThrough = isChallengeComplete() ? total : Math.min(total, getChallengeBlockIndex() * 20);
    }
    const rate = total > 0 ? (clearedThrough / total) * 100 : 0;

    if (rate >= 95) return { name: 'マスター 👑', className: 'rank-master', rate, clearedThrough, total };
    if (rate >= 85) return { name: 'プロフェッショナル', className: 'rank-professional', rate, clearedThrough, total };
    if (rate >= 70) return { name: 'エキスパート', className: 'rank-expert', rate, clearedThrough, total };
    if (rate >= 50) return { name: 'スペシャリスト', className: 'rank-specialist', rate, clearedThrough, total };
    if (rate >= 30) return { name: 'ルーキー', className: 'rank-rookie', rate, clearedThrough, total };
    if (rate >= 15) return { name: 'ノービス', className: 'rank-novice', rate, clearedThrough, total };
    return { name: 'ビギナー', className: 'rank-beginner', rate, clearedThrough, total };
}

function updateLearnerRank() {
    if (!els.learnerRank) return;
    const rank = getLearnerRank();
    els.learnerRank.textContent = rank.name;
    els.learnerRank.className = `learner-rank ${rank.className}`;
    els.learnerRank.title = `達成度: ${Math.round(rank.rate * 10) / 10}% (${rank.clearedThrough} / ${rank.total}語クリア)`;
}

function getRange() {
    const max = state.vocabulary.length || 1800;
    let start = Math.min(max, Math.max(1, Number(els.rangeStart.value) || 1));
    let end = Math.min(max, Math.max(1, Number(els.rangeEnd.value) || max));
    if (start > end) [start, end] = [end, start];
    return { start, end, available: end - start + 1, count: Number(els.questionCount.value) || 10 };
}

function updateRangeMessage() {
    els.rangeMessage.textContent = '';
    els.rangeMessage.classList.add('hidden');
}

function isChallengeMode() {
    return els.questionOrder && els.questionOrder.value === 'challenge20';
}

function getChallengeProgressKey() {
    return `${CHALLENGE_PROGRESS_PREFIX}${state.studentId || 'guest'}`;
}

function getChallengeCompleteKey() {
    return `${CHALLENGE_COMPLETE_PREFIX}${state.studentId || 'guest'}`;
}

function isChallengeComplete() {
    return localStorage.getItem(getChallengeCompleteKey()) === '1';
}

function getChallengeBlockIndex() {
    const maxIndex = Math.max(0, Math.ceil((state.vocabulary.length || 1800) / 20) - 1);
    return Math.min(maxIndex, Math.max(0, Number(localStorage.getItem(getChallengeProgressKey()) || 0) || 0));
}

function getChallengeBlock() {
    const index = getChallengeBlockIndex();
    const start = index * 20 + 1;
    const end = Math.min(start + 19, state.vocabulary.length || 1800);
    return { index, start, end, count: end - start + 1 };
}

function updateModeUi() {
    if (!els.questionOrder) return;
    updateLearnerRank();
    const challenge = isChallengeMode();
    [els.rangeStart, els.rangeEnd, els.questionCount].forEach(el => { el.disabled = challenge; });
    els.challengeProgress.classList.toggle('hidden', !challenge);
    if (challenge) {
        const block = getChallengeBlock();
        const totalBlocks = Math.ceil((state.vocabulary.length || 1800) / 20);
        const passNeeded = Math.ceil(block.count * PASS_RATE);
        els.challengeProgress.innerHTML = `<strong>現在：第${block.index + 1}ステージ / 全${totalBlocks}ステージ</strong><span>No.${block.start}〜${block.end}を${passNeeded}題以上正解すると、次の20題へ進めます。</span>`;
        els.createTest.textContent = `No.${block.start}〜${block.end}にチャレンジする`;
    } else {
        els.createTest.textContent = '問題を作成する';
    }
    renderReviewOptions();
    renderRemedyOptions();
    updateRangeMessage();
}

function renderReviewOptions() {
    if (!els.reviewControls || !els.reviewStageSelect) return;
    const total = state.vocabulary.length || 1800;
    const clearedStages = isChallengeComplete() ? Math.ceil(total / 20) : getChallengeBlockIndex();
    els.reviewControls.classList.toggle('hidden', clearedStages < 1);
    if (clearedStages < 1) return;
    const previousValue = Number(els.reviewStageSelect.value);
    els.reviewStageSelect.innerHTML = Array.from({ length: clearedStages }, (_, index) => {
        const start = index * 20 + 1;
        const end = Math.min(start + 19, total);
        return `<option value="${index}">第${index + 1}回（No.${start}〜${end}）</option>`;
    }).join('');
    if (Number.isInteger(previousValue) && previousValue >= 0 && previousValue < clearedStages) {
        els.reviewStageSelect.value = String(previousValue);
    } else {
        els.reviewStageSelect.value = String(clearedStages - 1);
    }
}

function renderRemedyOptions() {
    if (!els.remedyControls || !els.remedyCountLabel) return;
    const activeWords = getActiveRemedyWords();
    const totalWrong = Object.keys(getRemedyData()).length;
    els.remedyControls.classList.toggle('hidden', totalWrong < 1);
    if (totalWrong < 1) return;

    if (activeWords.length > 0) {
        els.remedyCountLabel.textContent = `要復習: 残り ${activeWords.length}語（全${totalWrong}語中）`;
        els.remedyTest.disabled = false;
        els.remedyTest.textContent = `間違えた単語（${Math.min(20, activeWords.length)}問）をテストする`;
    } else {
        els.remedyCountLabel.textContent = `🎉 すべての苦手単語を克服中！(${totalWrong}語 克服済み)`;
        els.remedyTest.disabled = false;
        els.remedyTest.textContent = `克服した単語を総復習する（${Math.min(20, totalWrong)}問）`;
    }
}

function createTest() {
    if (!state.vocabulary.length) return;
    if (!state.studentId || !state.studentName) {
        els.setupModal.classList.remove('hidden');
        return;
    }
    const challengeBlock = isChallengeMode() ? getChallengeBlock() : null;
    const range = challengeBlock
        ? { start: challengeBlock.start, end: challengeBlock.end, available: challengeBlock.count, count: challengeBlock.count }
        : getRange();
    if (!challengeBlock) {
        els.rangeStart.value = range.start;
        els.rangeEnd.value = range.end;
    }
    startTest(range, {
        challenge20: Boolean(challengeBlock),
        challengeBlockIndex: challengeBlock ? challengeBlock.index : null,
        reviewMode: false,
        remedyMode: false,
        shuffleWords: els.questionOrder.value === 'random',
    });
}

function createReviewTest() {
    const blockIndex = Number(els.reviewStageSelect.value);
    const clearedStages = isChallengeComplete()
        ? Math.ceil((state.vocabulary.length || 1800) / 20)
        : getChallengeBlockIndex();
    if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= clearedStages) return;
    createReviewTestByIndex(blockIndex);
}

function createReviewTestByIndex(blockIndex) {
    const start = blockIndex * 20 + 1;
    const end = Math.min(start + 19, state.vocabulary.length);
    startTest({ start, end, available: end - start + 1, count: end - start + 1 }, {
        challenge20: true,
        challengeBlockIndex: blockIndex,
        reviewMode: true,
        remedyMode: false,
        shuffleWords: false,
    });
}

function createRemedyTest() {
    if (!state.vocabulary.length) return;
    if (!state.studentId || !state.studentName) {
        els.setupModal.classList.remove('hidden');
        return;
    }
    let targetPool = getActiveRemedyWords();
    let isReviewingMastered = false;
    if (!targetPool.length) {
        targetPool = getMasteredRemedyWords();
        isReviewingMastered = true;
    }
    if (!targetPool.length) return;

    const count = Math.min(20, targetPool.length);
    const shuffled = shuffle(targetPool.slice()).slice(0, count);
    const questions = shuffled.map((item, index) => {
        const vocabItem = state.vocabulary[item.targetNumber - 1] || state.vocabulary.find(v => v.word === item.word);
        const question = vocabItem?.questions
            ? vocabItem.questions[Math.floor(Math.random() * vocabItem.questions.length)]
            : { id: `remedy-${item.targetNumber}`, question_text: item.questionText || item.word };
        return {
            number: index + 1,
            targetNumber: item.targetNumber,
            wordId: vocabItem?.word_id || `target1800-${item.targetNumber}`,
            answer: item.word,
            questionId: question.id,
            text: question.question_text
        };
    });

    state.test = {
        id: `vocab-remedy-${Date.now()}`,
        createdAt: new Date().toISOString(),
        range: { start: 1, end: state.vocabulary.length },
        questions: questions,
        challenge20: false,
        reviewMode: false,
        remedyMode: true,
        isReviewingMastered: isReviewingMastered
    };

    clearImages();
    els.resultSection.classList.add('hidden');
    renderQuestions();
    els.questionSection.classList.remove('hidden');
    els.uploadSection.classList.remove('hidden');
    els.questionSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function recreateCurrentTest() {
    if (state.test?.remedyMode) createRemedyTest();
    else if (state.test?.reviewMode) createReviewTestByIndex(state.test.challengeBlockIndex);
    else createTest();
}

function startTest(range, options) {
    let pool = state.vocabulary.slice(range.start - 1, range.end);
    if (options.shuffleWords) pool = shuffle(pool.slice());
    const selected = pool.slice(0, Math.min(range.count, pool.length));
    const questions = selected.map((item, index) => {
        const question = item.questions[Math.floor(Math.random() * item.questions.length)];
        return { number: index + 1, targetNumber: item.number, wordId: item.wordId, answer: item.word, questionId: question.id, text: question.question_text };
    });
    state.test = { id: `vocab-${Date.now()}`, createdAt: new Date().toISOString(), range, questions, ...options };
    clearImages();
    els.resultSection.classList.add('hidden');
    renderQuestions();
    els.questionSection.classList.remove('hidden');
    els.uploadSection.classList.remove('hidden');
    els.questionSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

function renderQuestions() {
    const modeLabel = state.test?.remedyMode
        ? `🔥 苦手克服チャレンジ / ${state.test.questions.length}問`
        : state.test?.reviewMode
        ? `No.${state.test.range.start}–${state.test.range.end} / ${state.test.questions.length}問・復習`
        : `No.${state.test.range.start}–${state.test.range.end} / ${state.test.questions.length}問`;
    els.testRangeLabel.textContent = modeLabel;
    els.questionList.innerHTML = state.test.questions.map(question => `
        <article class="vocabulary-question">
            <div class="question-number">${question.number}</div>
            <div class="question-body">
                <span class="target-number">TARGET ${question.targetNumber}</span>
                ${formatQuestion(question.text)}
            </div>
        </article>`).join('');
}

function getRemedyKey() {
    return `${REMEDY_STORAGE_PREFIX}${state.studentId || 'guest'}`;
}

function getRemedyData() {
    try {
        return JSON.parse(localStorage.getItem(getRemedyKey()) || '{}');
    } catch (_) {
        return {};
    }
}

function saveRemedyData(data) {
    localStorage.setItem(getRemedyKey(), JSON.stringify(data));
}

function recordWrongAnswersToRemedy(wrongItems) {
    if (!wrongItems || !wrongItems.length) return;
    const data = getRemedyData();
    wrongItems.forEach(item => {
        const num = Number(item.targetNumber);
        if (!num) return;
        if (!data[num]) {
            data[num] = {
                targetNumber: num,
                word: item.word,
                questionText: item.questionText,
                missCount: 0,
                mastered: false,
                lastMissedAt: new Date().toISOString()
            };
        }
        data[num].missCount = (data[num].missCount || 0) + 1;
        data[num].mastered = false;
        data[num].lastMissedAt = new Date().toISOString();
    });
    saveRemedyData(data);
}

function masterRemedyWords(masteredTargetNumbers) {
    if (!masteredTargetNumbers || !masteredTargetNumbers.length) return;
    const data = getRemedyData();
    masteredTargetNumbers.forEach(num => {
        num = Number(num);
        if (data[num]) {
            data[num].mastered = true;
            data[num].masteredAt = new Date().toISOString();
        }
    });
    saveRemedyData(data);
}

function getActiveRemedyWords() {
    const data = getRemedyData();
    return Object.values(data).filter(item => !item.mastered);
}

function getMasteredRemedyWords() {
    const data = getRemedyData();
    return Object.values(data).filter(item => item.mastered);
}

function formatQuestion(text) {
    return escapeHtml(text)
        .replace(/\[\[([\s\S]*?)\]\]/g, '<mark>$1</mark>')
        .replace(/\n/g, '<br>');
}

async function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        els.cameraInput.click();
        return;
    }
    try {
        if (state.cameraStream) stopStream();
        state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: state.facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        els.cameraVideo.srcObject = state.cameraStream;
        els.cameraModal.classList.remove('hidden');
    } catch (error) {
        console.warn('Camera fallback:', error);
        els.cameraInput.click();
    }
}

function closeCamera() {
    els.cameraModal.classList.add('hidden');
    stopStream();
}

function stopStream() {
    if (state.cameraStream) state.cameraStream.getTracks().forEach(track => track.stop());
    state.cameraStream = null;
    els.cameraVideo.srcObject = null;
}

async function switchCamera() {
    state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
    await openCamera();
}

function takePhoto() {
    const video = els.cameraVideo;
    if (!video.videoWidth) return;
    const canvas = els.cameraCanvas;
    const size = fitSize(video.videoWidth, video.videoHeight, 1600);
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d').drawImage(video, 0, 0, size.width, size.height);
    addImageDataUrl(canvas.toDataURL('image/jpeg', 0.8));
    closeCamera();
}

async function handleFileInput(event) {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
        try { addImageDataUrl(await resizeImageFile(file)); }
        catch (error) { console.error(error); alert('画像を読み込めませんでした。'); }
    }
    event.target.value = '';
}

function resizeImageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const image = new Image();
            image.onerror = reject;
            image.onload = () => {
                const size = fitSize(image.width, image.height, 1600);
                const canvas = document.createElement('canvas');
                canvas.width = size.width;
                canvas.height = size.height;
                canvas.getContext('2d').drawImage(image, 0, 0, size.width, size.height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function fitSize(width, height, maxWidth) {
    if (width <= maxWidth) return { width, height };
    return { width: maxWidth, height: Math.round(height * maxWidth / width) };
}

function addImageDataUrl(dataUrl) {
    const comma = dataUrl.indexOf(',');
    state.images.push({ mimeType: 'image/jpeg', data: dataUrl.slice(comma + 1), preview: dataUrl });
    renderImages();
}

function renderImages() {
    els.previewList.innerHTML = state.images.map((image, index) => `<div class="image-preview-item"><img src="${image.preview}" alt="答案 ${index + 1}"><button type="button" data-remove-image="${index}" aria-label="削除">×</button></div>`).join('');
    els.previewList.querySelectorAll('[data-remove-image]').forEach(button => button.addEventListener('click', () => {
        state.images.splice(Number(button.dataset.removeImage), 1);
        renderImages();
    }));
    const hasImages = state.images.length > 0;
    els.previewContainer.classList.toggle('hidden', !hasImages);
    els.evaluate.classList.toggle('hidden', !hasImages);
    els.upload.textContent = hasImages ? '別の写真を追加する' : '解答を撮影・追加する';
}

function clearImages() {
    state.images = [];
    renderImages();
}

async function evaluateAnswer() {
    if (!state.test || !state.images.length) return;
    const answerKey = state.test.questions.map(q => `${q.number}. 正答「${q.answer}」\n問題文: ${q.text}`).join('\n\n');
    const prompt = `あなたは英単語テストの厳密かつ丁寧な採点・添削者です。
生徒は問題番号とともに「英文の全文」を手書きで書いています。答案画像を読み取り、下の問題番号と正答表に照合してください。

【最重要ルール: 英文全文の記述チェック（単語のみはノーカウント・再提出）】
- このテストでは「空欄の単語だけでなく英文の全文を手書きで書くこと」が必須です。
- 答案画像を確認し、単語のみしか書かれていない設問が大半である場合や、英文全体を書く指示が守られていない場合は、通常採点を中止して以下の【再提出フォーマット】で出力してください。

【再提出フォーマット（単語のみで英文全文が書かれていない場合）】
[判定]
再提出（英文全文未記入）
[得点]
0/${state.test.questions.length}
[詳細]
単語のみが記入されています。このテストでは単語だけでなく「英文の全文」をノートに書いて提出する必要があります。英文全体を書いて、再度撮影・提出してください。
[ひとこと]
単語だけでなく文全体を書くことで、文法や使い方が身につきます！もう一度英文を書いて撮影しましょう。

【通常採点フォーマット（英文の全文が書かれている場合）】
1. 【得点・合否の判定対象】:
   - ○/×の合否判定は、空欄に入るべき「ターゲット英単語（正答）」のスペルのみを対象とします。
   - 大文字・小文字だけの違いは正解（ただし文頭や「I」など本来大文字にすべき語は補足で指導）。
   - ターゲット単語の綴りが1文字でも違う、空欄、判読不能は不正解（×）。
   - 合格は90%以上の正解。${state.test.questions.length}問すべてを必ず判定してください。

2. 【英文全体のチェック・アドバイス（合否には影響させない）】:
   - ターゲット単語以外の部分（文頭の大文字、文末のピリオド、前後の単語のスペルミス、脱落など）に気付きがあれば、採点の○/×には影響させず、[詳細]の各問に「※注: ...」として補足するか、[ひとこと]で親切に指導・アドバイスをしてください。

【問題と正答表】
${answerKey}

（英文全文が書かれている場合は次の形式だけで日本語出力してください）
[判定]
合格 または 再チャレンジ
[得点]
正解数/${state.test.questions.length}
[詳細]
1. ○ 読み取り「...」 / 正答「...」
2. × 読み取り「...」 / 正答「...」
   ※注: （ターゲット以外の単語ミスや文末ピリオド抜け等があればここに簡潔に記載）
（全番号を出力）
[ひとこと]
短く前向きなコメント。間違い単語のポイントや、英文全体の書き方（スペルや句読点など）へのアドバイス。`;

    setGradingState(true);
    try {
        const response = await fetch(GAS_API_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ apiKey: 'server', isStudentApp: true, subject: 'other', userPrompt: prompt, images: { student: state.images.map(({ mimeType, data }) => ({ mimeType, data })) } }),
        });
        if (!response.ok) throw new Error(`採点サーバー HTTP ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        const text = getAiText(data);
        const result = displayResult(text);

        if (result.isResubmit) {
            saveHistory(text, result);
            els.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        const wrongAnswers = extractWrongAnswers(text);

        if (state.test?.remedyMode) {
            const wrongTargetNums = new Set(wrongAnswers.map(w => Number(w.targetNumber)));
            const masteredTargetNums = state.test.questions
                .map(q => Number(q.targetNumber))
                .filter(num => num && !wrongTargetNums.has(num));

            if (masteredTargetNums.length > 0) {
                masterRemedyWords(masteredTargetNums);
            }
            if (wrongAnswers.length > 0) {
                recordWrongAnswersToRemedy(wrongAnswers);
            }
            syncVocabularyRemedyResult(masteredTargetNums, wrongAnswers).catch(err => console.warn('Remedy sync deferred:', err));
        } else {
            if (wrongAnswers.length > 0) {
                recordWrongAnswersToRemedy(wrongAnswers);
                syncVocabularyWrongAnswers(wrongAnswers).catch(err => console.warn('Wrong answers sync deferred:', err));
            }
        }

        updateChallengeProgress(result, wrongAnswers);
        saveHistory(text, result);
        updateLearnerRank();
        els.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
        console.error(error);
        alert(`採点できませんでした。通信状態を確認してもう一度お試しください。\n${error.message}`);
    } finally {
        setGradingState(false);
    }
}

function setGradingState(active) {
    els.loading.classList.toggle('hidden', !active);
    els.evaluate.disabled = active;
    if (active) els.resultSection.classList.add('hidden');
}

function getAiText(data) {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map(part => part.text || '').join('').trim();
    if (!text) throw new Error(data?.candidates?.[0]?.finishReason ? `AI応答: ${data.candidates[0].finishReason}` : '採点結果が空でした');
    return text;
}

function displayResult(text) {
    const isResubmit = text.includes('再提出') || text.includes('全文未記入') || text.includes('単語のみが記入');
    if (isResubmit) {
        els.resultBadge.className = 'result-badge retry';
        els.resultBadge.textContent = '再提出';
        els.resultScore.textContent = 'ノーカウント';
        const details = text.replace(/\[判定\][\s\S]*?(?=\[得点\]|\[詳細\]|$)/, '').replace(/\[得点\][\s\S]*?(?=\[詳細\]|$)/, '').trim();
        els.resultContent.innerHTML = sanitizeHtml(marked.parse(details || text, { breaks: true }));
        const warning = document.createElement('div');
        warning.className = 'challenge-result locked';
        warning.innerHTML = `<strong>⚠️ 英文の全文が書かれていません（ノーカウント）</strong><span>単語だけでなく英文の全文をノートに書き、再度撮影してください。</span>`;
        els.resultContent.prepend(warning);
        els.resultSection.classList.remove('hidden');
        els.newTest.textContent = 'もう一度撮影する';
        return { correct: 0, total: state.test.questions.length, passed: false, isResubmit: true };
    }

    const judgement = (text.match(/\[判定\]\s*\n?([^\n]+)/) || [])[1] || (text.includes('合格') ? '合格' : '再チャレンジ');
    const scoreMatch = text.match(/\[得点\]\s*\n?\s*(\d+)\s*\/\s*(\d+)/) || text.match(/(\d+)\s*問中\s*(\d+)\s*問正解/);
    let correct = scoreMatch ? Number(scoreMatch[1]) : null;
    let total = scoreMatch ? Number(scoreMatch[2]) : state.test.questions.length;
    if (scoreMatch && text.match(/問中/)) [total, correct] = [Number(scoreMatch[1]), Number(scoreMatch[2])];
    const passed = correct === null
        ? judgement.includes('合格') && !judgement.includes('不合格')
        : correct / Math.max(1, total) >= PASS_RATE;
    els.resultBadge.className = `result-badge ${passed ? 'pass' : 'retry'}`;
    els.resultBadge.textContent = passed ? '合格' : '再チャレンジ';
    els.resultScore.textContent = correct === null ? `${total}問` : `${correct} / ${total}`;
    const details = text.replace(/\[判定\][\s\S]*?(?=\[得点\]|\[詳細\]|$)/, '').replace(/\[得点\][\s\S]*?(?=\[詳細\]|$)/, '').trim();
    els.resultContent.innerHTML = sanitizeHtml(marked.parse(details || text, { breaks: true }));
    els.resultSection.classList.remove('hidden');
    return { correct, total, passed, isResubmit: false };
}

function updateChallengeProgress(result, wrongAnswers) {
    if (state.test?.remedyMode) {
        const total = state.test.questions.length;
        const wrongCount = wrongAnswers ? wrongAnswers.length : 0;
        const masteredCount = Math.max(0, total - wrongCount);
        const notice = document.createElement('div');
        notice.className = 'challenge-result remedy-passed';
        notice.innerHTML = `<strong>🔥 苦手克服チャレンジ完了！</strong><span>今回正解した <strong>${masteredCount}語</strong> に「🎉 克服済み (CLEAR!)」バッジがつきました！</span>`;
        els.resultContent.prepend(notice);
        els.newTest.textContent = 'メニューに戻る';
        updateModeUi();
        return;
    }
    if (!state.test?.challenge20) return;
    if (state.test.reviewMode) {
        const notice = document.createElement('div');
        notice.className = `challenge-result ${result.passed ? 'passed' : 'locked'}`;
        notice.innerHTML = `<strong>第${state.test.challengeBlockIndex + 1}回の復習完了</strong><span>復習テストでは現在の進行位置は変わりません。</span>`;
        els.resultContent.prepend(notice);
        els.newTest.textContent = '別の回を復習する';
        return;
    }
    const currentIndex = getChallengeBlockIndex();
    const attemptedIndex = state.test.challengeBlockIndex;
    const isCurrentStage = attemptedIndex === currentIndex;
    const isLastStage = state.test.range.end >= state.vocabulary.length;
    const notice = document.createElement('div');
    notice.className = `challenge-result ${result.passed ? 'passed' : 'locked'}`;

    if (result.passed && isCurrentStage && !isLastStage) {
        localStorage.setItem(getChallengeProgressKey(), String(currentIndex + 1));
        const nextStart = state.test.range.end + 1;
        notice.innerHTML = `<strong>ステージクリア！</strong><span>次は No.${nextStart}〜${Math.min(nextStart + 19, state.vocabulary.length)} に進めます。</span>`;
        els.newTest.textContent = '次の20題へ';
        syncVocabularyProgress().catch(error => console.warn('Progress sync deferred:', error));
    } else if (result.passed && isLastStage) {
        localStorage.setItem(getChallengeCompleteKey(), '1');
        notice.innerHTML = '<strong>全ステージクリア！</strong><span>TARGET 1800を完走しました。</span>';
        els.newTest.textContent = 'もう一度テストを作る';
        syncVocabularyProgress().catch(error => console.warn('Progress sync deferred:', error));
    } else if (!result.passed) {
        const needed = Math.ceil(state.test.questions.length * PASS_RATE);
        notice.innerHTML = `<strong>次の20題はまだロック中です</strong><span>${needed}題以上正解するまで、No.${state.test.range.start}〜${state.test.range.end}に再チャレンジします。</span>`;
        els.newTest.textContent = '同じ20題に再チャレンジ';
    }
    els.resultContent.prepend(notice);
    updateModeUi();
}

function getVocabularyProgressSnapshot() {
    const total = state.vocabulary.length || 1800;
    const complete = isChallengeComplete();
    const clearedThrough = complete ? total : Math.min(total, getChallengeBlockIndex() * 20);
    const nextStart = Math.min(total, clearedThrough + 1);
    const nextEnd = Math.min(total, nextStart + 19);
    return {
        clearedThrough,
        nextRange: complete ? '完了' : `No.${nextStart}〜${nextEnd}`,
        rank: getLearnerRank(clearedThrough).name,
    };
}

async function syncVocabularyProgress() {
    if (!state.studentId || !state.studentName) return;
    const progress = getVocabularyProgressSnapshot();
    const response = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            action: 'saveVocabularyProgress',
            studentId: state.studentId,
            studentName: state.studentName,
            deviceId: getDeviceId(),
            clearedThrough: progress.clearedThrough,
            nextRange: progress.nextRange,
            rank: progress.rank,
        }),
    });
    if (!response.ok) throw new Error(`進捗保存 HTTP ${response.status}`);
    const data = await response.json();
    if (data.status !== 'success') throw new Error(data.error || '進捗を保存できませんでした');
    const serverClearedThrough = Math.max(0, Number(data.progress?.clearedThrough) || 0);
    const localProgress = getVocabularyProgressSnapshot();
    if (serverClearedThrough > localProgress.clearedThrough) {
        const total = state.vocabulary.length || 1800;
        if (serverClearedThrough >= total) {
            localStorage.setItem(getChallengeCompleteKey(), '1');
            localStorage.setItem(getChallengeProgressKey(), String(Math.max(0, Math.ceil(total / 20) - 1)));
        } else {
            localStorage.setItem(getChallengeProgressKey(), String(Math.floor(serverClearedThrough / 20)));
        }
        updateModeUi();
    }
    return data.progress;
}

function extractWrongAnswers(text) {
    if (!state.test?.questions) return [];
    const wrongItems = [];
    const lines = text.split('\n');
    lines.forEach(line => {
        const match = line.match(/^\s*(\d+)[\.、\:\s]+[×✕✗xX]/i);
        if (match) {
            const qNum = Number(match[1]);
            const qObj = state.test.questions.find(q => q.number === qNum);
            if (qObj) {
                const readingMatch = line.match(/読み取り[「『\s:]([^」』\/\n]+)[」』]?/);
                const studentAnswer = readingMatch ? readingMatch[1].trim() : '(未回答・判読不能)';
                const cleanQuestion = qObj.text ? qObj.text.replace(/\r?\n/g, ' ').slice(0, 100) : '';

                wrongItems.push({
                    targetNumber: qObj.targetNumber || qObj.number,
                    word: qObj.answer,
                    studentAnswer: studentAnswer,
                    questionText: cleanQuestion,
                    range: `No.${state.test.range.start}〜${state.test.range.end}`
                });
            }
        }
    });
    return wrongItems;
}

async function syncVocabularyWrongAnswers(wrongAnswers) {
    if (!wrongAnswers || !wrongAnswers.length || !state.studentId || !state.studentName) return;
    try {
        await fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'saveVocabularyWrongAnswers',
                studentId: state.studentId,
                studentName: state.studentName,
                deviceId: getDeviceId(),
                range: `No.${state.test.range.start}〜${state.test.range.end}`,
                wrongAnswers: wrongAnswers
            })
        });
    } catch (err) {
        console.warn('Failed to sync wrong answers:', err);
    }
}

async function syncVocabularyRemedyResult(masteredNumbers, wrongAnswers) {
    if (!state.studentId || !state.studentName) return;
    try {
        await fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'saveVocabularyRemedyResult',
                studentId: state.studentId,
                studentName: state.studentName,
                deviceId: getDeviceId(),
                masteredNumbers: masteredNumbers || [],
                wrongAnswers: wrongAnswers || []
            })
        });
    } catch (err) {
        console.warn('Failed to sync remedy result:', err);
    }
}

function saveHistory(resultText, result) {
    const score = els.resultScore.textContent;
    const history = getHistory();
    history.unshift({ id: state.test.id, date: new Date().toISOString(), studentId: state.studentId, studentName: state.studentName,
        range: `${state.test.range.start}-${state.test.range.end}`, count: state.test.questions.length, score, judgement: els.resultBadge.textContent,
        challenge20: Boolean(state.test.challenge20), reviewMode: Boolean(state.test.reviewMode), passed: Boolean(result?.passed), resultText });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch (_) { return []; }
}

function showHistory() {
    const history = getHistory();
    els.historyList.innerHTML = history.length ? history.map(item => `
        <article class="history-item">
            <div><strong>${escapeHtml(item.judgement)}</strong><span>${escapeHtml(item.score)}</span></div>
            <p>TARGET ${escapeHtml(item.range)}・${item.count}問</p>
            <time>${new Date(item.date).toLocaleString('ja-JP')}</time>
        </article>`).join('') : '<p class="history-empty">まだ採点履歴がありません。</p>';
    els.historySection.classList.remove('hidden');
    els.historySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForNextTest() {
    clearImages();
    state.test = null;
    els.questionSection.classList.add('hidden');
    els.uploadSection.classList.add('hidden');
    els.resultSection.classList.add('hidden');
    els.newTest.textContent = '次のテストを作る';
    updateModeUi();
    els.builder.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveResultImage() {
    if (typeof html2canvas !== 'function') return alert('画像保存機能を読み込めませんでした。');
    const original = els.screenshot.textContent;
    els.screenshot.disabled = true;
    els.screenshot.textContent = '画像を作成中…';
    try {
        const canvas = await html2canvas(els.resultSection, { backgroundColor: '#f8fafc', scale: Math.min(2, devicePixelRatio || 1), ignoreElements: el => el.classList.contains('screenshot-exclude') });
        const link = document.createElement('a');
        link.download = `clear-maker-2c-${state.studentId}-${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (error) {
        console.error(error);
        alert('結果画像を保存できませんでした。');
    } finally {
        els.screenshot.disabled = false;
        els.screenshot.textContent = original;
    }
}

function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('script,style,iframe,object,embed,form').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => Array.from(node.attributes).forEach(attr => {
        if (/^on/i.test(attr.name) || /javascript:/i.test(attr.value)) node.removeAttribute(attr.name);
    }));
    return template.innerHTML;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
