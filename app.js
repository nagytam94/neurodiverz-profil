/* ============================================================================
   Neurodiverz profil-szűrő — alkalmazás-logika (v4, audit-javított)
   FONTOS: tájékoztató/önismereti eszköz. Az "egyetértési mutató" NEM valószínűség
   és NEM diagnózis — a válaszaid átlaga az adott témakörön, kalibrálatlan skálán.
   ============================================================================ */
"use strict";

const PER_PAGE = 14;
const LS_KEY   = "nd_profil_valaszok_v3";   // v3: reverse itemek + új id-séma
const LS_THEME = "nd_profil_tema";
const LS_MODE  = "nd_profil_mod_v2";

const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

const state = {
  answers: {},        // itemId -> 0..4 (nyers, NEM reverse-korrigált)
  page: 0,
  order: [],
  charts: {},
  register: "self",   // "self" | "proxy"
  ageGroup: "felnott",// felnott | serdulo | gyermek
  age: "",
  answerRegister: null, // melyik regiszterben adták a válaszokat
};

const AGE_LABEL = { felnott:"Felnőtt önbevallás", serdulo:"Serdülő önbevallás", gyermek:"Gyermekről, szülőként (megfigyelés)" };

/* ---------- segédek ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
const VALID_IDS = () => new Set(ITEMS.map(i=>i.id));

/* biztonságos localStorage (S8: blokkolt tároló — pl. Safari privát mód — ne dőljön el az app) */
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

/* reverse-korrigált érték egy itemhez */
function val(it){
  const raw = state.answers[it.id];
  if(raw==null) return null;
  return it.rev ? (4 - raw) : raw;
}

/* sávok — ILLUSZTRATÍV, nem kalibrált küszöbök (lásd disclaimer) */
function band(pct){
  if(pct >= 65) return {key:"magas",     label:"Magas egyetértés",     color:"#ef4444"};
  if(pct >= 45) return {key:"kozepes",   label:"Közepes egyetértés",   color:"#f59e0b"};
  if(pct >= 25) return {key:"alacsony",  label:"Alacsony egyetértés",  color:"#10b981"};
  return            {key:"minimalis", label:"Minimális egyetértés", color:"#94a3b8"};
}

/* round-robin interleave (de-priming) */
function buildOrder(){
  const byCond = {};
  CONDITIONS.forEach(c => byCond[c.c] = []);
  ITEMS.forEach(it => byCond[it.c].push(it));
  const max = Math.max(...Object.values(byCond).map(a=>a.length));
  const out = [];
  for(let k=0;k<max;k++) for(const c of CONDITIONS) if(byCond[c.c][k]) out.push(byCond[c.c][k]);
  return out;
}

/* ---------- perzisztencia ---------- */
function save(){ lsSet(LS_KEY, JSON.stringify({a:state.answers, reg:state.answerRegister})); }
function load(){
  try{
    const r = lsGet(LS_KEY); if(!r) return;
    const o = JSON.parse(r) || {};
    const valid = VALID_IDS();
    const raw = o.a || {};
    // id-migráció: csak a jelenlegi itemekhez tartozó válaszokat tartjuk meg
    state.answers = {};
    Object.keys(raw).forEach(k=>{ if(valid.has(k) && raw[k]!=null) state.answers[k]=raw[k]; });
    state.answerRegister = o.reg || null;
  }catch(e){ state.answers = {}; }
}

/* ---------- mód / életkor ---------- */
function applyMode(){
  const r = document.querySelector('input[name="lifestage"]:checked');
  state.ageGroup = r ? r.value : "felnott";
  state.register = state.ageGroup === "gyermek" ? "proxy" : "self";
  const ai = $("#ageInput");
  state.age = ai ? (ai.value||"").trim() : "";
  lsSet(LS_MODE, JSON.stringify({ageGroup:state.ageGroup, age:state.age}));
}
function restoreMode(){
  try{
    const m = JSON.parse(lsGet(LS_MODE)||"null"); if(!m) return;
    state.ageGroup = m.ageGroup || "felnott";
    state.age = m.age || "";
    state.register = state.ageGroup === "gyermek" ? "proxy" : "self";
    const r = document.querySelector(`input[name="lifestage"][value="${state.ageGroup}"]`);
    if(r) r.checked = true;
    if(m.age && $("#ageInput")) $("#ageInput").value = m.age;
  }catch(e){}
}

