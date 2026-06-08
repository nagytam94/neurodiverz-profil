/* ============================================================================
   Neurodiverz profil-szűrő — alkalmazás-logika
   ============================================================================ */
"use strict";

const PER_PAGE = 14;
const LS_KEY = "nd_profil_valaszok_v2";
const LS_THEME = "nd_profil_tema";
const LS_MODE = "nd_profil_mod_v2";

const state = {
  answers: {},        // itemId -> 0..4
  page: 0,
  order: [],          // interleaved item list
  charts: {},
  register: "self",   // "self" | "proxy" — melyik megfogalmazás
  ageGroup: "felnott",// felnott | serdulo | gyermek
  age: "",
};

const AGE_LABEL = { felnott:"Felnőtt önbevallás", serdulo:"Serdülő önbevallás", gyermek:"Gyermekről, szülőként" };

function applyMode(){
  const r = document.querySelector('input[name="lifestage"]:checked');
  state.ageGroup = r ? r.value : "felnott";
  state.register = state.ageGroup === "gyermek" ? "proxy" : "self";
  const ai = $("#ageInput");
  state.age = ai ? (ai.value||"").trim() : "";
  try{ localStorage.setItem(LS_MODE, JSON.stringify({ageGroup:state.ageGroup, age:state.age})); }catch(e){}
}
function restoreMode(){
  try{
    const m = JSON.parse(localStorage.getItem(LS_MODE)||"null");
    if(!m) return;
    state.ageGroup = m.ageGroup || "felnott";
    state.age = m.age || "";
    state.register = state.ageGroup === "gyermek" ? "proxy" : "self";
    const r = document.querySelector(`input[name="lifestage"][value="${state.ageGroup}"]`);
    if(r) r.checked = true;
    if(m.age && $("#ageInput")) $("#ageInput").value = m.age;
  }catch(e){}
}

/* ---------- segédek ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const condOf = c => CONDITIONS.find(x => x.c === c);
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));

function band(pct){
  if(pct >= 65) return {key:"eros",     label:"Erős jelzés",      color:"#ef4444"};
  if(pct >= 45) return {key:"mersekelt",label:"Mérsékelt jelzés", color:"#f59e0b"};
  if(pct >= 25) return {key:"enyhe",    label:"Enyhe jelzés",     color:"#10b981"};
  return            {key:"minimalis",label:"Minimális jelzés", color:"#94a3b8"};
}

/* round-robin interleave az állapotok között (de-priming) */
function buildOrder(){
  const byCond = {};
  CONDITIONS.forEach(c => byCond[c.c] = []);
  ITEMS.forEach(it => byCond[it.c].push(it));
  const max = Math.max(...Object.values(byCond).map(a=>a.length));
  const out = [];
  for(let k=0;k<max;k++){
    for(const c of CONDITIONS){
      if(byCond[c.c][k]) out.push(byCond[c.c][k]);
    }
  }
  return out;
}

/* ---------- perzisztencia ---------- */
function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state.answers)); }catch(e){} }
function load(){ try{ const r=localStorage.getItem(LS_KEY); if(r) state.answers=JSON.parse(r)||{}; }catch(e){} }

/* ---------- téma ---------- */
function initTheme(){
  let t = localStorage.getItem(LS_THEME);
  if(!t) t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark":"light";
  document.documentElement.setAttribute("data-theme", t);
  syncThemeIcon();
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";
  document.documentElement.setAttribute("data-theme", cur);
  localStorage.setItem(LS_THEME, cur);
  syncThemeIcon();
  // ha eredmény látszik, rajzoljuk újra a grafikonokat a téma-színekkel
  if(!$("#screen-result").classList.contains("hidden")) renderCharts(computeScores());
}
function syncThemeIcon(){
  const dark = document.documentElement.getAttribute("data-theme")==="dark";
  $("#themeBtn").textContent = dark ? "☀️" : "🌙";
}

