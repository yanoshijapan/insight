/* ==========================================================================
   REELSIGHT — app.js
   Dashboard insight konten: OCR-assisted input + Google Sheet backend
   ========================================================================== */

/* ---------- Storage keys ---------- */
const LS_DRAFTS   = "reelsight_drafts_v1";       // array of saved (not-yet-sent) cards
const LS_FORMDRAFT= "reelsight_formdraft_v1";    // in-progress modal form (autosave)
const LS_SHEETCACHE = "reelsight_sheetcache_v1"; // last fetched data from spreadsheet

/* ---------- State ---------- */
let drafts = loadJSON(LS_DRAFTS, []);          
let sheetData = loadJSON(LS_SHEETCACHE, []);   
let currentEditId = null;                      
let currentImageDataUrl = null;                
let activeTab = "input";

/* ---------- Helpers ---------- */
function loadJSON(key, fallback){
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch(e){ return fallback; }
}
function saveJSON(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); }
  catch(e){ console.warn("Gagal menyimpan ke localStorage", e); }
}
function uid(){ return "d_" + Date.now() + "_" + Math.random().toString(36).slice(2,8); }
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

function toast(msg, type=""){
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> el.classList.remove("show"), 2600);
}

function flashSaved(){
  const el = $("#autosaveStatus");
  el.querySelector(".dot").style.background = "var(--amber)";
  el.lastChild.textContent = " Menyimpan...";
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(()=>{
    el.querySelector(".dot").style.background = "var(--teal)";
    el.lastChild.textContent = " Tersimpan otomatis";
  }, 500);
}

function fmtNum(n){
  n = Number(n) || 0;
  return n.toLocaleString("id-ID");
}
function fmtDate(d){
  if(!d) return "-";
  try{
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric" });
  }catch(e){ return d; }
}
function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

/* ==========================================================================
   TABS
   ========================================================================== */
$all(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    activeTab = btn.dataset.tab;
    $all(".tab-btn").forEach(b=>{ b.classList.toggle("active", b===btn); b.setAttribute("aria-selected", b===btn); });
    $("#panel-input").classList.toggle("hidden", activeTab!=="input");
    $("#panel-lihat").classList.toggle("hidden", activeTab!=="lihat");
    $("#appFooter").classList.toggle("hide", activeTab!=="input");
    
    // Otomatis fetch dari sheet dengan loading bar ketika membuka tab Lihat Insight
    if(activeTab === "lihat"){
      fetchSheetData();
    }
  });
});

/* ==========================================================================
   DRAFT CARDS — render, add, edit, delete
   ========================================================================== */
function renderDrafts(){
  const grid = $("#draftGrid");
  grid.querySelectorAll(".insight-card").forEach(n=>n.remove());
  $("#draftEmptyHint").hidden = drafts.length > 0;

  const ordered = [...drafts].sort((a,b)=> (b._createdAt||0) - (a._createdAt||0));
  ordered.forEach((d, i)=>{
    const card = buildCard(d, true);
    card.style.animationDelay = (i*0.04)+"s";
    grid.appendChild(card);
  });

  const badge = $("#pendingBadge");
  badge.hidden = drafts.length === 0;
  badge.textContent = drafts.length;
  $("#footerCount").textContent = drafts.length;
  $("#sendAllBtn").disabled = drafts.length === 0;
}