/* ---------- téma ---------- */
function initTheme(){
  let t = lsGet(LS_THEME);
  if(!t) t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark":"light";
  document.documentElement.setAttribute("data-theme", t);
  syncThemeIcon();
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";
  document.documentElement.setAttribute("data-theme", cur);
  lsSet(LS_THEME, cur);
  syncThemeIcon();
  if(!$("#screen-result").classList.contains("hidden")) renderCharts(computeScores());
}
function syncThemeIcon(){
  const dark = document.documentElement.getAttribute("data-theme")==="dark";
  const b = $("#themeBtn");
  b.textContent = dark ? "☀️" : "🌙";
  b.setAttribute("aria-pressed", dark ? "true":"false");
  b.setAttribute("aria-label", dark ? "Világos témára váltás" : "Sötét témára váltás");
}

/* ---------- képernyő-váltás ---------- */
function show(id){
  ["screen-intro","screen-test","screen-result"].forEach(s=>$("#"+s).classList.add("hidden"));
  $("#"+id).classList.remove("hidden");
  window.scrollTo({top:0, behavior: REDUCE ? "auto":"instant"});
}

/* ---------- teszt ---------- */
function startTest(reset){
  applyMode();
  // S9: ha van mentett válasz másik regiszterben, figyelmeztetés
  if(!reset && answeredCount()>0 && state.answerRegister && state.answerRegister!==state.register){
    const ok = confirm("A korábbi válaszaidat más kitöltési módban (felnőtt/serdülő vs. gyermek) adtad meg, mint a most kiválasztott. Ha más módban folytatod, a meglévő válaszok más megfogalmazás alá kerülnek.\n\nOK = a korábbi válaszok TÖRLÉSE és új kezdés ebben a módban.\nMégse = a kiválasztott módot visszaállítom a korábbira.");
    if(ok){ reset = true; }
    else {
      state.register = state.answerRegister;
      state.ageGroup = state.answerRegister==="proxy" ? "gyermek" : state.ageGroup;
      const r = document.querySelector(`input[name="lifestage"][value="${state.ageGroup}"]`); if(r) r.checked=true;
    }
  }
  if(reset){ state.answers={}; state.answerRegister=null; save(); }
  if(answeredCount()===0) state.answerRegister = state.register;
  state.page = 0;
  show("screen-test");
  renderPage();
}
function totalPages(){ return Math.ceil(state.order.length / PER_PAGE); }
function answeredCount(){
  const valid = VALID_IDS();
  return Object.keys(state.answers).filter(k=>valid.has(k) && state.answers[k]!=null).length;
}
function updateProgress(){
  const ans = answeredCount(), tot = state.order.length;
  const pct = (ans/tot*100).toFixed(1);
  const fill = $("#progFill"); fill.style.width = pct+"%";
  const bar = $("#progBar");
  if(bar){ bar.setAttribute("aria-valuenow", String(ans)); }
  $("#progText").textContent = `${ans} / ${tot} kérdés megválaszolva`;
}

function renderPage(){
  const tp = totalPages();
  state.page = clamp(state.page, 0, tp-1);
  const start = state.page*PER_PAGE;
  const slice = state.order.slice(start, start+PER_PAGE);
  updateProgress();
  $("#progStep").textContent = `${state.page+1}. lap / ${tp}`;

  const host = $("#questions");
  host.innerHTML = "";
  slice.forEach((it, i)=>{
    const gIdx = start+i+1;
    const cur = state.answers[it.id];
    // B2: natív fieldset + radiogroup + radio inputok (szemantika + billentyű-navigáció)
    const fs = document.createElement("fieldset");
    fs.className = "q" + (REDUCE ? "" : " fade-in") + (cur==null ? " unanswered":"");
    fs.dataset.id = it.id;
    fs.innerHTML =
      `<legend class="qtext"><span class="qnum">${gIdx}.</span>${it[state.register]}</legend>
       <div class="scale" role="radiogroup" aria-label="Mennyire jellemző: ${gIdx}. állítás">
         ${SCALE.map(s=>`
           <label class="opt${cur===s.v?" sel":""}">
             <input type="radio" name="q_${it.id}" value="${s.v}" ${cur===s.v?"checked":""}>
             <span class="dot" aria-hidden="true"></span><span class="opt-lab">${s.label}</span>
           </label>`).join("")}
       </div>`;
    fs.querySelectorAll('input[type="radio"]').forEach(inp=>{
      inp.addEventListener("change", ()=>selectAnswer(it.id, +inp.value, fs));
    });
    host.appendChild(fs);
  });

  $("#prevBtn").disabled = state.page===0;
  const last = state.page===tp-1;
  $("#nextBtn").classList.toggle("hidden", last);
  $("#finishBtn").classList.toggle("hidden", !last);
  $("#stepLabel").textContent = `Kérdések ${start+1}–${Math.min(start+PER_PAGE,tot())}`;
  // K13: fókusz a lap tetejére (a lépés-címsorra) lapváltás után
  const sl = $("#stepLabel"); sl.setAttribute("tabindex","-1"); sl.focus({preventScroll:false});
}
function tot(){ return state.order.length; }

