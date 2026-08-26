const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwyvvIWBO6NxdNj3FE5DLXOBZdd3BqkHEv5VNiBU3NTSMSsp7qOBIIy957w31mol1mi/exec';
const DATA_URLS = ['./vocabulary-question.json', './vocabulary-questions.json'];
const DATA_BUNDLE_URL = './vocabulary-data.js?v=2.6.4';
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
    saveSetup: byId('save-setup-btn'), resetSetup: byId('reset-setup-btn'), settings: byId('settings-btn'), displayStudent: byId('display-student'), learnerRank: byId('learner-rank'), dataStatus: byId('data-status'),
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
    if (els.resetSetup) els.resetSetup.addEventListener('click', resetAllStudentData);
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

const VOCABULARY_CACHE_KEY = 'clear_maker_2c_vocab_cache_v3';
const VOCABULARY_VERSION_CACHE_KEY = 'clear_maker_2c_vocab_version';
const VOCABULARY_BLANK = '(　　　)';
const INVALID_VOCABULARY_QUESTION_IDS = new Set();

function normalizeVocabularyQuestionText(text) {
    return String(text || '')
        .replace(/\\n/g, '\n')
        .replace(/\(\[\[\s*[　　　]+\s*\]\]\)/g, VOCABULARY_BLANK)
        .replace(/\[\[\s*[　　　]+\s*\]\]/g, VOCABULARY_BLANK)
        .replace(/\(\[\s*[　　　]+\s*\]\)/g, VOCABULARY_BLANK)
        .replace(/\(\[\[[\s　㊥㤗㫟〛]*\]\]?\)/g, VOCABULARY_BLANK)
        .replace(/\[\[[\s　㊥㤗㫟〛]+\]\]/g, VOCABULARY_BLANK)
        .replace(/\(\s*[㊥㤗㫟]+\s*\)/g, VOCABULARY_BLANK)
        .replace(/\(\s*\)/g, VOCABULARY_BLANK);
}

function getVocabularyEnglishBody(text) {
    const lines = String(text || '').split('\n');
    const start = lines.findIndex((line, index) => {
        const beforeGlossary = line.split('【語句】')[0];
        return index > 0 && /[A-Za-z]/.test(beforeGlossary) && !/[ぁ-んァ-ヶ一-龯]/.test(beforeGlossary);
    });
    if (start < 0) return '';
    const endOffset = lines.slice(start).findIndex(line => /^【/.test(line.trim()));
    const end = endOffset < 0 ? lines.length : start + endOffset;
    return lines.slice(start, end).join(' ').split('【語句】')[0].trim();
}

function getVocabularyWordForms(word) {
    const irregular = {
        be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
        beat: ['beat', 'beaten'], become: ['became', 'become'], begin: ['began', 'begun'],
        break: ['broke', 'broken'], bring: ['brought'], build: ['built'], buy: ['bought'],
        catch: ['caught'], choose: ['chose', 'chosen'], come: ['came', 'come'], cost: ['cost'],
        cut: ['cut'], do: ['did', 'done'], drink: ['drank', 'drunk'], drive: ['drove', 'driven'],
        eat: ['ate', 'eaten'], fall: ['fell', 'fallen'], feed: ['fed'], feel: ['felt'], fight: ['fought'],
        find: ['found'], fly: ['flew', 'flown'], get: ['got', 'gotten'], give: ['gave', 'given'],
        go: ['went', 'gone'], grow: ['grew', 'grown'], have: ['has', 'had'], hear: ['heard'],
        keep: ['kept'], know: ['knew', 'known'], lay: ['laid'], leave: ['left'], lend: ['lent'],
        lose: ['lost'], make: ['made'], meet: ['met'], pay: ['paid'], put: ['put'], read: ['read'],
        ring: ['rang', 'rung'], run: ['ran', 'run'], say: ['said'], see: ['saw', 'seen'], send: ['sent'],
        sing: ['sang', 'sung'], sit: ['sat'], sleep: ['slept'], speak: ['spoke', 'spoken'],
        spend: ['spent'], stand: ['stood'], swim: ['swam', 'swum'], take: ['took', 'taken'],
        teach: ['taught'], tell: ['told'], think: ['thought'], throw: ['threw', 'thrown'],
        understand: ['understood'], wear: ['wore', 'worn'], win: ['won'], write: ['wrote', 'written'],
    };
    const forms = new Set();
    String(word || '').split(/\s*[,/]\s*/).forEach(option => {
        const base = option.trim().toLowerCase();
        if (!base) return;
        forms.add(base);
        (irregular[base] || []).forEach(form => forms.add(form));
        if (!/^[a-z]+$/.test(base)) return;
        forms.add(/(?:s|x|z|ch|sh|o)$/.test(base) ? `${base}es` : /[^aeiou]y$/.test(base) ? `${base.slice(0, -1)}ies` : `${base}s`);
        forms.add(/e$/.test(base) ? `${base}d` : /[^aeiou]y$/.test(base) ? `${base.slice(0, -1)}ied` : `${base}ed`);
        forms.add(/ie$/.test(base) ? `${base.slice(0, -2)}ying` : /e$/.test(base) && !/(?:ee|ye)$/.test(base) ? `${base.slice(0, -1)}ing` : `${base}ing`);
    });
    return forms;
}

