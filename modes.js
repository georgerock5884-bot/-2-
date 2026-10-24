/* ============================================================
   WORLD COUNTRY QUIZ — 追加モード
   1. 通常クイズの一時停止 / 保存 / 再開
   2. 世界地図 検索・図鑑（国名検索 / 地図クリックで首都・面積・公用語を表示）
   3. 全国回答チャレンジ（国名をタイピングして地図を赤く埋めていく）
   index.html の後（同じページ内）で読み込まれ、index.html 側の関数・変数を使います。
   ============================================================ */

/* ==================== OVERLAY ==================== */
function showOverlay(html){
  let r = document.getElementById("overlayRoot");
  if(!r){
    r = document.createElement("div");
    r.id = "overlayRoot";
    document.body.appendChild(r);
  }
  r.innerHTML = html;
}
function hideOverlay(){
  const r = document.getElementById("overlayRoot");
  if(r) r.innerHTML = "";
}

/* ==================== PAUSE / SAVE / RESUME (通常クイズ) ==================== */
const SAVED_QUIZ_KEY = "wcq_saved_quiz";

function pauseQuiz(){
  if(!quiz || quiz.paused || state.screen!=="quiz") return;
  quiz.paused = true;
  quiz.pausedAt = performance.now();
  if(autoAdvanceHandle){
    clearTimeout(autoAdvanceHandle);
    autoAdvanceHandle = null;
    quiz.advancePending = true;
  }
  const ae = document.activeElement;
  if(ae && ae.blur) ae.blur();
  showOverlay(`
  <div class="pause-cover">
    <div class="card pause-card">
      <p class="eyebrow">PAUSED</p>
      <h3>一時停止中</h3>
      <p>問題は隠してあります。タイマーも止まっています。<br>${quiz.results.length} / ${quiz.list.length} 問まで進んでいます。</p>
      <div class="pause-actions">
        <button class="btn btn-primary" onclick="resumeQuiz()">再開する</button>
        <button class="btn btn-gold" onclick="saveQuizAndExit()">保存してタイトルへ</button>
        <button class="btn btn-ghost" onclick="discardQuizAndExit()">破棄してタイトルへ</button>
      </div>
      <p class="pause-note">「保存」すると、ブラウザを閉じたあとでも、タイトル画面から続きを再開できます。</p>
    </div>
  </div>`);
}

function resumeQuiz(){
  if(!quiz || !quiz.paused) return;
  quiz.qStartTime += performance.now() - quiz.pausedAt;
  quiz.paused = false;
  quiz.pausedAt = null;
  hideOverlay();
  if(quiz.answered && quiz.advancePending){
    quiz.advancePending = false;
    autoAdvanceHandle = setTimeout(()=>{
      autoAdvanceHandle = null;
      if(quiz && quiz.answered && !quiz.paused && state.screen==="quiz") nextQuestion();
    }, 700);
  }else{
    const input = document.getElementById("answerInput");
    if(input && !input.disabled) input.focus();
  }
}

function saveQuizAndExit(){
  if(!quiz) return;
  const nextIndex = quiz.answered ? quiz.index + 1 : quiz.index;
  if(nextIndex >= quiz.list.length){
    // すでに全問回答済みなら、保存せずそのまま結果へ
    quiz.paused = false;
    hideOverlay();
    finishQuiz();
    return;
  }
  const data = {
    v: 1,
    difficulty: quiz.difficulty, format: quiz.format,
    askCapital: quiz.askCapital, answerMode: quiz.answerMode,
    list: quiz.list.map(c=>c.a3),
    index: nextIndex,
    results: quiz.results.map(r=>({ a3:r.country.a3, correct:r.correct, time:r.time, points:r.points, hints:r.hints||0 })),
    streak: quiz.streak, maxStreak: quiz.maxStreak,
    showFlag: quiz.showFlag,
    savedAt: Date.now()
  };
  try{
    localStorage.setItem(SAVED_QUIZ_KEY, JSON.stringify(data));
  }catch(e){
    alert("保存できませんでした（このブラウザでは保存領域が使えない状態です）。");
    return;
  }
  quiz = null;
  pendingDifficulty = null; pendingFormat = null;
  hideOverlay();
  go({ screen:"title" });
}