function selectAnswer(id, v, qEl){
  state.answers[id] = v;
  if(state.answerRegister==null) state.answerRegister = state.register;
  save();
  if(qEl){
    qEl.classList.remove("unanswered","flag");
    qEl.querySelectorAll(".opt").forEach(o=>{
      const inp = o.querySelector("input");
      o.classList.toggle("sel", inp && +inp.value===v);
    });
  }
  updateProgress();
}

function nextPage(){ if(state.page<totalPages()-1){ state.page++; renderPage(); } }
function prevPage(){ if(state.page>0){ state.page--; renderPage(); } }

function tryFinish(){
  const missing = state.order.filter(it=>state.answers[it.id]==null);
  if(missing.length>0){
    const ok = confirm(`${missing.length} kérdés még nincs megválaszolva.\n\nA kihagyott kérdéseket a kiértékelés nem számolja be. Ha egy témakörnél túl sok a kihagyott válasz, a kiértékelés "kevés adat" jelzéssel jelöli.\n\nOK = eredmény megtekintése · Mégse = ugrás az első kihagyott kérdéshez.`);
    if(!ok){
      const idx = state.order.indexOf(missing[0]);
      state.page = Math.floor(idx/PER_PAGE);
      renderPage();
      requestAnimationFrame(()=>{
        const el = $(`.q[data-id="${missing[0].id}"]`);
        if(el){ el.classList.add("flag"); el.scrollIntoView({behavior: REDUCE?"auto":"smooth",block:"center"}); }
      });
      return;
    }
  }
  showResults();
}

/* ---------- pontozás ---------- */
const MIN_ANSWERED_FRAC = 0.5;   // K5: ennél kevesebb válasznál "kevés adat"

function computeScores(){
  const conds = CONDITIONS.map(c=>{
    const items = ITEMS.filter(i=>i.c===c.c);
    const answered = items.filter(i=>state.answers[i.id]!=null);
    const sum = answered.reduce((a,i)=>a+val(i),0);
    const pct = answered.length ? Math.round(sum/(answered.length*4)*100) : null;
    const lowData = answered.length < Math.ceil(items.length*MIN_ANSWERED_FRAC);
    return {...c, pct, answered:answered.length, total:items.length, lowData};
  });
  const domAgg = {};
  Object.keys(DOMAINS).forEach(d=>domAgg[d]={sum:0,n:0});
  ITEMS.forEach(i=>{ if(state.answers[i.id]!=null){ domAgg[i.d].sum+=val(i); domAgg[i.d].n++; }});
  const domains = Object.keys(DOMAINS).map(d=>({
    d, name:DOMAINS[d], pct: domAgg[d].n ? Math.round(domAgg[d].sum/(domAgg[d].n*4)*100) : 0
  }));
  // S5: válasz-érvényesség (straight-lining / túl kevés válasz)
  const allVals = ITEMS.filter(i=>state.answers[i.id]!=null).map(i=>state.answers[i.id]);
  const n = allVals.length;
  const mean = n ? allVals.reduce((a,b)=>a+b,0)/n : 0;
  const sd = n ? Math.sqrt(allVals.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n) : 0;
  const validity = {
    answered: n,
    fewAnswers: n < 30,
    straightLine: n >= 20 && sd < 0.5,   // alig változó válaszok
  };
  return {conds, domains, validity};
}

/* ---------- eredmény ---------- */
const SUBPROFILE_NOTE = {
  hiperlexia:"A hiperlexia jellemzően az autizmus-profil részeként értelmezhető (korai olvasás a szövegértés elmaradásával); emelkedett autizmus-profil nélkül ritkán önálló jelentőségű.",
  pda:"A PDA vitatott, nem önálló diagnózis; leginkább emelkedett autizmus-profil mellett értelmezhető mintázat.",
  te:"A „kétszeresen kivételes” nem diagnózis: a magas képesség és valamely tanulási/figyelmi eltérés EGYÜTTes jelenlétét írja le — egyedül nem értelmezhető.",
  spd:"A szenzoros feldolgozási eltérés nem önálló DSM-diagnózis; gyakran autizmus/ADHD részeként jelenik meg.",
};