function repairVocabularyQuestionText(item, text) {
    const lines = normalizeVocabularyQuestionText(text).split('\n');
    const start = lines.findIndex((line, index) => {
        const beforeGlossary = line.split('【語句】')[0];
        return index > 0 && /[A-Za-z]/.test(beforeGlossary) && !/[ぁ-んァ-ヶ一-龯]/.test(beforeGlossary);
    });
    if (start < 0) return lines.join('\n');
    const endOffset = lines.slice(start).findIndex(line => /^【/.test(line.trim()));
    const end = endOffset < 0 ? lines.length : start + endOffset;
    const rawEnglish = lines.slice(start, end).join('\n').replace(/（\s*　　　\s*）/g, VOCABULARY_BLANK);
    const glossaryIndex = rawEnglish.indexOf('【語句】');
    const trailingGlossary = glossaryIndex >= 0 ? rawEnglish.slice(glossaryIndex).trim() : '';
    let english = (glossaryIndex >= 0 ? rawEnglish.slice(0, glossaryIndex) : rawEnglish).trimEnd();
    const blankCount = (english.match(/\(　　　\)/g) || []).length;

    if (blankCount > 0) {
        english = english.replace(/\[\[|\]\]/g, '');
    } else {
        const forms = getVocabularyWordForms(item.word);
        const matches = Array.from(english.matchAll(/\[\[([^\]]+)\]\]/g));
        let selected = matches.find(match => {
            const candidate = match[1].trim().toLowerCase();
            if (forms.has(candidate)) return true;
            return Array.from(forms).some(form => new RegExp(`(^|\\s)${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i').test(candidate));
        });
        if (!selected) {
            const japaneseMatches = matches.filter(match => /[ぁ-んァ-ヶ一-龯]/.test(match[1]));
            if (japaneseMatches.length === 1) selected = japaneseMatches[0];
        }
        if (selected) {
            const selectedText = selected[1];
            let replacement = VOCABULARY_BLANK;
            const containedForm = Array.from(forms).find(form => new RegExp(`(^|\\s)${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i').test(selectedText));
            if (containedForm && selectedText.trim().toLowerCase() !== containedForm) {
                replacement = selectedText.replace(new RegExp(containedForm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), VOCABULARY_BLANK);
            }
            english = english.slice(0, selected.index) + replacement + english.slice(selected.index + selected[0].length);
        }
        english = english.replace(/\[\[|\]\]/g, '');
    }

    if (trailingGlossary) english += `\n${trailingGlossary}`;
    lines.splice(start, end - start, ...english.split('\n'));
    return lines.join('\n');
}

function prepareVocabularyQuestions(item) {
    if (!Array.isArray(item?.questions)) return [];
    return item.questions.map(question => {
        if (!question || !question.question_text) return null;
        return { ...question, question_text: repairVocabularyQuestionText(item, question.question_text) };
    }).filter(question => {
        if (!question || INVALID_VOCABULARY_QUESTION_IDS.has(question.id)) return false;
        const englishBody = getVocabularyEnglishBody(question.question_text);
        const blankCount = (englishBody.match(/\(　　　\)/g) || []).length;
        const phraseWordCount = String(item.word || '').trim().split(/\s+/).length;
        if (blankCount !== 1 && !(phraseWordCount > 1 && blankCount === phraseWordCount)) return false;
        if (/\[\[[^\]]*[A-Za-z][^\]]*\]\]/.test(englishBody)) return false;
        if (/[ぁ-んァ-ヶ一-龯]/.test(englishBody)) return false;
        if (/_{2,}/.test(englishBody)) return false;
        return true;
    });
}

async function fetchVocabularyDataVersion() {
    const response = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'getVocabularyVersion' }),
    });
    if (!response.ok) throw new Error(`教材バージョン確認 HTTP ${response.status}`);
    const data = await response.json();
    if (data?.status !== 'success' || !data.dataVersion) throw new Error('教材バージョンを取得できませんでした');
    return String(data.dataVersion);
}