function discardQuizAndExit(){
  if(autoAdvanceHandle){ clearTimeout(autoAdvanceHandle); autoAdvanceHandle = null; }
  quiz = null;
  pendingDifficulty = null; pendingFormat = null;
  hideOverlay();
  go({ screen:"title" });
}

function getSavedQuiz(){
  try{
    const s = JSON.parse(localStorage.getItem(SAVED_QUIZ_KEY) || "null");
    if(!s || s.v!==1 || !Array.isArray(s.list) || !MODES[s.difficulty]) return null;
    return s;
  }catch(e){ return null; }
}
function clearSavedQuiz(){
  try{ localStorage.removeItem(SAVED_QUIZ_KEY); }catch(e){}
}
function discardSavedQuiz(){
  clearSavedQuiz();
  render();
}
function savedQuizLabel(s){
  return MODES[s.difficulty].label
    + (s.askCapital ? "・首都" : "")
    + (s.format==="flag" ? "・国旗" : "・地図")
    + (s.answerMode==="choice4" ? "・4択" : "・タイピング");
}

function resumeSavedQuiz(){
  const s = getSavedQuiz();
  if(!s) return;
  if(s.format==="map" && GEO_LOAD_STATE!=="ready"){
    pendingResume = true;
    go({ screen:"quiz" });
    loadGeoData();
    return;
  }
  const byA3 = {};
  ALL_COUNTRIES.forEach(c=>{ byA3[c.a3] = c; });
  const list = s.list.map(a=>byA3[a]).filter(Boolean);
  const results = (s.results || [])
    .map(r=>({ country:byA3[r.a3], correct:r.correct, time:r.time, points:r.points, hints:r.hints||0 }))
    .filter(r=>r.country);
  if(!list.length || s.index >= list.length){
    clearSavedQuiz();
    go({ screen:"title" });
    return;
  }
  const { pool } = buildQuestionList(s.difficulty, s.askCapital, s.format);
  quiz = {
    difficulty: s.difficulty, format: s.format, askCapital: s.askCapital, answerMode: s.answerMode,
    list, pool,
    index: s.index,
    results,
    streak: s.streak || 0, maxStreak: s.maxStreak || 0,
    qStartTime: performance.now(),
    answered: false,
    showFlag: s.showFlag !== false,
    hintsUsed: 0
  };
  setCurrentChoices();
  clearSavedQuiz();
  go({ screen:"quiz" });
}