function buildCard(d, editable){
  const card = document.createElement("div");
  card.className = "insight-card";
  card.dataset.id = d.id;

  const img = d.image
    ? `<img class="thumb" src="${d.image}" alt="${escapeHtml(d.title||'insight')}">`
    : `<div class="thumb-fallback">🎬</div>`;

  let detailsHtml = "";
  if (!editable) {
    // Mode Detail Penuh untuk "Lihat Insight"
    detailsHtml = `
      ${d.script ? `<div class="card-script">${escapeHtml(d.script)}</div>` : ""}
      <div class="card-details-list">
        <div class="card-detail-item"><span>Durasi Video</span><b>${d.duration ? d.duration + ' dtk' : "-"}</b></div>
        <div class="card-detail-item"><span>Tayangan</span><b>${d.views || "-"}</b></div>
        <div class="card-detail-item"><span>Pemirsa</span><b>${d.reach || "-"}</b></div>
        <div class="card-detail-item"><span>Waktu Tonton (Rata-rata)</span><b>${d.watchtime ? d.watchtime + ' dtk' : "-"}</b></div>
        <div class="card-detail-item"><span>Suka</span><b>${fmtNum(d.likes)}</b></div>
        <div class="card-detail-item"><span>Komentar</span><b>${fmtNum(d.comments)}</b></div>
        <div class="card-detail-item"><span>Posting Ulang</span><b>${fmtNum(d.reposts)}</b></div>
        <div class="card-detail-item"><span>Dibagikan</span><b>${fmtNum(d.shares)}</b></div>
        <div class="card-detail-item"><span>Disimpan</span><b>${fmtNum(d.saves)}</b></div>
      </div>
      <div class="card-actions">
        <button class="card-copy" data-act="copy">📋 Salin Prompt Analisa</button>
      </div>
    `;
  } else {
    // Mode Draft Ringkas
    detailsHtml = `
      <div class="card-stats">
        <div class="card-stat"><b>${d.views || "0"}</b><span>Tayangan</span></div>
        <div class="card-stat"><b>${fmtNum(d.likes)}</b><span>Suka</span></div>
        <div class="card-stat"><b>${fmtNum(d.saves)}</b><span>Disimpan</span></div>
      </div>
      <div class="card-actions">
        <button class="card-edit" data-act="edit">✎ Edit</button>
        <button class="card-delete" data-act="delete">🗑 Hapus</button>
      </div>
    `;
  }

  card.innerHTML = `
    ${img}
    <div class="card-body">
      <div class="card-date">${fmtDate(d.posted)}</div>
      <div class="card-title">${escapeHtml(d.title || "(Tanpa judul)")}</div>
      ${detailsHtml}
    </div>
  `;

  if(d.image){
    card.querySelector(".thumb").addEventListener("click", ()=> openLightbox(d.image));
  }
  
  if(editable){
    card.querySelector('[data-act="edit"]').addEventListener("click", ()=> openModal(d.id));
    card.querySelector('[data-act="delete"]').addEventListener("click", ()=>{
      if(confirm(`Hapus insight "${d.title || 'ini'}"?`)){
        drafts = drafts.filter(x=>x.id !== d.id);
        saveJSON(LS_DRAFTS, drafts);
        flashSaved();
        renderDrafts();
        toast("Insight dihapus", "error");
      }
    });
  } else {
    // Fitur klik untuk Copy Text Template di Mode Lihat Insight
    const copyBtn = card.querySelector('[data-act="copy"]');
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const templateText = `Konten reels IG tanggal ${fmtDate(d.posted)}, dengan judul "${d.title || "-"}", memiliki naskah script :

"${d.script || "-"}", 

dan dengan durasi video ${d.duration || "-"} detik. 
Insight ini di unduh pada tanggal ${fmtDate(d.downloaded)} dan memperoleh insight sebagai berikut :
1. Tayangan : ${d.views || "-"}
2. Pemirsa : ${d.reach || "-"}
3. Waktu Tonton Rata-rata : ${d.watchtime || "-"}
4. Suka : ${fmtNum(d.likes)}
5. Komentar : ${fmtNum(d.comments)}
6. Posting Ulang : ${fmtNum(d.reposts)}
7. Dibagikan : ${fmtNum(d.shares)}
8. Disimpan : ${fmtNum(d.saves)}

Analisa mendalam dan beri penilaian terhadap performa konten ini. Berikan kesimpulan dari hasil analisa anda dan berikan ide dan saran untuk menjadi bahan evaluasi konten berikutnya.`;

        navigator.clipboard.writeText(templateText).then(() => {
          toast("Berhasil disalin! Siap di-paste ke ChatGPT/Claude", "success");
        }).catch(err => {
          console.error(err);
          toast("Gagal menyalin ke clipboard", "error");
        });
      });
    }
  }

  return card;
} // Akhir dari fungsi buildCard

/* ==========================================================================
   MODAL — open/close, image handling, autosave of in-progress form
   ========================================================================== */