async function loadVocabulary() {
    try {
        let source = null;
        let shouldDownload = false;

        // 1. ローカルキャッシュを読み込み、更新確認に失敗しても使える状態にする
        const cachedStr = localStorage.getItem(VOCABULARY_CACHE_KEY);
        if (cachedStr) {
            try {
                source = JSON.parse(cachedStr);
                if (!source || !source.items) source = null;
            } catch (err) {
                console.warn('キャッシュが無効です', err);
                localStorage.removeItem(VOCABULARY_CACHE_KEY);
                source = null;
            }
        }


        // 2. キャッシュがある場合は、軽量なバージョン情報だけをGASへ問い合わせる
        if (source && GAS_API_URL) {
            els.dataStatus.textContent = '教材データの更新を確認中…';
            try {
                const remoteVersion = await fetchVocabularyDataVersion();
                const cachedVersion = String(source.data_version || localStorage.getItem(VOCABULARY_VERSION_CACHE_KEY) || '');
                shouldDownload = !cachedVersion || cachedVersion !== remoteVersion;
            } catch (versionError) {
                console.warn('教材バージョンを確認できないため、保存済みデータを使用します:', versionError);
            }
        }

        // 3. 初回、またはサーバー側の問題データが更新された場合だけ全データを取得する
        if ((!source || shouldDownload) && GAS_API_URL) {
            els.dataStatus.textContent = source ? '最新版の教材データをダウンロード中…' : '初回データダウンロード中(約10秒)…';
            try {
                const response = await fetch(GAS_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ action: 'getVocabularyData' })
                });
                if (!response.ok) throw new Error(`教材データ取得 HTTP ${response.status}`);
                const resData = await response.json();
                if (resData && resData.status === 'success' && resData.data?.items) {
                    source = resData.data;
                    try {
                        localStorage.setItem(VOCABULARY_CACHE_KEY, JSON.stringify(source));
                        if (source.data_version) localStorage.setItem(VOCABULARY_VERSION_CACHE_KEY, String(source.data_version));
                    } catch (cacheErr) {
                        console.warn('キャッシュ保存容量オーバー:', cacheErr);
                    }
                } else {
                    throw new Error(resData?.error || '教材データを取得できませんでした');
                }
            } catch (downloadError) {
                if (!source) throw downloadError;
                console.warn('最新版を取得できないため、保存済みデータを使用します:', downloadError);
            }
        }

        if (!source || !source.items) throw new Error('教材データを取得できませんでした');

        let excludedQuestionCount = 0;
        state.vocabulary = Object.values(source.items || {}).map((item, index) => {
            const questions = prepareVocabularyQuestions(item);
            excludedQuestionCount += Math.max(0, (Array.isArray(item.questions) ? item.questions.length : 0) - questions.length);
            return {
                number: index + 1,
                wordId: item.word_id,
                word: String(item.word || '').trim(),
                questions,
            };
        }).filter(item => item.word && item.questions.length);

        if (!state.vocabulary.length) throw new Error('有効な問題がありません');

        els.rangeStart.max = state.vocabulary.length;
        els.rangeEnd.max = state.vocabulary.length;
        els.dataStatus.textContent = `${state.vocabulary.length.toLocaleString()}語・${state.vocabulary.reduce((sum, item) => sum + item.questions.length, 0).toLocaleString()}問`;
        els.dataStatus.title = excludedQuestionCount
            ? `準備完了（形式不良の${excludedQuestionCount.toLocaleString()}問を除外）`
            : '準備完了';
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