function showResults(){
  const scores = computeScores();
  const valid = scores.conds.filter(c=>c.pct!=null && !c.lowData);
  const ranked = [...valid].sort((a,b)=>b.pct-a.pct);
  const asd = scores.conds.find(c=>c.c==="asd");
  const asdHigh = asd && asd.pct!=null && asd.pct>=45;

  const agL = AGE_LABEL[state.ageGroup] || "";
  $("#resultMode").textContent = `Kitöltés módja: ${agL}${state.age ? ` · Életkor: ${state.age}` : ""}`;

  // 0) érvényesség-figyelmeztetés
  const vWarn = [];
  if(scores.validity.fewAnswers) vWarn.push("Kevés megválaszolt kérdés — a profil bizonytalan. A teljes kitöltés pontosabb képet ad.");
  if(scores.validity.straightLine) vWarn.push("A válaszaid alig változtak (szinte minden kérdésre ugyanaz) — ilyenkor a profil félrevezető lehet.");
  const vEl = $("#validityWarn");
  if(vWarn.length){ vEl.classList.remove("hidden"); vEl.innerHTML = "⚠️ <b>Az eredmény értelmezéséhez:</b> "+vWarn.join(" "); }
  else vEl.classList.add("hidden");

  // distressz-kiemelés: magas OCD/PDA/mizofónia vagy érzelmi-szabályozási domén → krízis-útvonal előtérbe
  const erzDom = scores.domains.find(d=>d.d==="ERZ");
  const distress = valid.some(c=>["ocd","pda","mizofonia"].includes(c.c) && c.pct>=65) || (erzDom && erzDom.pct>=65);
  $("#distressCallout").classList.toggle("hidden", !distress);

  // 1) kiemelt profilok (közepes+), nem-formális konstruktum külön keretezve
  const top = ranked.filter(c=>c.pct>=45);
  const hl = $("#highlights");
  if(top.length){
    hl.innerHTML = top.map(c=>{
      const b = band(c.pct);
      const sub = (!c.formal && SUBPROFILE_NOTE[c.c]) ? SUBPROFILE_NOTE[c.c] : "";
      const condFlag = (["hiperlexia","pda"].includes(c.c) && !asdHigh)
        ? `<span class="formal-tag warn">⚠︎ Emelkedett autizmus-profil nélkül ez az érték önmagában kevéssé értelmezhető.</span>` : "";
      return `<div class="hl${c.formal?"":" hl-sub"}" style="--c:${c.color}">
        <h4><span>${c.name}</span> <span class="score">${c.pct}%</span></h4>
        <span class="bnd" style="background:${b.color}1f;color:${b.color}">${b.label}</span>
        <p>${c.desc}</p>
        ${c.formal?"":`<span class="formal-tag">⚠︎ Nem önálló klinikai diagnózis — tüneti mintázat.</span>`}
        ${sub?`<span class="formal-tag">${sub}</span>`:""}
        ${condFlag}
      </div>`;
    }).join("");
    $("#hlEmpty").classList.add("hidden");
  } else { hl.innerHTML=""; $("#hlEmpty").classList.remove("hidden"); }

  // 2) egyetértési sávok (S11: szöveges band-címke; sub-profil jelölés; kevés-adat szürkítve)
  const lowData = scores.conds.filter(c=>c.lowData && c.pct!=null);
  $("#bars").innerHTML = ranked.map(c=>{
    const b = band(c.pct);
    return `<div class="bar-row${c.formal?"":" sub"}">
      <div class="nm"><span class="swatch" style="background:${c.color}"></span>${c.name}${c.formal?"":' <span class="subdot" title="nem önálló diagnózis">◇</span>'}</div>
      <div class="bar-track"><div class="bar-val" style="width:${REDUCE?c.pct:0}%;background:${c.color}" data-w="${c.pct}"></div></div>
      <div class="bar-pct"><b style="color:${b.color}">${c.pct}%</b> <span class="bandlab">${b.label}</span></div>
    </div>`;
  }).join("") + (lowData.length ? `<p class="empty-soft">Kevés adat miatt nem értékelt: ${lowData.map(c=>c.name).join(", ")}.</p>` : "");
  if(!REDUCE) requestAnimationFrame(()=>$$("#bars .bar-val").forEach(el=>el.style.width=el.dataset.w+"%"));

  // 2.5) irodalmi viszonyítási küszöbök (csak ahol van validált cutoff + elég adat)
  const withCut = scores.conds.filter(c=>c.pct!=null && !c.lowData && c.cutoff!=null).sort((a,b)=>b.pct-a.pct);
  const noCut = scores.conds.filter(c=>c.cutoff==null).map(c=>c.name);
  $("#litAnchor").innerHTML = (withCut.length ? withCut.map(c=>{
    const over = c.pct >= c.cutoff;
    return `<div class="lit-row ${over?"over":"under"}">
      <div class="lit-nm">${c.name}</div>
      <div class="lit-track" role="img" aria-label="${c.name}: a te értéked ${c.pct}%, viszonyítási küszöb ${c.cutoff}%">
        <div class="lit-fill" style="width:${c.pct}%;background:${c.color}"></div>
        <div class="lit-cut" style="left:${c.cutoff}%"></div>
      </div>
      <div class="lit-stat"><b>${c.pct}%</b> · küszöb ≈ ${c.cutoff}% <span class="lit-flag ${over?"f-over":"f-under"}">${over?"✓ eléri/meghaladja":"alatta"}</span></div>
      <div class="lit-src">${c.cutoffNote}</div>
    </div>`;
  }).join("") : `<p class="empty-soft">A megválaszolt adatok alapján nincs megjeleníthető viszonyítás.</p>`)
   + (noCut.length ? `<p class="lit-none"><b>Nincs validált önszűrő küszöb</b> (csak tájékozódásra): ${noCut.join(", ")}.</p>` : "");

  // 3) kombináció (csak elég adatnál)
  const combos = COMBO_RULES.filter(r=>r.when.every(code=>{
    const c = valid.find(x=>x.c===code); return c && c.pct>=r.min;
  }));
  $("#combos").innerHTML = combos.length
    ? combos.map(r=>`<div class="note-box combo"><b>${r.title}</b><br>${r.text}</div>`).join("")
    : `<p class="empty-soft">Nincs egyértelmű többszörös (komorbid) mintázat a megadott válaszok alapján.</p>`;

  // 4) differenciál
  const diffs = DIFF_PAIRS.filter(p=>{
    const a=valid.find(x=>x.c===p.a), b=valid.find(x=>x.c===p.b);
    return a&&b&&a.pct>=45&&b.pct>=45;
  });
  $("#diffs").innerHTML = diffs.length
    ? diffs.map(p=>`<div class="note-box diff">${p.text}</div>`).join("")
    : `<p class="empty-soft">Nincs olyan emelkedett profilpár, amelynél a szakirodalom kifejezett elkülönítési nehézséget jelez.</p>`;

  // S10: szöveges (sr-only) alternatíva a grafikonokhoz
  $("#chartSrCond").innerHTML = "Állapot-profil egyetértési mutatói: " + ranked.map(c=>`${c.name} ${c.pct}% (${band(c.pct).label})`).join("; ") + ".";
  $("#chartSrDom").innerHTML  = "Tünet-domén egyetértési mutatói: " + scores.domains.map(d=>`${d.name} ${d.pct}%`).join("; ") + ".";

  show("screen-result");
  const h = $("#resultHeading"); if(h){ h.setAttribute("tabindex","-1"); h.focus({preventScroll:true}); }
  renderCharts(scores);
}