const overlay = $("#modalOverlay");
// Mendaftarkan field "script" baru
const fields = ["title","script","posted","downloaded","caption","views","reach","duration","watchtime","likes","comments","reposts","shares","saves"];

function openModal(editId=null){
  currentEditId = editId;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";

  if(editId){
    const d = drafts.find(x=>x.id===editId);
    $("#modalTitle").textContent = "Edit Insight";
    fields.forEach(f=> $("#f_"+f).value = d[f] ?? "");
    setImage(d.image || null, false);
  } else {
    $("#modalTitle").textContent = "Tambah Insight Baru";
    const saved = loadJSON(LS_FORMDRAFT, null);
    if(saved && saved._id === "new-draft"){
      fields.forEach(f=> $("#f_"+f).value = saved[f] ?? "");
      setImage(saved.image || null, false);
    } else {
      fields.forEach(f=> $("#f_"+f).value = "");
      setImage(null, false);
    }
  }
  $("#f_title").focus();
}

function closeModal(){
  overlay.hidden = true;
  document.body.style.overflow = "";
  currentEditId = null;
  clearFormDraftAutosave();
}

$("#openAddModal").addEventListener("click", ()=> openModal(null));
$("#modalCloseBtn").addEventListener("click", closeModal);
$("#cancelModalBtn").addEventListener("click", closeModal);
overlay.addEventListener("click", (e)=>{ if(e.target === overlay) closeModal(); });
document.addEventListener("keydown", (e)=>{ if(e.key === "Escape" && !overlay.hidden) closeModal(); });

let formDraftTimer = null;
function scheduleFormDraftSave(){
  if(currentEditId) return; 
  clearTimeout(formDraftTimer);
  formDraftTimer = setTimeout(()=>{
    const obj = { _id: "new-draft" };
    fields.forEach(f=> obj[f] = $("#f_"+f).value);
    obj.image = currentImageDataUrl;
    saveJSON(LS_FORMDRAFT, obj);
    flashSaved();
  }, 400);
}
function clearFormDraftAutosave(){
  localStorage.removeItem(LS_FORMDRAFT);
}
fields.forEach(f=> $("#f_"+f).addEventListener("input", scheduleFormDraftSave));

/* ---------- Image upload / dropzone ---------- */
const dropzone = $("#dropzone");
const fileInput = $("#fileInput");