/* ==================== 国名の検索（図鑑・全国回答で共通） ==================== */
function countryKeys(c){
  return [c.ja, ...(c.aliases || [])].map(normJa);
}
function findCountryExact(raw){
  const q = normJa(raw);
  if(!q) return null;
  const qEn = normName(raw);
  return ALL_COUNTRIES.find(c=>
    countryKeys(c).includes(q) || (qEn && normName(c.en) === qEn)
  ) || null;
}
function searchSuggestions(raw){
  const q = normJa(raw);
  const qEn = normName(raw);
  if(!q) return [];
  const scored = [];
  ALL_COUNTRIES.forEach(c=>{
    const keys = countryKeys(c);
    let score = null;
    if(keys.some(k=>k.startsWith(q))) score = 0;
    else if(keys.some(k=>k.includes(q))) score = 1;
    else if(qEn && normName(c.en).includes(qEn)) score = 2;
    if(score !== null) scored.push({ c, score });
  });
  scored.sort((a,b)=> a.score - b.score || a.c.ja.length - b.c.ja.length);
  return scored.slice(0, 8).map(x=>x.c);
}
function formatArea(a){
  if(a === undefined || a === null) return "不明";
  const s = a < 10 ? a.toLocaleString("ja-JP", { maximumFractionDigits:2 }) : Math.round(a).toLocaleString("ja-JP");
  return s + " km²";
}
function fmtClock(sec){
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

/* ==================== 地図の共通ヘルパー ==================== */
function registerLayer(feature, layer){
  const arr = layersByFeature.get(feature);
  if(arr) arr.push(layer); else layersByFeature.set(feature, [layer]);
}
function layersOfCountry(c){
  return (c && c._feature && layersByFeature.get(c._feature)) || [];
}
function worldView(){
  if(!map) return;
  try{ map.fitBounds([[-58,-180],[80,180]], { padding:[6,6], animate:false }); }catch(e){}
}
// いま表示している倍率で、その国の見た目の面積(px^2)と、いちばん大きい国土の位置を測る
function measureCountry(c){
  const matches = layersOfCountry(c);
  let total = 0, best = null;
  if(!map) return { matches, total, best };
  const view = map.getBounds();
  matches.forEach(l=>{
    outerRingsOf(l).forEach(ring=>{
      if(!ring.length) return;
      const b = ringBounds(ring);
      const sw = map.latLngToContainerPoint(b.getSouthWest());
      const ne = map.latLngToContainerPoint(b.getNorthEast());
      const area = Math.abs(ne.x - sw.x) * Math.abs(sw.y - ne.y);
      total += area;
      const ctr = b.getCenter();
      if(view.contains(ctr) && (!best || area > best.area)) best = { c:ctr, area };
    });
  });
  return { matches, total, best };
}

/* ==================== 世界地図 検索・図鑑 ==================== */
let explore = { selected:null };
let exploreDebounce = null;

function openExplore(){
  explore = { selected:null };
  go({ screen:"explore" });
  if(GEO_LOAD_STATE!=="ready" && GEO_LOAD_STATE!=="loading") loadGeoData();
}
function leaveMapScreen(){
  stopAllcTimer();
  hideOverlay();
  go({ screen:"title" });
}

function renderExplore(){
  return `
  <div class="quiz-head">
    <div class="quiz-head-left">
      <button class="btn-ghost small-btn" onclick="leaveMapScreen()">タイトルに戻る</button>
      <div class="qcount">世界地図 検索・図鑑</div>
    </div>
  </div>
  <div class="card" style="padding:12px;">
    <div class="search-wrap">
      <input id="exploreInput" class="search-input" type="text" placeholder="国名を入力（例：日本、ブラジル、ニュージーランド）" autocomplete="off" spellcheck="false" />
      <div id="exploreSuggest" class="suggest-list" style="display:none;"></div>
    </div>
    <div class="map-wrap tall">
      <div id="map"></div>
      <button class="recenter-btn" onclick="exploreResetView()">世界全体を表示</button>
    </div>
    <div id="infoPanel" class="info-panel"></div>
  </div>`;
}

function setupExplore(){
  ensureMap(exploreMapClick);
  const input = document.getElementById("exploreInput");
  if(input){
    input.addEventListener("input", onExploreInput);
    input.addEventListener("keydown", e=>{
      if(e.key==="Enter" && !e.isComposing && e.keyCode!==229){
        e.preventDefault();
        exploreEnter();
      }
    });
    input.addEventListener("blur", ()=>setTimeout(hideSuggest, 160));
    input.addEventListener("focus", ()=>{ if(input.value) onExploreInput(); });
  }
  if(explore.selected){
    if(input) input.value = explore.selected.ja;
    highlightAnswerOnMap(explore.selected);
    showInfo(explore.selected);
  }else{
    showInfoPlaceholder();
  }
}

function exploreResetView(){
  worldView();
  if(explore.selected) highlightAnswerOnMap(explore.selected);
}

function onExploreInput(){
  const input = document.getElementById("exploreInput");
  if(!input) return;
  const raw = input.value;
  clearTimeout(exploreDebounce);
  if(!normJa(raw) && !normName(raw)){ hideSuggest(); return; }
  showSuggest(searchSuggestions(raw));
  const exact = findCountryExact(raw);
  if(exact){
    exploreDebounce = setTimeout(()=>{
      if(input.value === raw) selectExplore(exact, { zoom:true });
    }, 250);
  }
}
function exploreEnter(){
  const input = document.getElementById("exploreInput");
  if(!input) return;
  clearTimeout(exploreDebounce);
  const raw = input.value;
  const exact = findCountryExact(raw);
  if(exact){ hideSuggest(); selectExplore(exact, { zoom:true }); return; }
  const sugg = searchSuggestions(raw);
  if(sugg.length){
    input.value = sugg[0].ja;
    hideSuggest();
    selectExplore(sugg[0], { zoom:true });
  }else{
    showSuggest([]);
  }
}

function showSuggest(list){
  const box = document.getElementById("exploreSuggest");
  if(!box) return;
  if(!list.length){
    box.innerHTML = `<div class="suggest-empty">該当する国がありません</div>`;
  }else{
    box.innerHTML = list.map(c=>`
      <button class="suggest-item" data-a3="${c.a3}" onmousedown="event.preventDefault(); pickSuggest(this.dataset.a3)">
        <span>${escapeHtml(c.ja)}</span><span class="suggest-en">${escapeHtml(c.en)}</span>
      </button>`).join("");
  }
  box.style.display = "block";
}
function hideSuggest(){
  const box = document.getElementById("exploreSuggest");
  if(box) box.style.display = "none";
}
function pickSuggest(a3){
  const c = ALL_COUNTRIES.find(x=>x.a3===a3);
  if(!c) return;
  const input = document.getElementById("exploreInput");
  if(input) input.value = c.ja;
  hideSuggest();
  selectExplore(c, { zoom:true });
}

function selectExplore(c, opts){
  explore.selected = c;
  if(opts && opts.zoom) zoomToRegion(c);
  highlightAnswerOnMap(c);
  showInfo(c);
}

function exploreMapClick(feature){
  const c = featureToCountry.get(feature);
  const input = document.getElementById("exploreInput");
  hideSuggest();
  if(!c){
    explore.selected = null;
    highlightAnswerOnMap(null);
    const name = feature && feature.properties && feature.properties.name;
    const panel = document.getElementById("infoPanel");
    if(panel) panel.innerHTML = `<div class="info-empty">この地域${name ? "（" + escapeHtml(name) + "）" : ""}は、このサイトの対象の197か国には含まれていません。</div>`;
    if(input) input.value = "";
    return;
  }
  if(input) input.value = c.ja;
  selectExplore(c, { zoom:false });
}

function showInfoPlaceholder(){
  const panel = document.getElementById("infoPanel");
  if(panel) panel.innerHTML = `<div class="info-empty">国名を検索するか、地図上の国をクリックすると、首都・面積・公用語が表示されます。</div>`;
}
function showInfo(c){
  const panel = document.getElementById("infoPanel");
  if(!panel) return;
  panel.innerHTML = `
    <div class="info-head">
      <img class="info-flag" src="https://flagcdn.com/w160/${c.a2}.png" onerror="this.replaceWith(flagFallbackEl('${c.a2}', true))" alt="${escapeHtml(c.ja)}の国旗">
      <div>
        <h3>${escapeHtml(c.ja)}</h3>
        <div class="info-en">${escapeHtml(c.en)}</div>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-cell"><div class="lbl">首都</div><div class="val">${escapeHtml(c.capitalDisplay || "不明")}</div></div>
      <div class="info-cell"><div class="lbl">面積</div><div class="val">${escapeHtml(formatArea(c.area))}</div></div>
      <div class="info-cell"><div class="lbl">公用語</div><div class="val">${escapeHtml(c.lang || "不明")}</div></div>
    </div>
    <div class="info-foot">面積は総面積の概数です。出典によって数値が異なる場合があります。</div>`;
}

/* ==================== 全国回答チャレンジ ==================== */
const ALLC_STATS_KEY = "wcq_allc_stats";
const CONT_ORDER = ["asia","europe","africa","north_america","south_america","oceania"];
const CONT_LABEL_JA = {
  asia:"アジア", europe:"ヨーロッパ", africa:"アフリカ",
  north_america:"北アメリカ", south_america:"南アメリカ", oceania:"オセアニア"
};

let allc = null;
let allcTimerHandle = null;
let allcMarkers = null, allcRing = null, allcLatestLayers = [];

function getAllcStats(){
  const empty = { plays:0, bestCount:0, bestCountTime:0, bestScore:0 };
  try{ return Object.assign(empty, JSON.parse(localStorage.getItem(ALLC_STATS_KEY) || "null") || {}); }
  catch(e){ return empty; }
}
function updateAllcStats(sum){
  const s = getAllcStats();
  s.plays += 1;
  const newCount = sum.count > s.bestCount || (sum.count === s.bestCount && sum.totalTime < s.bestCountTime);
  const newScore = sum.totalScore > s.bestScore;
  if(newCount){ s.bestCount = sum.count; s.bestCountTime = sum.totalTime; }
  if(newScore){ s.bestScore = sum.totalScore; }
  try{ localStorage.setItem(ALLC_STATS_KEY, JSON.stringify(s)); }catch(e){}
  return { newCount, newScore };
}

function startAllChallenge(){
  allc = { answered:new Map(), order:[], startTime:null, lastTime:null, points:0, finished:false };
  go({ screen:"allc" });
  if(GEO_LOAD_STATE!=="ready" && GEO_LOAD_STATE!=="loading") loadGeoData();
}

function renderAllc(){
  const total = ALL_COUNTRIES.length;
  return `
  <div class="quiz-head">
    <div class="quiz-head-left">
      <div class="qcount">全国回答チャレンジ</div>
    </div>
    <div class="stat-pill">
      <div class="allc-stat">回答 <b id="allcCount">${allc.answered.size}</b> / ${total}</div>
      <div class="allc-stat"><b id="allcPoints">${allc.points}</b>pt</div>
      <div class="timer" id="allcTimer">0:00</div>
      <button class="btn-danger-ghost" onclick="confirmFinishAllc()">終了する</button>
    </div>
  </div>
  <div class="card" style="padding:12px;">
    <div class="answer-row">
      <input id="allcInput" type="text" placeholder="国名を入力してEnter（例：日本）" autocomplete="off" spellcheck="false" />
      <button class="btn btn-primary" id="allcBtn" onclick="submitAllcAnswer()">回答</button>
    </div>
    <div id="allcMsg" class="allc-msg">思いつく国名を、ひたすら入力してみましょう。答えた国は地図で赤くなります。</div>
    <div class="map-wrap tall">
      <div id="map"></div>
      <button class="recenter-btn" onclick="worldView()">世界全体を表示</button>
    </div>
  </div>`;
}

function setupAllc(){
  ensureMap(null);
  allcMarkers = L.layerGroup().addTo(map);
  allcRing = null;
  allcLatestLayers = [];
  const lastA3 = allc.order[allc.order.length - 1];
  allc.answered.forEach((v, a3)=>paintAnsweredCountry(v.c, a3 === lastA3));
  if(!allc.startTime){ allc.startTime = allc.lastTime = performance.now(); }
  const input = document.getElementById("allcInput");
  if(input){
    input.addEventListener("input", ()=>input.classList.remove("wrong"));
    input.addEventListener("keydown", e=>{
      if(e.key==="Enter" && !e.isComposing && e.keyCode!==229){
        e.preventDefault();
        submitAllcAnswer();
      }
    });
    input.focus();
  }
  startAllcTimer();
}

function startAllcTimer(){
  stopAllcTimer();
  const tick = ()=>{
    const el = document.getElementById("allcTimer");
    if(!el || !allc || !allc.startTime || allc.finished) return;
    el.textContent = fmtClock((performance.now() - allc.startTime) / 1000);
  };
  tick();
  allcTimerHandle = setInterval(tick, 250);
}
function stopAllcTimer(){
  if(allcTimerHandle){ clearInterval(allcTimerHandle); allcTimerHandle = null; }
}

function setAllcMsg(text, kind){
  const el = document.getElementById("allcMsg");
  if(!el) return;
  el.textContent = text;
  el.className = "allc-msg" + (kind ? " " + kind : "");
}

function submitAllcAnswer(){
  if(!allc || allc.finished) return;
  const input = document.getElementById("allcInput");
  if(!input) return;
  const raw = input.value;
  if(!normJa(raw) && !normName(raw)) return;
  const c = findCountryExact(raw);
  if(!c){
    setAllcMsg("「" + raw.trim() + "」に該当する国が見つかりません", "ng");
    input.classList.add("wrong");
    input.select();
    return;
  }
  if(allc.answered.has(c.a3)){
    setAllcMsg("「" + c.ja + "」はもう答えています", "info");
    input.value = "";
    input.focus();
    return;
  }
  const now = performance.now();
  const gap = (now - allc.lastTime) / 1000;
  const pts = pointsForTime(gap);
  allc.answered.set(c.a3, { c, gap, points:pts });
  allc.order.push(c.a3);
  allc.points += pts;
  allc.lastTime = now;

  paintAnsweredCountry(c, true);
  const cnt = document.getElementById("allcCount");
  const pt = document.getElementById("allcPoints");
  if(cnt) cnt.textContent = allc.answered.size;
  if(pt) pt.textContent = allc.points;
  setAllcMsg(c.ja + "　+" + pts + "pt（" + gap.toFixed(1) + "秒）", "ok");
  input.value = "";
  input.classList.remove("wrong");
  input.focus();

  if(allc.answered.size >= ALL_COUNTRIES.length){
    setTimeout(finishAllChallenge, 700);
  }
}

// 答えた国を地図で赤くする。小さい国は面積が見えないので、赤い点（と最新の国には丸）を出す
function paintAnsweredCountry(c, latest){
  if(!map) return;
  const m = MAP_COLORS[THEME] || MAP_COLORS.dark;
  if(latest){
    allcLatestLayers.forEach(l=>{ if(l._path) l._path.classList.remove("country-target"); });
    allcLatestLayers = [];
    if(allcRing){ map.removeLayer(allcRing); allcRing = null; }
  }
  const ms = measureCountry(c);
  ms.matches.forEach(l=>{
    l.setStyle(targetStyle());
    l.bringToFront();
    if(latest && l._path){ l._path.classList.add("country-target"); allcLatestLayers.push(l); }
  });
  let pt = null;
  if(!ms.best){
    const fp = FALLBACK_POINTS[c.a3];
    if(fp) pt = L.latLng(fp[0], fp[1]);
  }else if(ms.total < SMALL_COUNTRY_AREA_PX){
    pt = ms.best.c;
  }
  if(pt){
    allcMarkers.addLayer(L.circleMarker(pt, {
      radius:4, color:m.targetColor, weight:1, fillColor:m.targetFill, fillOpacity:1, interactive:false
    }));
    if(latest){
      allcRing = L.circleMarker(pt, {
        radius:22, color:m.targetColor, weight:2, fill:false,
        dashArray:"4 5", className:"small-country-ring", interactive:false
      }).addTo(map);
    }
  }
}

function confirmFinishAllc(){
  if(!allc || allc.finished) return;
  const n = allc.answered.size;
  showOverlay(`
  <div class="modal-backdrop">
    <div class="card modal-card">
      <h3>チャレンジを終了しますか？</h3>
      <p>${n === 0 ? "まだ1か国も答えていません。このまま終了しますか？" : "いまの回答（" + n + "か国）で結果を表示します。"}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="hideOverlay(); const i=document.getElementById('allcInput'); if(i) i.focus();">続ける</button>
        <button class="btn btn-primary" onclick="finishAllChallenge()">終了して結果を見る</button>
      </div>
    </div>
  </div>`);
}

function finishAllChallenge(){
  if(!allc || allc.finished) return;
  hideOverlay();
  allc.finished = true;
  stopAllcTimer();
  const end = performance.now();
  const start = allc.startTime || end;
  const count = allc.answered.size;
  const gaps = [...allc.answered.values()].map(v=>v.gap);
  const totalTime = (end - start) / 1000;
  const summary = {
    count,
    total: ALL_COUNTRIES.length,
    totalScore: allc.points,
    totalTime,
    avgGap: count ? ((allc.lastTime - start) / 1000) / count : 0,
    fastest: gaps.length ? Math.min(...gaps) : 0
  };
  let rec = { newCount:false, newScore:false };
  if(count > 0){
    rec = updateAllcStats(summary);
    updateLifetimeStats({ totalScore:summary.totalScore, totalTime:summary.totalTime, correctCount:count, total:count });
  }
  go({ screen:"allresult", allSummary:summary, allRec:rec });
}

function renderAllResult(){
  const s = state.allSummary;
  const rec = state.allRec || {};
  const pct = s.total ? (s.count / s.total * 100) : 0;
  const answeredA3 = new Set(allc ? [...allc.answered.keys()] : []);
  const missed = ALL_COUNTRIES.filter(c=>!answeredA3.has(c.a3));

  const contRows = CONT_ORDER.map(k=>{
    const all = ALL_COUNTRIES.filter(c=>c.continent === k);
    const got = all.filter(c=>answeredA3.has(c.a3)).length;
    const miss = all.filter(c=>!answeredA3.has(c.a3));
    return `
    <div class="cont-block">
      <div class="cont-head"><span>${CONT_LABEL_JA[k]}</span><b>${got} / ${all.length}</b></div>
      ${miss.length ? `<div class="chip-list">${miss.map(c=>`<span class="chip">${escapeHtml(c.ja)}</span>`).join("")}</div>` : `<div class="cont-clear">すべて回答しました</div>`}
    </div>`;
  }).join("");

  const answeredChips = allc ? allc.order.map(a3=>{
    const v = allc.answered.get(a3);
    return `<span class="chip chip-ok">${escapeHtml(v.c.ja)}</span>`;
  }).join("") : "";

  return `
  <div class="result">
    <p class="eyebrow">RESULT — 全国回答チャレンジ</p>
    <h2>${s.count} <span style="font-size:.6em;color:var(--text-dim);">/ ${s.total} か国</span></h2>
    <div class="points-total">${s.totalScore} <span>pt</span></div>
    ${rec.newCount ? `<div class="new-best">最多回答数 更新</div>` : ``}
    ${rec.newScore ? `<div class="new-best" style="border-color:var(--gold); color:var(--gold);">最高ポイント 更新</div>` : ``}
  </div>
  <div class="stat-grid">
    <div class="card stat-cell"><div class="lbl">回答数</div><div class="val">${s.count}か国</div></div>
    <div class="card stat-cell"><div class="lbl">達成率</div><div class="val">${pct.toFixed(1)}%</div></div>
    <div class="card stat-cell"><div class="lbl">獲得ポイント</div><div class="val">${s.totalScore}pt</div></div>
    <div class="card stat-cell"><div class="lbl">合計時間</div><div class="val">${fmtMinSec(s.totalTime)}</div></div>
    <div class="card stat-cell"><div class="lbl">平均回答時間</div><div class="val">${s.avgGap.toFixed(2)}秒</div></div>
    <div class="card stat-cell"><div class="lbl">最速回答</div><div class="val">${s.fastest.toFixed(2)}秒</div></div>
  </div>
  <p class="eyebrow" style="margin-top:8px;">答えられなかった国（${missed.length}か国）</p>
  <div class="cont-wrap">${contRows}</div>
  ${answeredChips ? `<details class="answered-details"><summary>答えた国（回答順）</summary><div class="chip-list" style="margin-top:10px;">${answeredChips}</div></details>` : ``}
  <div class="result-actions">
    <button class="btn btn-gold" onclick="startAllChallenge()">もう一度挑戦する</button>
    <button class="btn btn-ghost" onclick="go({screen:'mypage'})">マイページ</button>
    <button class="btn btn-ghost" onclick="leaveMapScreen()">タイトルに戻る</button>
  </div>`;
}

/* ==================== タイトル画面・マイページ用のHTML部品 ==================== */
function savedBannerHtml(){
  const s = getSavedQuiz();
  if(!s) return "";
  const d = new Date(s.savedAt || Date.now());
  const dateStr = d.getFullYear() + "/" + (d.getMonth()+1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
  const done = (s.results || []).length;
  return `
  <div class="card saved-banner">
    <div class="saved-title">保存中のクイズがあります</div>
    <div class="saved-desc">${escapeHtml(savedQuizLabel(s))}　${done} / ${s.list.length}問まで終了（${dateStr} 保存）</div>
    <div class="saved-actions">
      <button class="btn btn-primary" onclick="resumeSavedQuiz()">続きから再開</button>
      <button class="btn btn-ghost" onclick="discardSavedQuiz()">破棄</button>
    </div>
  </div>`;
}

function toolsCardsHtml(){
  const st = getAllcStats();
  const total = ALL_COUNTRIES.length;
  const bestLine = st.plays
    ? "自己ベスト: 最多回答 " + st.bestCount + " / " + total + "か国 ／ 最高 " + st.bestScore + "pt"
    : "まだ記録がありません";
  return `
  <p class="eyebrow" style="margin-top:26px;">MAP TOOLS — 地図で調べる・遊ぶ</p>
  <div class="diff-grid tools-grid">
    <div class="card diff-card">
      <h3>世界地図 検索・図鑑</h3>
      <p>国名を検索するとその国が赤く光り、地図の下に首都・面積・公用語を表示します。地図の国をクリックしても調べられます。</p>
      <button class="btn btn-gold" style="margin-top:auto;" onclick="openExplore()">図鑑を開く</button>
    </div>
    <div class="card diff-card">
      <h3>全国回答チャレンジ</h3>
      <p>地図を見ながら、思いつく国名をひたすらタイピング。答えた国が赤く塗られていきます。回答数・時間・ポイントを競います。</p>
      <div class="best">${bestLine}</div>
      <button class="btn btn-primary" onclick="startAllChallenge()">挑戦する</button>
    </div>
  </div>`;
}

function allcMypageHtml(){
  const st = getAllcStats();
  const total = ALL_COUNTRIES.length;
  return `
  <p class="eyebrow" style="margin-top:26px;text-align:center;">ALL COUNTRIES CHALLENGE — 全国回答チャレンジ</p>
  <div class="stat-grid">
    <div class="card stat-cell"><div class="lbl">挑戦回数</div><div class="val">${st.plays}回</div></div>
    <div class="card stat-cell"><div class="lbl">最多回答数</div><div class="val">${st.bestCount} / ${total}か国</div></div>
    <div class="card stat-cell"><div class="lbl">最高ポイント</div><div class="val">${st.bestScore}pt</div></div>
  </div>
  <div class="sub" style="text-align:center;color:var(--text-dim);font-size:12px;">全国回答チャレンジの獲得ポイント・時間・回答数は、上の総計にも含まれています</div>`;
}

// 地図データが必要な画面（図鑑・全国回答）の読み込み状態に応じた表示切り替え
function mapScreenGate(fn){
  if(GEO_LOAD_STATE==="ready") return fn();
  if(GEO_LOAD_STATE==="error") return renderError();
  return renderLoading();
}