/* ---------- Chart.js radarok ---------- */
function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function renderCharts(scores, opts){
  const noAnim = (opts && opts.noAnim) || REDUCE;
  const grid = css("--border"), text = css("--text-soft"), acc = css("--accent");
  const ranked = [...scores.conds].filter(c=>c.pct!=null);
  const common = (lbls, data, color)=>({
    type:"radar",
    data:{ labels:lbls, datasets:[{ data, fill:true,
      backgroundColor: color+"22", borderColor: color, pointBackgroundColor: color,
      borderWidth:2, pointRadius:3, pointHoverRadius:5 }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.formattedValue}%`}}},
      scales:{ r:{ min:0, max:100, ticks:{stepSize:25, color:text, backdropColor:"transparent", font:{size:9}},
        grid:{color:grid}, angleLines:{color:grid}, pointLabels:{color:text, font:{size:10.5}} }},
      animation: noAnim ? false : {duration:700},
      // nyomtatáshoz felemelt pixel-arány → éles (nem elmosódott) radar a PDF-ben
      devicePixelRatio: (opts && opts.print) ? 3 : undefined,
    }
  });
  destroyChart("cond"); destroyChart("dom");
  const cv1=$("#chartCond"), cv2=$("#chartDom");
  cv1.setAttribute("role","img"); cv1.setAttribute("aria-label", $("#chartSrCond").textContent||"Állapot-profil radardiagram");
  cv2.setAttribute("role","img"); cv2.setAttribute("aria-label", $("#chartSrDom").textContent||"Domén-profil radardiagram");
  state.charts.cond = new Chart(cv1, common(ranked.map(c=>c.name), ranked.map(c=>c.pct), acc));
  state.charts.dom  = new Chart(cv2, common(scores.domains.map(d=>d.name), scores.domains.map(d=>d.pct), css("--accent-3")));
}
function destroyChart(k){ if(state.charts[k]){ state.charts[k].destroy(); state.charts[k]=null; } }

/* ---------- PDF export: natív nyomtatás ----------
   Korábban html2canvas+jsPDF futott, de a html2canvas 1.4.1 nem tudja a modern CSS-t
   (color-mix) → hibára futott és a téma beragadt. A böngésző natív Nyomtatás → „PDF-be
   mentés" megbízható, kijelölhető szövegű PDF-et ad; a megjelenést @media print intézi. */
function exportPDF(){
  const wasDark = document.documentElement.getAttribute("data-theme")==="dark";
  const origTitle = document.title;
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const nm = ($("#nameInput").value||"").trim();
  document.title = `neurodiverz-profil${nm?" - "+nm:""} - ${stamp}`;   // → alap PDF-fájlnév

  let restored = false;
  const restore = ()=>{
    if(restored) return; restored = true;
    window.removeEventListener("afterprint", restore);
    document.title = origTitle;
    if(wasDark) document.documentElement.setAttribute("data-theme","dark");
    // képernyős állapot visszaállítása: normál (animált, képernyő-DPR) grafikonok
    renderCharts(computeScores());
  };

  // 1) mindig világos téma nyomtatáshoz
  if(wasDark) document.documentElement.setAttribute("data-theme","light");
  // 2) a sávok álljanak teljes szélességre (ha az animáció még nem futott le, ne csonkoljon a PDF)
  $$("#bars .bar-val").forEach(el=>{ if(el.dataset.w) el.style.width=el.dataset.w+"%"; });
  // 3) statikus, felemelt DPR-ű radarok az éles nyomtatásért
  renderCharts(computeScores(), {noAnim:true, print:true});

  window.addEventListener("afterprint", restore);
  // a renderelés befejezésére hagyunk időt, majd nyomtatunk; a restore-t az afterprint hozza,
  // a hosszabb fallback csak akkor lép, ha az afterprint elmarad (nem minden böngésző adja ki)
  setTimeout(()=>{ window.print(); setTimeout(restore, 4000); }, 400);
}

/* ---------- dátum ---------- */
function stampDate(){
  const d=new Date();
  $("#resultDate").textContent = d.toLocaleDateString("hu-HU",{year:"numeric",month:"long",day:"numeric"});
}

/* ---------- init ---------- */
function init(){
  initTheme();
  load();
  state.order = buildOrder();
  stampDate();
  restoreMode();

  $("#themeBtn").addEventListener("click", toggleTheme);
  $("#startBtn").addEventListener("click", ()=>startTest(false));
  $("#restartBtn").addEventListener("click", ()=>{ if(confirm("Biztosan elölről kezded? A meglévő válaszok törlődnek.")) startTest(true); });
  $("#prevBtn").addEventListener("click", prevPage);
  $("#nextBtn").addEventListener("click", nextPage);
  $("#finishBtn").addEventListener("click", tryFinish);
  $("#backToTest").addEventListener("click", ()=>{ show("screen-test"); renderPage(); });
  $("#retakeBtn").addEventListener("click", ()=>{ if(confirm("Új kitöltés? A jelenlegi válaszok törlődnek.")) startTest(true); });
  $("#pdfBtn").addEventListener("click", exportPDF);

  if(answeredCount()>0){
    $("#resumeNote").classList.remove("hidden");
    $("#resumeCount").textContent = answeredCount();
    $("#startBtn").innerHTML = `Folytatás ▸`;
  }
}
document.addEventListener("DOMContentLoaded", init);