function resetAllStudentData() {
    const ok = confirm('⚠️ この端末に保存されている生徒情報・学習進捗・採点履歴・苦手リストをすべて初期化しますか？\n（最初からやり直すことができます）');
    if (!ok) return;

    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
                key.startsWith('clear_maker_') ||
                key === 'student_id' ||
                key === 'student_name'
            )) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));

        state.studentId = '';
        state.studentName = '';
        state.test = null;
        if (els.studentId) els.studentId.value = '';
        if (els.studentName) els.studentName.value = '';

        alert('端末の学習データを初期化しました。');
        location.reload();
    } catch (err) {
        console.error('Reset failed:', err);
        alert('初期化中にエラーが発生しました。ブラウザのサイトデータを消去してください。');
    }
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
        els.remedyCountLabel.textContent = `要復習: 残り ${activeWords.length}語`;
        els.remedyTest.classList.remove('hidden');
        els.remedyTest.disabled = false;
        els.remedyTest.textContent = `間違えた単語（${Math.min(20, activeWords.length)}問）をテストする`;
    } else {
        els.remedyCountLabel.textContent = '🎉 苦手単語をすべて克服しました！';
        els.remedyTest.disabled = true;
        els.remedyTest.classList.add('hidden');
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
    const targetPool = getActiveRemedyWords();
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
        remedyMode: true
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
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            alert('📷 カメラへのアクセスが許可されていません。\n\n【カメラの許可方法】\n・iPad / iPhone: アドレスバー左の「ぁあ(AA)」→「Webサイトの設定」→「カメラ」を【許可】にする（または端末の【設定】→【Safari】→【カメラ】）\n・Android / PC: アドレスバー左の鍵アイコン→「権限」→「カメラ」を【許可】にする\n\n※このまま「写真ライブラリ（アルバム）」から写真を選んで提出することもできます。');
        }
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
    const answerKey = state.test.questions.map(q => `${q.number}. ターゲット見出し語:「${q.answer}」 (問題文: ${q.text})`).join('\n');
    const prompt = `あなたは英単語テストの厳密かつ丁寧な採点・添削者です。
生徒は問題番号（1〜${state.test.questions.length}）とともに「英単語」または「英文」を手書きで書いています。
答案画像を正確に読み取り、下の【問題とターゲット語表】および各英文の文法・意味に照合して採点してください。

【採点ルール】
1. 表にある語は辞書の「見出し語」です。実際の正答は、各問題文の空欄に文法的・意味的に入る形を問題ごとに判断してください。
2. 生徒が「単語のみ（例: 1. accept）」を手書きしている場合も、「英文全体」を書いている場合も、どちらも正しく採点してください。
3. 大文字・小文字の違いは正解として扱ってください（文頭等の場合は補足でアドバイス）。
4. 時制、三単現、過去分詞、現在分詞、複数形、比較級・最上級など、英文が要求する正しい活用・語形を正解とします。見出し語の原形と綴りが異なっても、それを理由に不正解にしないでください。
5. 反対に、英文が過去形を要求するのに原形を書くなど、文脈に合わない語形は不正解です。
6. 見出し語が「a, an」「OK / O.K.」のようにカンマやスラッシュで区切られている場合は、文脈に合う候補を1つ正しく書けば正解です。
7. 複数語の見出し語では、すべての空欄を合わせてその語句を正しく完成できていれば正解です。
8. 正しい語形のスペルが1文字でも異なる、空欄、判読不能は不正解（×）です。
9. 単語の使い回し（同じ単語を複数の異なる問題に当てはめて書いている）や明らかなカンニングは不正解としてください。
10. 合格基準は90%以上（${state.test.questions.length}問中${Math.ceil(state.test.questions.length * 0.9)}問以上）の正解です。
11. ${state.test.questions.length}問すべてについて判定を出力してください。

【問題とターゲット語表】
${answerKey}

【出力フォーマット】
次の形式だけで日本語出力してください。

[判定]
合格 または 再チャレンジ
[得点]
正解数/${state.test.questions.length}
[詳細]
1. ○ 読み取り「...」 / 正答「...」
2. × 読み取り「...」 / 正答「...」
（全${state.test.questions.length}問を出力）
[ひとこと]
短く前向きなコメント。間違えた単語のスペルの注意点や覚え方のワンポイントアドバイス。`;

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
    const isResubmit = text.includes('再提出') && (text.includes('白紙') || text.includes('判読不能') || text.includes('関係ない画像'));
    if (isResubmit) {
        els.resultBadge.className = 'result-badge retry';
        els.resultBadge.textContent = '再提出';
        els.resultScore.textContent = 'ノーカウント';
        const details = text.replace(/\[判定\][\s\S]*?(?=\[得点\]|\[詳細\]|$)/, '').replace(/\[得点\][\s\S]*?(?=\[詳細\]|$)/, '').trim();
        els.resultContent.innerHTML = sanitizeHtml(marked.parse(details || text, { breaks: true }));
        const warning = document.createElement('div');
        warning.className = 'challenge-result locked';
        warning.innerHTML = `<strong>⚠️ 答案を正しく読み取れませんでした</strong><span>写真が不鮮明か、文字が判読できませんでした。ピントを合わせて再度撮影してください。</span>`;
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
    const btn = els.screenshot;
    if (!els.resultSection || els.resultSection.classList.contains('hidden')) {
        alert('保存する採点結果がありません。');
        return;
    }

    if (typeof html2canvas === 'undefined') {
        alert('画像生成ライブラリを読み込み中です。少し待ってから再度お試しください。');
        return;
    }

    const originalText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = '📸 画像を生成中…';
    }

    try {
        const target = els.resultSection;
        const studentInfo = (state.studentName || state.studentId || '生徒').replace(/[^\w\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff_-]/g, '_');
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        const fileName = `英単語採点結果_${studentInfo}_${dateStr}.png`;

        const canvas = await html2canvas(target, {
            scale: Math.min(2, window.devicePixelRatio || 2),
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            ignoreElements: el => el.classList.contains('screenshot-exclude') || el.id === 'screenshot-btn' || el.id === 'new-test-btn'
        });

        // 1. スマホの Web Share API (画像直接保存 / LINE共有等) を優先
        if (navigator.share && navigator.canShare) {
            try {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
                if (blob) {
                    const file = new File([blob], fileName, { type: 'image/png' });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: '英単語テスト採点結果',
                            text: `${state.studentName || '生徒'}さんの英単語テスト採点結果です。`
                        });
                        return;
                    }
                }
            } catch (shareErr) {
                if (shareErr.name === 'AbortError') return;
                console.warn('Web Share API error, falling back to download:', shareErr);
            }
        }

        // 2. PC / Web Share 非対応環境: ダウンロードリンクをトリガー
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (error) {
        console.error('画像保存エラー:', error);
        alert('画像の保存に失敗しました。端末のスクリーンショット機能もお試しください。');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
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