/* ---------- navigáció a képernyők között ---------- */
function show(id){
  ["screen-intro","screen-test","screen-result"].forEach(s=>$("#"+s).classList.add("hidden"));
  $("#"+id).classList.remove("hidden");
  window.scrollTo({top:0, behavior:"instant"});
}

/* ---------- teszt ---------- */
function startTest(reset){
  applyMode();
  if(reset){ state.answers={}; save(); }
  state.page = 0;
  show("screen-test");
  renderPage();
}
function totalPages(){ return Math.ceil(state.order.length / PER_PAGE); }
function answeredCount(){ return Object.keys(state.answers).filter(k=>state.answers[k]!=null).length; }

function renderPage(){
  const tp = totalPages();
  state.page = clamp(state.page, 0, tp-1);
  const start = state.page*PER_PAGE;
  const slice = state.order.slice(start, start+PER_PAGE);

  // progress
  const ans = answeredCount(), tot = state.order.length;
  $("#progFill").style.width = (ans/tot*100).toFixed(1)+"%";
  $("#progText").textContent = `${ans} / ${tot} kérdés megválaszolva`;
  $("#progStep").textContent = `${state.page+1}. lap / ${tp}`;

  // questions
  const host = $("#questions");
  host.innerHTML = "";
  slice.forEach((it, i)=>{
    const gIdx = start+i+1;
    const cur = state.answers[it.id];
    const q = document.createElement("div");
    q.className = "q fade-in" + (cur==null ? " unanswered":"");
    q.dataset.id = it.id;
    q.innerHTML = `
      <div class="qtext"><span class="qnum">${gIdx}.</span>${it[state.register]}</div>
      <div class="scale">
        ${SCALE.map(s=>`
          <div class="opt${cur===s.v?" sel":""}" data-v="${s.v}" role="button" tabindex="0" aria-label="${s.label}">
            <span class="dot"></span>${s.label}
          </div>`).join("")}
      </div>`;
    q.querySelectorAll(".opt").forEach(o=>{
      const handler = ()=>selectAnswer(it.id, +o.dataset.v, q);
      o.addEventListener("click", handler);
      o.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){e.preventDefault(); handler();}});
    });
    host.appendChild(q);
  });

  $("#prevBtn").disabled = state.page===0;
  const last = state.page===tp-1;
  $("#nextBtn").classList.toggle("hidden", last);
  $("#finishBtn").classList.toggle("hidden", !last);
  $("#stepLabel").textContent = `Kérdések ${start+1}–${Math.min(start+PER_PAGE,tot)}`;
}

function selectAnswer(id, v, qEl){
  state.answers[id] = v;
  save();
  if(qEl){
    qEl.classList.remove("unanswered","flag");
    qEl.querySelectorAll(".opt").forEach(o=>o.classList.toggle("sel", +o.dataset.v===v));
  }
  const ans = answeredCount(), tot = state.order.length;
  $("#progFill").style.width = (ans/tot*100).toFixed(1)+"%";
  $("#progText").textContent = `${ans} / ${tot} kérdés megválaszolva`;
}

function nextPage(){ if(state.page<totalPages()-1){ state.page++; renderPage(); } }
function prevPage(){ if(state.page>0){ state.page--; renderPage(); } }

function tryFinish(){
  const missing = state.order.filter(it=>state.answers[it.id]==null);
  if(missing.length>0){
    const ok = confirm(`${missing.length} kérdés még nincs megválaszolva.\n\nA kihagyott kérdéseket a kiértékelés nem számolja be (nem rontják a profilt). Biztosan megnézed az eredményt?\n\n(Mégse = visszalépés az első kihagyott kérdéshez.)`);
    if(!ok){
      const idx = state.order.indexOf(missing[0]);
      state.page = Math.floor(idx/PER_PAGE);
      renderPage();
      requestAnimationFrame(()=>{
        const el = $(`.q[data-id="${missing[0].id}"]`);
        if(el){ el.classList.add("flag"); el.scrollIntoView({behavior:"smooth",block:"center"}); }
      });
      return;
    }
  }
  showResults();
}