dropzone.addEventListener("click", ()=> fileInput.click());
dropzone.addEventListener("dragover", e=>{ e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", ()=> dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", e=>{
  e.preventDefault(); dropzone.classList.remove("dragover");
  if(e.dataTransfer.files[0]) handleImageFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", e=>{ if(e.target.files[0]) handleImageFile(e.target.files[0]); });

$("#replaceImgBtn").addEventListener("click", ()=> fileInput.click());
$("#removeImgBtn").addEventListener("click", ()=>{
  setImage(null, true);
  toast("Gambar dihapus");
});
$("#maximizeBtn").addEventListener("click", (e)=>{ e.stopPropagation(); openLightbox(currentImageDataUrl); });

function handleImageFile(file){
  if(!file.type.startsWith("image/")){ toast("File harus berupa gambar", "error"); return; }
  const reader = new FileReader();
  reader.onload = ()=>{
    setImage(reader.result, true);
    runScan();
  };
  reader.readAsDataURL(file);
}

function setImage(dataUrl, triggerAutosave){
  currentImageDataUrl = dataUrl;
  const empty = $("#dropzoneEmpty"), prev = $("#dropzonePreview"), actions = $("#dropzoneActions");
  const scanBtn = $("#scanBtn"), rescanBtn = $("#rescanBtn");
  if(dataUrl){
    empty.hidden = true;
    prev.hidden = false;
    $("#previewImg").src = dataUrl;
    actions.hidden = false;
    scanBtn.disabled = false;
  } else {
    empty.hidden = false;
    prev.hidden = true;
    actions.hidden = true;
    scanBtn.disabled = true;
    rescanBtn.hidden = true;
  }
  if(triggerAutosave) scheduleFormDraftSave();
}

/* ---------- Lightbox ---------- */
function openLightbox(src){
  if(!src) return;
  $("#lightboxImg").src = src;
  $("#lightbox").hidden = false;
}
$("#lightboxClose").addEventListener("click", ()=> $("#lightbox").hidden = true);
$("#lightbox").addEventListener("click", e=>{ if(e.target.id === "lightbox") $("#lightbox").hidden = true; });

/* ==========================================================================
   OCR SCAN
   ========================================================================== */
$("#scanBtn").addEventListener("click", runScan);
$("#rescanBtn").addEventListener("click", runScan);

async function runScan(){
  if(!currentImageDataUrl) return;
  const progWrap = $("#scanProgress"), bar = $("#scanProgressBar"), txt = $("#scanProgressText");
  const scanBtn = $("#scanBtn"), rescanBtn = $("#rescanBtn");

  scanBtn.disabled = true; scanBtn.hidden = true;
  rescanBtn.hidden = true;
  progWrap.hidden = false;
  bar.style.width = "4%";
  txt.textContent = "Menyiapkan pemindai...";

  try{
    const result = await Tesseract.recognize(currentImageDataUrl, "ind+eng", {
      logger: m=>{
        if(m.status === "recognizing text"){
          bar.style.width = Math.max(6, Math.round(m.progress*100)) + "%";
          txt.textContent = `Membaca gambar... ${Math.round(m.progress*100)}%`;
        } else if(m.status){
          txt.textContent = m.status.charAt(0).toUpperCase()+m.status.slice(1);
        }
      }
    });
    bar.style.width = "100%";
    txt.textContent = "Selesai membaca. Mengisi kolom...";
    applyParsedData(parseInsightText(result.data.text));
    toast("Pemindaian selesai — periksa kembali kolom yang terisi", "success");
  }catch(err){
    console.error(err);
    toast("Pemindaian gagal, isi kolom secara manual", "error");
  }finally{
    setTimeout(()=>{
      progWrap.hidden = true;
      scanBtn.hidden = false;
      scanBtn.disabled = false;
      rescanBtn.hidden = false;
    }, 500);
  }
}

function parseInsightText(raw){
  const text = raw.replace(/\r/g, "");
  const lines = text.split("\n").map(l=>l.trim()).filter(Boolean);
  const out = {};

  const monthMap = "Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des|January|February|March|April|May|June|July|August|September|October|November|December";
  const datePattern = new RegExp(`(\\d{1,2}\\s+(?:${monthMap})[a-z]*\\.?\\s+\\d{4}|\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})`, "i");

  out.posted = extractNear(lines, /post(ing)?|diposting/i, datePattern) ;
  out.downloaded = extractNear(lines, /diunduh|di ?unduh|unduh/i, datePattern);

  const capIdx = lines.findIndex(l=>/keterangan/i.test(l));
  if(capIdx !== -1){
    let cap = lines[capIdx].replace(/keterangan\s*[:\-]?/i, "").trim();
    if(!cap && lines[capIdx+1] && !/tayangan|pemirsa|waktu|suka|komentar/i.test(lines[capIdx+1])){
      cap = lines[capIdx+1];
    }
    out.caption = cap;
  }

  out.views = extractMetric(lines, /tayangan/i);
  out.reach = extractMetric(lines, /pemirsa/i);
  out.watchtime = extractMetric(lines, /waktu tonton|rata-?rata/i, /([\d.,]+)\s*(detik|s)?/i);

  out.likes    = extractInt(lines, /^suka\b|\bsuka$/i);
  out.comments = extractInt(lines, /komentar/i);
  out.reposts  = extractInt(lines, /posting ulang/i);
  out.shares   = extractInt(lines, /dibagikan|bagikan/i);
  out.saves    = extractInt(lines, /disimpan|simpan/i);

  return out;
}

function extractNear(lines, labelRe, valueRe){
  for(let i=0;i<lines.length;i++){
    if(labelRe.test(lines[i])){
      const window = (lines[i] + " " + (lines[i+1]||"") + " " + (lines[i+2]||""));
      const m = window.match(valueRe);
      if(m) return normalizeDate(m[0]);
    }
  }
  return "";
}

function extractMetric(lines, labelRe, customValRe){
  const valRe = customValRe || /([\d]{1,3}(?:[.,]\d{1,3})*)\s*(rb|jt|k)?/i;
  for(let i=0;i<lines.length;i++){
    if(labelRe.test(lines[i])){
      const window = lines[i] + " " + (lines[i+1]||"");
      const cleaned = window.replace(labelRe, "");
      const m = cleaned.match(valRe);
      if(m) return m[0].trim();
    }
  }
  return "";
}

function extractInt(lines, labelRe){
  for(let i=0;i<lines.length;i++){
    if(labelRe.test(lines[i])){
      const window = lines[i] + " " + (lines[i+1]||"");
      const m = window.match(/(\d[\d.,]*)/);
      if(m) return parseInt(m[1].replace(/[.,]/g,""), 10) || 0;
    }
  }
  return 0;
}

function normalizeDate(str){
  const months = {jan:1,feb:2,mar:3,apr:4,mei:5,may:5,jun:6,jul:7,agu:8,aug:8,sep:9,okt:10,oct:10,nov:11,des:12,dec:12};
  let m = str.match(/(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/);
  if(m){
    const mo = months[m[2].toLowerCase().slice(0,3)];
    if(mo) return `${m[3]}-${String(mo).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  }
  m = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if(m){
    let yr = m[3].length===2 ? "20"+m[3] : m[3];
    return `${yr}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  }
  return "";
}

function applyParsedData(data){
  Object.keys(data).forEach(k=>{
    const el = $("#f_"+k);
    if(!el) return;
    const val = data[k];
    if(val === "" || val === 0 && !["likes","comments","reposts","shares","saves"].includes(k)) {
      if(val === "" ) return; 
    }
    if(val !== "" && val !== undefined && val !== null){
      el.value = val;
      el.classList.add("filled");
      setTimeout(()=> el.classList.remove("filled"), 1200);
    }
  });
  scheduleFormDraftSave();
}

/* ==========================================================================
   SAVE CARD 
   ========================================================================== */
$("#saveCardBtn").addEventListener("click", ()=>{
  const title = $("#f_title").value.trim();
  if(!title){
    toast("Nama / judul konten wajib diisi", "error");
    $("#f_title").focus();
    return;
  }

  const payload = { title };
  fields.forEach(f=>{ if(f!=="title") payload[f] = $("#f_"+f).value.trim(); });
  payload.image = currentImageDataUrl;

  if(currentEditId){
    const idx = drafts.findIndex(x=>x.id===currentEditId);
    if(idx !== -1) drafts[idx] = { ...drafts[idx], ...payload };
    toast("Insight diperbarui", "success");
  } else {
    payload.id = uid();
    payload._createdAt = Date.now();
    drafts.push(payload);
    toast("Insight ditambahkan", "success");
  }

  saveJSON(LS_DRAFTS, drafts);
  flashSaved();
  renderDrafts();
  closeModal();
});

/* ==========================================================================
   SEND ALL TO SPREADSHEET
   ========================================================================== */
$("#sendAllBtn").addEventListener("click", sendAllToSheet);

async function sendAllToSheet(){
  if(drafts.length === 0) return;
  if(typeof APPS_SCRIPT_URL === "undefined" || APPS_SCRIPT_URL.includes("PASTE_URL")){
    toast("URL Apps Script belum di-set di config.js", "error");
    return;
  }
  const btn = $("#sendAllBtn");
  btn.disabled = true; btn.classList.add("sending");
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 11-3-6.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Mengirim...`;

  try{
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "append", rows: drafts })
    });
    const json = await res.json().catch(()=>({ ok:true }));
    if(json.ok === false) throw new Error(json.error || "Gagal mengirim");

    toast(`${drafts.length} insight berhasil dikirim ke spreadsheet`, "success");
    drafts = [];
    saveJSON(LS_DRAFTS, drafts);
    renderDrafts();
    sheetData = []; 
    saveJSON(LS_SHEETCACHE, sheetData);
  }catch(err){
    console.error(err);
    toast("Gagal mengirim ke spreadsheet. Cek koneksi / URL Apps Script.", "error");
  }finally{
    btn.disabled = drafts.length===0;
    btn.classList.remove("sending");
    btn.innerHTML = originalHtml;
  }
}

/* ==========================================================================
   LIHAT INSIGHT — fetch from sheet, filter, sort, render
   ========================================================================== */
async function fetchSheetData(){
  const statusEl = $("#sheetStatus");
  const loadingBar = $("#topLoadingBar");
  
  if(typeof APPS_SCRIPT_URL === "undefined" || APPS_SCRIPT_URL.includes("PASTE_URL")){
    statusEl.textContent = "URL Apps Script belum di-set di config.js — lihat README.";
    renderSheetGrid();
    return;
  }
  
  statusEl.textContent = "Memuat data dari spreadsheet...";
  if(loadingBar) loadingBar.hidden = false;
  
  try{
    const res = await fetch(APPS_SCRIPT_URL + "?action=list");
    const json = await res.json();
    sheetData = json.rows || [];
    saveJSON(LS_SHEETCACHE, sheetData);
    statusEl.textContent = `${sheetData.length} insight dimuat · diperbarui ${new Date().toLocaleTimeString("id-ID")}`;
  }catch(err){
    console.error(err);
    statusEl.textContent = "Gagal memuat dari spreadsheet — menampilkan data tersimpan terakhir.";
  }finally{
    if(loadingBar) loadingBar.hidden = true;
  }
  
  renderSheetGrid();
}
$("#refreshSheetBtn").addEventListener("click", fetchSheetData);

function parseFlexNumber(v){
  if(v === undefined || v === null) return 0;
  if(typeof v === "number") return v;
  const s = String(v).toLowerCase().replace(",", ".");
  const m = s.match(/([\d.]+)\s*(rb|jt|k)?/);
  if(!m) return 0;
  let n = parseFloat(m[1]) || 0;
  if(m[2] === "rb" || m[2] === "k") n *= 1000;
  if(m[2] === "jt") n *= 1000000;
  return n;
}

function renderSheetGrid(){
  const grid = $("#sheetGrid");
  grid.innerHTML = "";

  const kw = $("#searchInput").value.trim().toLowerCase();
  const from = $("#dateFrom").value;
  const to = $("#dateTo").value;
  const sortBy = $("#sortSelect").value;

  let list = sheetData.filter(d=>{
    if(kw && !(String(d.title||"").toLowerCase().includes(kw) || String(d.caption||"").toLowerCase().includes(kw) || String(d.script||"").toLowerCase().includes(kw))) return false;
    if(from && d.posted && d.posted < from) return false;
    if(to && d.posted && d.posted > to) return false;
    return true;
  });

  const sorters = {
    terbaru:  (a,b)=> (b._createdAt||0) - (a._createdAt||0),
    watchtime:(a,b)=> parseFlexNumber(b.watchtime) - parseFlexNumber(a.watchtime),
    likes:    (a,b)=> parseFlexNumber(b.likes) - parseFlexNumber(a.likes),
    views:    (a,b)=> parseFlexNumber(b.views) - parseFlexNumber(a.views),
    comments: (a,b)=> parseFlexNumber(b.comments) - parseFlexNumber(a.comments),
    saves:    (a,b)=> parseFlexNumber(b.saves) - parseFlexNumber(a.saves),
  };
  list = list.slice().sort(sorters[sortBy] || sorters.terbaru);

  $("#sheetEmptyHint").hidden = list.length > 0;
  list.forEach((d,i)=>{
    const card = buildCard(d, false);
    card.style.animationDelay = (i*0.03)+"s";
    grid.appendChild(card);
  });
}

["searchInput","dateFrom","dateTo","sortSelect"].forEach(id=>{
  $("#"+id).addEventListener("input", renderSheetGrid);
  $("#"+id).addEventListener("change", renderSheetGrid);
});

/* ==========================================================================
   PWA
   ========================================================================== */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => console.warn("SW gagal didaftarkan:", err));
  });
}

let deferredInstallPrompt = null;
const installBtn = $("#installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.hidden = false;
});

installBtn?.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  installBtn.hidden = true;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  toast(outcome === "accepted" ? "Aplikasi sedang di-install..." : "Instalasi dibatalkan");
  deferredInstallPrompt = null;
});

window.addEventListener("appinstalled", () => {
  installBtn.hidden = true;
  toast("Reelsight berhasil di-install", "success");
});

/* ==========================================================================
   INIT
   ========================================================================== */
renderDrafts();