/* ---------- pontozás ---------- */
function computeScores(){
  // állapot-pontszámok (kihagyott itemek nem számítanak a nevezőbe)
  const conds = CONDITIONS.map(c=>{
    const items = ITEMS.filter(i=>i.c===c.c);
    const answered = items.filter(i=>state.answers[i.id]!=null);
    const sum = answered.reduce((a,i)=>a+state.answers[i.id],0);
    const pct = answered.length ? Math.round(sum/(answered.length*4)*100) : null;
    return {...c, pct, answered:answered.length, total:items.length};
  });
  // domén-pontszámok
  const domAgg = {};
  Object.keys(DOMAINS).forEach(d=>domAgg[d]={sum:0,n:0});
  ITEMS.forEach(i=>{ if(state.answers[i.id]!=null){ domAgg[i.d].sum+=state.answers[i.id]; domAgg[i.d].n++; }});
  const domains = Object.keys(DOMAINS).map(d=>({
    d, name:DOMAINS[d],
    pct: domAgg[d].n ? Math.round(domAgg[d].sum/(domAgg[d].n*4)*100) : 0
  }));
  return {conds, domains};
}

/* ---------- eredmény render ---------- */
function showResults(){
  const scores = computeScores();
  const ranked = [...scores.conds].filter(c=>c.pct!=null).sort((a,b)=>b.pct-a.pct);
  const agL = AGE_LABEL[state.ageGroup] || "";
  $("#resultMode").textContent = `Kitöltés módja: ${agL}${state.age ? ` · Életkor: ${state.age}` : ""}`;

  // 1) kiemelt profilok (mérsékelt+)
  const top = ranked.filter(c=>c.pct>=45);
  const hl = $("#highlights");
  if(top.length){
    hl.innerHTML = top.map(c=>{
      const b = band(c.pct);
      return `<div class="hl" style="--c:${c.color}">
        <h4>${c.name} <span class="score">${c.pct}%</span></h4>
        <span class="bnd" style="background:${b.color}1f;color:${b.color}">${b.label}</span>
        <p>${c.desc}</p>
        ${c.formal?"":`<span class="formal-tag">⚠︎ Nem önálló klinikai diagnózis — tüneti mintázat.</span>`}
      </div>`;
    }).join("");
    $("#hlEmpty").classList.add("hidden");
  } else {
    hl.innerHTML = "";
    $("#hlEmpty").classList.remove("hidden");
  }

  // 2) valószínűség-sávok (mind, csökkenő)
  $("#bars").innerHTML = ranked.map(c=>{
    const b = band(c.pct);
    return `<div class="bar-row">
      <div class="nm"><span class="swatch" style="background:${c.color}"></span>${c.name}
        ${c.answered<c.total?`<small>(${c.answered}/${c.total})</small>`:""}</div>
      <div class="bar-track"><div class="bar-val" style="width:0%;background:${c.color}" data-w="${c.pct}"></div></div>
      <div class="bar-pct" style="color:${b.color}">${c.pct}%</div>
    </div>`;
  }).join("");
  requestAnimationFrame(()=>$$("#bars .bar-val").forEach(el=>el.style.width=el.dataset.w+"%"));

  // 3) kombináció-jelzések
  const combos = COMBO_RULES.filter(r=>r.when.every(code=>{
    const c = ranked.find(x=>x.c===code); return c && c.pct>=r.min;
  }));
  $("#combos").innerHTML = combos.length
    ? combos.map(r=>`<div class="note-box combo"><b>${r.title}</b><br>${r.text}</div>`).join("")
    : `<p class="empty-soft">Nincs egyértelmű többszörös (komorbid) mintázat a megadott válaszok alapján.</p>`;

  // 4) differenciál figyelmeztetések
  const diffs = DIFF_PAIRS.filter(p=>{
    const a=ranked.find(x=>x.c===p.a), b=ranked.find(x=>x.c===p.b);
    return a&&b&&a.pct>=45&&b.pct>=45;
  });
  $("#diffs").innerHTML = diffs.length
    ? diffs.map(p=>`<div class="note-box diff">${p.text}</div>`).join("")
    : `<p class="empty-soft">Nincs olyan emelkedett profilpár, amelynél a szakirodalom kifejezett elkülönítési nehézséget jelez.</p>`;

  show("screen-result");
  renderCharts(scores);
}

/* ---------- Chart.js radarok ---------- */
function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function renderCharts(scores){
  const grid = css("--border"), text = css("--text-soft"), acc = css("--accent");
  const ranked = [...scores.conds].filter(c=>c.pct!=null);
  const common = (lbls, data, color)=>({
    type:"radar",
    data:{ labels:lbls, datasets:[{
      data, fill:true,
      backgroundColor: color+"22", borderColor: color, pointBackgroundColor: color,
      borderWidth:2, pointRadius:3, pointHoverRadius:5,
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.formattedValue}%`}}},
      scales:{ r:{
        min:0, max:100, ticks:{stepSize:25, color:text, backdropColor:"transparent", font:{size:9}},
        grid:{color:grid}, angleLines:{color:grid},
        pointLabels:{color:text, font:{size:10.5}}
      }},
      animation:{duration:700},
    }
  });

  destroyChart("cond"); destroyChart("dom");
  state.charts.cond = new Chart($("#chartCond"), common(
    ranked.map(c=>c.name), ranked.map(c=>c.pct), acc));
  state.charts.dom = new Chart($("#chartDom"), common(
    scores.domains.map(d=>d.name), scores.domains.map(d=>d.pct), css("--accent-3")));
}
function destroyChart(k){ if(state.charts[k]){ state.charts[k].destroy(); state.charts[k]=null; } }

/* ---------- PDF export ---------- */
async function exportPDF(){
  const btn = $("#pdfBtn");
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> PDF készítése…`;
  const node = $("#resultCard");
  const wasDark = document.documentElement.getAttribute("data-theme")==="dark";
  try{
    if(wasDark){ document.documentElement.setAttribute("data-theme","light"); renderCharts(computeScores()); await new Promise(r=>setTimeout(r,450)); }
    node.classList.add("pdf-mode");
    const canvas = await html2canvas(node, {scale:2, backgroundColor:"#ffffff", useCORS:true, logging:false});
    node.classList.remove("pdf-mode");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p","mm","a4");
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgW = pw - margin*2;
    const imgH = canvas.height * imgW / canvas.width;
    let left = imgH, pos = margin;
    const img = canvas.toDataURL("image/jpeg",0.92);
    pdf.addImage(img, "JPEG", margin, pos, imgW, imgH);
    left -= (ph - margin*2);
    while(left > 0){
      pdf.addPage();
      pos = margin - (imgH - left);
      pdf.addImage(img, "JPEG", margin, pos, imgW, imgH);
      left -= (ph - margin*2);
    }
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const nm = ($("#nameInput").value||"").trim().replace(/[^\p{L}\p{N}_-]+/gu,"_");
    pdf.save(`neurodiverz-profil_${nm?nm+"_":""}${stamp}.pdf`);
  }catch(e){
    alert("A PDF készítése nem sikerült: "+e.message+"\n\nTipp: használhatod a böngésző Nyomtatás → PDF-be mentés funkcióját is.");
  }finally{
    if(wasDark){ document.documentElement.setAttribute("data-theme","dark"); renderCharts(computeScores()); }
    btn.disabled=false; btn.innerHTML=orig;
  }
}

/* ---------- dátum az eredményen ---------- */
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

  // ha van mentett, jelezzük az intro gombon
  const ans = answeredCount();
  if(ans>0){
    $("#resumeNote").classList.remove("hidden");
    $("#resumeCount").textContent = ans;
    $("#startBtn").innerHTML = `Folytatás ▸`;
  }
}
document.addEventListener("DOMContentLoaded", init);
