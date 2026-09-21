/* ==========================================================================
   REELSIGHT — app.js (Insight Reels, Carousel & Planner)
   ========================================================================== */

const LS_DRAFTS = "reelsight_drafts_v3";       
const LS_FORMDRAFT = "reelsight_formdraft_v3";    
const LS_SHEETCACHE = "reelsight_sheetcache_v3"; 
const LS_PLANNER_DATA = "reelsight_planner_v1";
const LS_PLANNER_DRAFT = "reelsight_planner_form_v1";

let drafts = loadJSON(LS_DRAFTS, []);          
let sheetData = loadJSON(LS_SHEETCACHE, []);   
let plannerData = loadJSON(LS_PLANNER_DATA, []);
let currentEditId = null;                      
let plannerEditId = null;
let currentImageDataUrl = null;                
let activeTab = "input";

function loadJSON(key, fallback){ try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }catch(e){ return fallback; } }
function saveJSON(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }
function uid(){ return "d_" + Date.now() + "_" + Math.random().toString(36).slice(2,8); }
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

function toast(msg, type=""){
  const el = $("#toast");
  if(!el) return;
  el.textContent = msg; el.className = "toast show " + type;
  clearTimeout(toast._t); toast._t = setTimeout(()=> el.classList.remove("show"), 2600);
}

function flashSaved(){
  const el = $("#autosaveStatus");
  if(!el) return;
  el.querySelector(".dot").style.background = "var(--amber)"; el.lastChild.textContent = " Menyimpan...";
  clearTimeout(flashSaved._t); flashSaved._t = setTimeout(()=>{ el.querySelector(".dot").style.background = "var(--teal)"; el.lastChild.textContent = " Tersimpan otomatis"; }, 500);
}
function fmtNum(n){ return (Number(n) || 0).toLocaleString("id-ID"); }
function fmtDate(d){
  if(!d) return "-";
  try{ return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric" }); } catch(e){ return d; }
}

// Lightbox logic
const lightbox = $("#lightbox");
const lightboxImg = $("#lightboxImg");
function openLightbox(src){
  if(!src || !lightboxImg) return;
  lightboxImg.src = src;
  if(lightbox) lightbox.hidden = false;
}
$("#lightboxClose")?.addEventListener("click", ()=> { if(lightbox) lightbox.hidden = true; });
lightbox?.addEventListener("click", e => { if(e.target.id === "lightbox") lightbox.hidden = true; });

// Tab Switching
$all(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    activeTab = btn.dataset.tab;
    $all(".tab-btn").forEach(b=>{ b.classList.toggle("active", b===btn); });
    $("#panel-input")?.classList.toggle("hidden", activeTab!=="input");
    $("#panel-lihat")?.classList.toggle("hidden", activeTab!=="lihat");
    $("#panel-planner")?.classList.toggle("hidden", activeTab!=="planner");
    $("#appFooter")?.classList.toggle("hide", activeTab!=="input");
    
    if(activeTab === "lihat") fetchSheetData();
    if(activeTab === "planner" && plannerData.length === 0) fetchPlannerData(); 
  });
});

/* ==========================================================================
   INSIGHT LOGIC
   ========================================================================== */
function renderDrafts(){
  const grid = $("#draftGrid");
  if(!grid) return;
  
  grid.querySelectorAll(".insight-card").forEach(n=>n.remove());
  
  [...drafts].sort((a,b)=> (b._createdAt||0) - (a._createdAt||0)).forEach((d, i)=>{
    const card = buildCard(d, true); card.style.animationDelay = (i*0.04)+"s"; grid.appendChild(card);
  });
  
  const badge = $("#pendingBadge"); 
  if(badge) { badge.hidden = drafts.length === 0; badge.textContent = drafts.length; }
  const footerCount = $("#footerCount");
  if(footerCount) footerCount.textContent = drafts.length; 
  const sendBtn = $("#sendAllBtn");
  if(sendBtn) sendBtn.disabled = drafts.length === 0;
}

function buildCard(d, editable){
  const card = document.createElement("div");
  card.className = `insight-card type-${d.type || 'reels'}`;
  const img = d.image ? `<img class="thumb" src="${d.image}" style="cursor:zoom-in;">` : `<div class="thumb-fallback">🎬</div>`;
  
  let detailsHtml = "";
  if (editable) {
    detailsHtml = `
      <div class="card-stats">
        <div class="card-stat"><b>${d.views || "0"}</b><span>Tayangan</span></div>
        <div class="card-stat"><b>${fmtNum(d.likes)}</b><span>Suka</span></div>
        <div class="card-stat"><b>${fmtNum(d.saves)}</b><span>Disimpan</span></div>
      </div>
      <div class="card-actions">
        <button class="card-edit" data-act="edit">✎ Edit</button>
        <button class="card-delete" data-act="delete">🗑 Hapus</button>
      </div>`;
  } else {
    if (d.type === "carousel") {
       detailsHtml = `
        ${d.isi_carousel ? `<div class="card-script">${escapeHtml(d.isi_carousel)}</div>` : ""}
        <div class="card-details-list">
          <div class="card-detail-item"><span>Tayangan</span><b>${d.views || "-"}</b></div>
          <div class="card-detail-item"><span>Pemirsa</span><b>${d.reach || "-"}</b></div>
          <div class="card-detail-item"><span>Kunjungan Profil</span><b>${d.kunjungan || "-"}</b></div>
          <div class="card-detail-item"><span>Mengikuti</span><b>${d.mengikuti || "-"}</b></div>
          <div class="card-detail-item"><span>Suka</span><b>${fmtNum(d.likes)}</b></div>
          <div class="card-detail-item"><span>Komentar</span><b>${fmtNum(d.comments)}</b></div>
          <div class="card-detail-item"><span>Repost</span><b>${fmtNum(d.reposts)}</b></div>
          <div class="card-detail-item"><span>Share</span><b>${fmtNum(d.shares)}</b></div>
          <div class="card-detail-item"><span>Save</span><b>${fmtNum(d.saves)}</b></div>
        </div>
        <button class="card-copy" data-act="copy">📋 Salin Prompt Analisa</button>`;
    } else {
       detailsHtml = `
        ${d.script ? `<div class="card-script">${escapeHtml(d.script)}</div>` : ""}
        <div class="card-details-list">
          <div class="card-detail-item"><span>Durasi Video</span><b>${d.duration ? d.duration + ' dtk' : "-"}</b></div>
          <div class="card-detail-item"><span>Tayangan</span><b>${d.views || "-"}</b></div>
          <div class="card-detail-item"><span>Pemirsa</span><b>${d.reach || "-"}</b></div>
          <div class="card-detail-item"><span>Waktu Tonton</span><b>${d.watchtime ? d.watchtime + ' dtk' : "-"}</b></div>
          <div class="card-detail-item"><span>Suka</span><b>${fmtNum(d.likes)}</b></div>
          <div class="card-detail-item"><span>Komentar</span><b>${fmtNum(d.comments)}</b></div>
          <div class="card-detail-item"><span>Repost</span><b>${fmtNum(d.reposts)}</b></div>
          <div class="card-detail-item"><span>Disimpan</span><b>${fmtNum(d.saves)}</b></div>
        </div>
        <button class="card-copy" data-act="copy">📋 Salin Prompt Analisa</button>`;
    }
  }
    
  let formatLabel = d.type === "carousel" ? "<span style='color:var(--teal)'>• Carousel</span>" : "• Reels";
  card.innerHTML = `${img}<div class="card-body"><div class="card-date">${fmtDate(d.posted)} ${formatLabel}</div><div class="card-title">${escapeHtml(d.title || "(Tanpa judul)")}</div>${detailsHtml}</div>`;
  
  if(d.image) card.querySelector(".thumb")?.addEventListener("click", ()=> openLightbox(d.image));

  if(editable){
    card.querySelector('[data-act="edit"]')?.addEventListener("click", ()=> openModal(d.id, d.type));
    card.querySelector('[data-act="delete"]')?.addEventListener("click", ()=>{
      if(confirm("Hapus insight ini?")){ drafts = drafts.filter(x=>x.id !== d.id); saveJSON(LS_DRAFTS, drafts); renderDrafts(); }
    });
  } else {
    const copyBtn = card.querySelector('[data-act="copy"]');
    if (copyBtn) copyBtn.addEventListener("click", () => {
      let text = "";
      if (d.type === "carousel") {
          text = `Konten carousel IG tanggal ${fmtDate(d.posted)}, dengan judul ${d.title}, memiliki isi konten ${d.isi_carousel}. Insight ini di unduh pada tanggal ${fmtDate(d.downloaded)} dan memperoleh insight sebagai berikut :\n1. Tayangan : ${d.views}\n2. Pemirsa : ${d.reach}\n3. Kunjungan Profil : ${d.kunjungan}\n4. Mengikuti : ${d.mengikuti}\n5. Suka : ${fmtNum(d.likes)}\n6. Komentar : ${fmtNum(d.comments)}\n7. Posting Ulang : ${fmtNum(d.reposts)}\n8. Dibagikan : ${fmtNum(d.shares)}\n9. Disimpan : ${fmtNum(d.saves)}\nAnalisa mendalam dan beri penilaian terhadap performa konten ini. Berikan kesimpulan dari hasil analisa anda dan berikan ide dan saran untuk menjadi bahan evaluasi konten berikutnya.`;
      } else {
          text = `Konten reels IG tanggal ${fmtDate(d.posted)}, dengan judul ${d.title}, memiliki naskah script ${d.script}, dan dengan durasi video ${d.duration} detik. Insight ini di unduh pada tanggal ${fmtDate(d.downloaded)} dan memperoleh insight sebagai berikut :\n1. Tayangan : ${d.views}\n2. Pemirsa : ${d.reach}\n3. Waktu Tonton Rata-rata : ${d.watchtime}\n4. Suka : ${fmtNum(d.likes)}\n5. Komentar : ${fmtNum(d.comments)}\n6. Posting Ulang : ${fmtNum(d.reposts)}\n7. Dibagikan : ${fmtNum(d.shares)}\n8. Disimpan : ${fmtNum(d.saves)}\nAnalisa mendalam dan beri penilaian terhadap performa konten ini. Berikan kesimpulan dari hasil analisa anda dan berikan ide dan saran untuk menjadi bahan evaluasi konten berikutnya.`;
      }
      navigator.clipboard.writeText(text).then(()=> toast("Disalin! Siap dipaste","success"));
    });
  }
  return card;
}

const overlay = $("#modalOverlay");
const fieldsInsight = ["type","title","script","isi_carousel","posted","downloaded","caption","views","reach","duration","watchtime","kunjungan","mengikuti","likes","comments","reposts","shares","saves"];

function openModal(editId=null, forceType="reels"){
  currentEditId = editId; 
  if(overlay) { overlay.hidden = false; document.body.style.overflow = "hidden"; }
  let activeType = forceType;
  
  if(editId){
    const d = drafts.find(x=>x.id===editId);
    activeType = d.type || "reels";
    if($("#modalTitle")) $("#modalTitle").textContent = activeType === "carousel" ? "Edit Insight Carousel" : "Edit Insight Reels";
    fieldsInsight.forEach(f=> { if($("#f_"+f)) $("#f_"+f).value = d[f] ?? ""; });
    setImage(d.image || null, false);
  } else {
    const saved = loadJSON(LS_FORMDRAFT, null);
    if(saved && saved._id === "new" && saved.type === forceType){ 
      fieldsInsight.forEach(f=> { if($("#f_"+f)) $("#f_"+f).value = saved[f] ?? ""; }); 
      setImage(saved.image || null, false); 
    }
    else { 
      fieldsInsight.forEach(f=> { if($("#f_"+f)) $("#f_"+f).value = ""; }); 
      if($("#f_type")) $("#f_type").value = forceType;
      setImage(null, false); 
    }
    if($("#modalTitle")) $("#modalTitle").textContent = forceType === "carousel" ? "Tambah Insight Carousel" : "Tambah Insight Reels";
  }
  
  $all(".type-reels").forEach(el => el.hidden = (activeType !== "reels"));
  $all(".type-carousel").forEach(el => el.hidden = (activeType !== "carousel"));
}

function closeModal(){ if(overlay) overlay.hidden = true; document.body.style.overflow = ""; currentEditId = null; }

$("#openAddReelsModal")?.addEventListener("click", ()=> openModal(null, "reels"));
$("#openAddCarouselModal")?.addEventListener("click", ()=> openModal(null, "carousel"));
$("#modalCloseBtn")?.addEventListener("click", closeModal);
$("#cancelModalBtn")?.addEventListener("click", closeModal);
fieldsInsight.forEach(f=> {
  $("#f_"+f)?.addEventListener("input", ()=>{
    if(currentEditId) return;
    const obj = { _id: "new", image: currentImageDataUrl };
    fieldsInsight.forEach(k=> { if($("#f_"+k)) obj[k] = $("#f_"+k).value; });
    saveJSON(LS_FORMDRAFT, obj); flashSaved();
  });
});

const fileInput = $("#fileInput");
$("#dropzone")?.addEventListener("click", ()=> fileInput?.click());
fileInput?.addEventListener("change", e=>{ if(e.target.files[0]) {
  const reader = new FileReader(); reader.onload = ()=> { setImage(reader.result, true); }; reader.readAsDataURL(e.target.files[0]);
}});

$("#maximizeBtn")?.addEventListener("click", (e) => {
  e.stopPropagation(); // Mencegah klik tembus memicu ganti gambar
  openLightbox(currentImageDataUrl);
});
$("#replaceImgBtn")?.addEventListener("click", () => fileInput?.click());
$("#removeImgBtn")?.addEventListener("click", () => setImage(null, true));

function setImage(dataUrl, trig){ 
  currentImageDataUrl = dataUrl; 
  if($("#previewImg")) $("#previewImg").src=dataUrl||""; 
  if($("#dropzoneEmpty")) $("#dropzoneEmpty").hidden=!!dataUrl; 
  if($("#dropzonePreview")) $("#dropzonePreview").hidden=!dataUrl; 
  if($("#scanBtn")) $("#scanBtn").disabled=!dataUrl; 
  if(trig) flashSaved(); 
}

/* OCR SCAN SMART LOGIC */
$("#scanBtn")?.addEventListener("click", runScan);
async function runScan(){
  if(!currentImageDataUrl) return;
  const progWrap = $("#scanProgress"), bar = $("#scanProgressBar"), scanBtn = $("#scanBtn");
  if(scanBtn) scanBtn.disabled = true; 
  if(progWrap) progWrap.hidden = false; 
  if(bar) bar.style.width = "4%";

  try{
    const result = await Tesseract.recognize(currentImageDataUrl, "ind+eng", {
      logger: m=>{ if(m.status === "recognizing text" && bar){ bar.style.width = Math.max(6, Math.round(m.progress*100)) + "%"; } }
    });
    if(bar) bar.style.width = "100%";
    applyParsedData(parseInsightText(result.data.text));
    toast("Pemindaian selesai — periksa hasil angka", "success");
  }catch(err){
    console.error(err); toast("Pemindaian gagal, isi manual", "error");
  }finally{
    setTimeout(()=>{ if(progWrap) progWrap.hidden = true; if(scanBtn) scanBtn.disabled = false; }, 500);
  }
}

function parseInsightText(raw) {
  const text = raw.replace(/\r/g, "");
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const out = {};

  let foundTopMetrics = false;
  for (let i = 0; i < lines.length; i++) {
     const match = lines[i].match(/^([\d.,]+[kmb]?)\s+([\d.,]+[kmb]?)\s+([\d.,]+[kmb]?)\s+([\d.,]+[kmb]?)\s+([\d.,]+[kmb]?)$/i);
     if (match) { out.likes = match[1]; out.comments = match[2]; out.reposts = match[3]; out.shares = match[4]; out.saves = match[5]; foundTopMetrics = true; break; }
  }

  const datePattern = /(\d{1,2}\s+[a-zA-Z]+\.?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
  out.posted = findDateNear(lines, /post(ing)?|diposting/i, datePattern);
  out.downloaded = findDateNear(lines, /diunduh|di ?unduh|unduh/i, datePattern);

  const capIdx = lines.findIndex(l => /keterangan/i.test(l));
  if (capIdx !== -1 && lines[capIdx + 1]) {
    let cap = lines[capIdx].replace(/keterangan\s*[:\-]?/i, "").trim();
    if (!cap) cap = lines[capIdx + 1];
    out.caption = cap;
  }

  const knownLabels = [
    { key: 'views', regex: /tayangan/i },
    { key: 'reach', regex: /pemirsa/i },
    { key: 'watchtime', regex: /waktu (tonton|menonton)|rata-?rata/i },
    { key: 'kunjungan', regex: /kunjungan/i },
    { key: 'mengikuti', regex: /mengikuti/i }
  ];
  
  if (!foundTopMetrics) { 
    knownLabels.push({ key: 'likes', regex: /^suka\b|\bsuka$/i }, { key: 'comments', regex: /komentar/i }, { key: 'reposts', regex: /posting ulang/i }, { key: 'shares', regex: /dibagikan|bagikan/i }, { key: 'saves', regex: /disimpan|simpan/i });
  }

  for (let i = 0; i < lines.length; i++) {
    let foundLabels = [];
    knownLabels.forEach(lbl => {
      const match = lines[i].match(lbl.regex);
      if (match) foundLabels.push({ key: lbl.key, index: match.index, regex: lbl.regex });
    });

    if (foundLabels.length > 0) {
      foundLabels.sort((a, b) => a.index - b.index); 
      const numRegex = /([\d]+[.,]?[\d]*)\s*(rb|jt|k|m)?/gi;
      let inlineNums = [...lines[i].matchAll(numRegex)].map(m => m[0]);
      let nextLineNums = lines[i+1] ? [...lines[i+1].matchAll(numRegex)].map(m => m[0]) : [];

      if (nextLineNums.length >= foundLabels.length) { foundLabels.forEach((lbl, idx) => { if (!out[lbl.key]) out[lbl.key] = nextLineNums[idx]; }); } 
      else if (inlineNums.length >= foundLabels.length) { foundLabels.forEach((lbl, idx) => { if (!out[lbl.key]) out[lbl.key] = inlineNums[idx]; }); } 
      else {
        foundLabels.forEach(lbl => {
          if (!out[lbl.key]) {
            let after = lines[i].substring(lbl.index).replace(lbl.regex, "");
            let m = after.match(/([\d]+[.,]?[\d]*)\s*(rb|jt|k|m)?/i);
            if (m) out[lbl.key] = m[0];
            else if (lines[i+1]) { m = lines[i+1].match(/([\d]+[.,]?[\d]*)\s*(rb|jt|k|m)?/i); if (m) out[lbl.key] = m[0]; }
          }
        });
      }
    }
  }
  return out;
}

function findDateNear(lines, labelRe, dateRe) {
  for (let i = 0; i < lines.length; i++) {
    if (labelRe.test(lines[i])) {
      let str = lines[i] + " " + (lines[i+1]||"") + " " + (lines[i+2]||"");
      let m = str.match(dateRe);
      if (m) {
        const months = {jan:1,feb:2,mar:3,apr:4,mei:5,may:5,jun:6,jul:7,agu:8,aug:8,sep:9,okt:10,oct:10,nov:11,des:12,dec:12};
        let dMatch = m[0].match(/(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/);
        if(dMatch){ const mo = months[dMatch[2].toLowerCase().slice(0,3)]; if(mo) return `${dMatch[3]}-${String(mo).padStart(2,"0")}-${String(dMatch[1]).padStart(2,"0")}`; }
        dMatch = m[0].match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if(dMatch){ let yr = dMatch[3].length===2 ? "20"+dMatch[3] : dMatch[3]; return `${yr}-${String(dMatch[2]).padStart(2,"0")}-${String(dMatch[1]).padStart(2,"0")}`; }
        return m[0];
      }
    }
  } return "";
}

function applyParsedData(data){
  Object.keys(data).forEach(k=>{
    const el = $("#f_"+k); if(!el) return;
    let val = data[k];
    if(val === "" || val === null || val === undefined) return;
    if (el.type === "number") val = String(val).replace(/[^\d]/g, ""); 
    if(val !== ""){
      el.value = val; el.classList.add("filled");
      setTimeout(()=> el.classList.remove("filled"), 1200);
    }
  });
  if(!currentEditId) {
    const obj = { _id: "new", image: currentImageDataUrl };
    fieldsInsight.forEach(k=> { if($("#f_"+k)) obj[k] = $("#f_"+k).value; }); 
    saveJSON(LS_FORMDRAFT, obj); flashSaved();
  }
}

$("#saveCardBtn")?.addEventListener("click", ()=>{
  if(!$("#f_title")?.value.trim()){ toast("Judul konten wajib diisi", "error"); return; }
  const payload = { image: currentImageDataUrl };
  fieldsInsight.forEach(f=> { if($("#f_"+f)) payload[f] = $("#f_"+f).value.trim(); });
  if(currentEditId){
    const idx = drafts.findIndex(x=>x.id===currentEditId);
    if(idx !== -1) drafts[idx] = { ...drafts[idx], ...payload };
    toast("Insight diperbarui", "success");
  } else {
    payload.id = uid(); payload._createdAt = Date.now(); drafts.push(payload); toast("Insight ditambahkan", "success");
  }
  saveJSON(LS_DRAFTS, drafts); renderDrafts(); 
  localStorage.removeItem(LS_FORMDRAFT); closeModal();
});

$("#sendAllBtn")?.addEventListener("click", async ()=>{
  if(drafts.length === 0) return;
  const sendBtn = $("#sendAllBtn");
  if(sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Mengirim..."; }
  try{
    const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "append", rows: drafts }) });
    const json = await res.json();
    if(json.ok){ toast(`${drafts.length} insight dikirim`, "success"); drafts = []; saveJSON(LS_DRAFTS, drafts); renderDrafts(); sheetData = []; saveJSON(LS_SHEETCACHE, []); }
    else throw new Error("Gagal backend");
  }catch(e){ toast("Gagal mengirim", "error"); }
  finally{ if(sendBtn){ sendBtn.disabled = drafts.length===0; sendBtn.innerHTML = "Kirim ke Spreadsheet"; } }
});

async function fetchSheetData(){
  if(typeof APPS_SCRIPT_URL === 'undefined' || !APPS_SCRIPT_URL.includes("http")) return;
  if($("#topLoadingBar")) $("#topLoadingBar").hidden = false;
  try{
    const res = await fetch(APPS_SCRIPT_URL + "?action=list"); const json = await res.json();
    sheetData = json.rows || []; saveJSON(LS_SHEETCACHE, sheetData);
  }catch(e){} finally{ if($("#topLoadingBar")) $("#topLoadingBar").hidden = true; renderSheetGrid(); }
}

function renderSheetGrid(){
  const grid = $("#sheetGrid"); 
  if(!grid) return;
  grid.innerHTML = "";
  const kw = $("#searchInput")?.value.toLowerCase(), from = $("#dateFrom")?.value, to = $("#dateTo")?.value;
  let list = sheetData.filter(d=>{
    if(kw && !((d.title||"").toLowerCase().includes(kw))) return false;
    if(from && d.posted < from) return false; if(to && d.posted > to) return false; return true;
  });
  list.sort((a,b)=> (b._createdAt||0) - (a._createdAt||0)).forEach(d=> grid.appendChild(buildCard(d, false)));
  if($("#sheetEmptyHint")) $("#sheetEmptyHint").hidden = list.length > 0;
}

["searchInput","dateFrom","dateTo","sortSelect"].forEach(id=> $("#"+id)?.addEventListener("input", renderSheetGrid));
$("#refreshSheetBtn")?.addEventListener("click", fetchSheetData);

/* ==========================================================================
   FITUR EXPORT EXCEL (Client-side SheetJS dengan 2 Tab: Insight Reels & Carousel)
   ========================================================================== */
$("#downloadExcelBtn")?.addEventListener("click", () => {
  if (sheetData.length === 0) {
    toast("Tidak ada data untuk didownload. Muat ulang dulu dari server.", "error");
    return;
  }

  const dataReels = [];
  const dataCarousel = [];

  sheetData.forEach(d => {
    const dateObj = new Date(d._createdAt);
    const timestamp = !isNaN(dateObj) ? dateObj.toLocaleString("id-ID") : "";

    if (d.type === "carousel") {
      dataCarousel.push({
        "Timestamp": timestamp,
        "ID": d.id || "",
        "Judul Konten": d.title || "",
        "Isi Carousel": d.isi_carousel || "",
        "Tanggal Posting": d.posted || "",
        "Insight Diunduh": d.downloaded || "",
        "Tayangan": d.views || "",
        "Pemirsa": d.reach || "",
        "Kunjungan Profil": d.kunjungan || "",
        "Mengikuti": d.mengikuti || "",
        "Suka": Number(d.likes) || 0,
        "Komentar": Number(d.comments) || 0,
        "Posting Ulang": Number(d.reposts) || 0,
        "Dibagikan": Number(d.shares) || 0,
        "Disimpan": Number(d.saves) || 0,
        "Gambar": d.image || ""
      });
    } else {
      dataReels.push({
        "Timestamp": timestamp,
        "ID": d.id || "",
        "Judul Konten": d.title || "",
        "Script": d.script || "",
        "Reel Diposting": d.posted || "",
        "Insight Diunduh": d.downloaded || "",
        "Keterangan": d.caption || "",
        "Tayangan": d.views || "",
        "Pemirsa": d.reach || "",
        "Waktu Tonton Rata-rata": d.watchtime || "",
        "Suka": Number(d.likes) || 0,
        "Komentar": Number(d.comments) || 0,
        "Posting Ulang": Number(d.reposts) || 0,
        "Dibagikan": Number(d.shares) || 0,
        "Disimpan": Number(d.saves) || 0,
        "Gambar": d.image || "",
        "Durasi Video": d.duration || ""
      });
    }
  });

  dataReels.reverse();
  dataCarousel.reverse();

  // Inisialisasi Workbook SheetJS
  const wb = XLSX.utils.book_new();

  // Buat Sheet "Insight Reels"
  const wsReels = dataReels.length > 0 ? XLSX.utils.json_to_sheet(dataReels) : XLSX.utils.json_to_sheet([{"Timestamp":"","ID":"","Judul Konten":"","Script":"","Reel Diposting":"","Insight Diunduh":"","Keterangan":"","Tayangan":"","Pemirsa":"","Waktu Tonton Rata-rata":"","Suka":"","Komentar":"","Posting Ulang":"","Dibagikan":"","Disimpan":"","Gambar":"","Durasi Video":""}]);
  XLSX.utils.book_append_sheet(wb, wsReels, "Insight Reels");

  // Buat Sheet "Insight Carousel"
  const wsCarousel = dataCarousel.length > 0 ? XLSX.utils.json_to_sheet(dataCarousel) : XLSX.utils.json_to_sheet([{"Timestamp":"","ID":"","Judul Konten":"","Isi Carousel":"","Tanggal Posting":"","Insight Diunduh":"","Tayangan":"","Pemirsa":"","Kunjungan Profil":"","Mengikuti":"","Suka":"","Komentar":"","Posting Ulang":"","Dibagikan":"","Disimpan":"","Gambar":""}]);
  XLSX.utils.book_append_sheet(wb, wsCarousel, "Insight Carousel");

  // Eksekusi Download File Excel (.xlsx) langsung di browser
  XLSX.writeFile(wb, "Laporan_Insight_Reelsight.xlsx");
  toast("Berhasil mengunduh file Excel!", "success");
});

/* ==========================================================================
   PLANNER LOGIC
   ========================================================================== */
const planOverlay = $("#plannerModalOverlay");
const fieldsPlan = ["title", "format", "objective", "concept", "script"];

function renderPlannerGrid() {
  const grid = $("#plannerGrid");
  if(!grid) return;
  grid.innerHTML = "";
  const kw = $("#planSearchInput")?.value.toLowerCase();
  const dateFilt = $("#planDateFilter")?.value;
  const statFilt = $("#planStatusFilter")?.value;
  const fmtFilt = $("#planFormatFilter")?.value;
  let list = plannerData.filter(p => {
    if(kw && !(p.title.toLowerCase().includes(kw) || p.objective.toLowerCase().includes(kw))) return false;
    if(dateFilt && p.createdDate !== dateFilt) return false;
    if(statFilt && p.status !== statFilt) return false;
    if(fmtFilt && p.format !== fmtFilt) return false;
    return true;
  });
  
  if($("#plannerEmptyHint")) $("#plannerEmptyHint").hidden = list.length > 0;
  list.sort((a,b)=> new Date(b.createdDate) - new Date(a.createdDate));
  
  list.forEach(p => {
    const card = document.createElement("div");
    card.className = `plan-card format-${p.format} status-${p.status}`; card.dataset.id = p.id;
    card.innerHTML = `<div class="plan-header"><div class="plan-meta"><span class="plan-date">${fmtDate(p.createdDate)}</span><span class="plan-format-badge">${p.format}</span></div><h3 class="plan-title">${escapeHtml(p.title)}</h3><div class="plan-status-wrap"><select class="status-select" data-id="${p.id}"><option value="planned" ${p.status==='planned'?'selected':''}>⏳ Planned</option><option value="progress" ${p.status==='progress'?'selected':''}>🔥 In Progress</option><option value="done" ${p.status==='done'?'selected':''}>✅ Done</option><option value="cancel" ${p.status==='cancel'?'selected':''}>❌ Cancelled</option></select></div></div><div class="plan-body"><details class="plan-details"><summary>Lihat Rincian Plan</summary><div class="plan-details-content"><div class="plan-section"><strong>Objective</strong><p>${escapeHtml(p.objective) || "-"}</p></div><div class="plan-section"><strong>Konsep / Visual</strong><p>${escapeHtml(p.concept) || "-"}</p></div><div class="plan-section"><strong>Script</strong><p>${escapeHtml(p.script) || "-"}</p></div></div></details></div><div class="plan-footer"><button class="btn-edit-plan" data-act="edit-plan" data-id="${p.id}">✎ Edit Plan</button></div>`;
    
    card.querySelector(".status-select")?.addEventListener("change", (e) => {
      const idx = plannerData.findIndex(x => x.id === p.id);
      if(idx > -1) { plannerData[idx].status = e.target.value; saveJSON(LS_PLANNER_DATA, plannerData); renderPlannerGrid(); syncPlanToSheet(plannerData[idx]); }
    });
    card.querySelector(".btn-edit-plan")?.addEventListener("click", () => openPlanModal(p.id));
    grid.appendChild(card);
  });
}

function openPlanModal(editId=null) {
  plannerEditId = editId; 
  if(planOverlay) planOverlay.hidden = false; document.body.style.overflow = "hidden";
  if(editId) {
    const d = plannerData.find(x => x.id === editId); 
    if($("#planModalTitle")) $("#planModalTitle").textContent = "Edit Plan Konten"; 
    fieldsPlan.forEach(f => { if($("#p_"+f)) $("#p_"+f).value = d[f] ?? ""; });
  } else {
    if($("#planModalTitle")) $("#planModalTitle").textContent = "Tambah Plan Baru";
    const saved = loadJSON(LS_PLANNER_DRAFT, null);
    if(saved && saved._id === "new") { fieldsPlan.forEach(f => { if($("#p_"+f)) $("#p_"+f).value = saved[f] ?? ""; }); } 
    else { fieldsPlan.forEach(f => { if($("#p_"+f)) $("#p_"+f).value = ""; }); if($("#p_format")) $("#p_format").value = "video"; }
  }
}

function closePlanModal() { if(planOverlay) planOverlay.hidden = true; document.body.style.overflow = ""; plannerEditId = null; }

$("#openPlanModalBtn")?.addEventListener("click", () => openPlanModal(null));
$("#planModalCloseBtn")?.addEventListener("click", closePlanModal);
$("#cancelPlanModalBtn")?.addEventListener("click", closePlanModal);
planOverlay?.addEventListener("click", (e)=>{ if(e.target === planOverlay) closePlanModal(); });

fieldsPlan.forEach(f => {
  $("#p_"+f)?.addEventListener("input", () => {
    if(plannerEditId) return;
    const obj = { _id: "new" }; fieldsPlan.forEach(k => { if($("#p_"+k)) obj[k] = $("#p_"+k).value; }); saveJSON(LS_PLANNER_DRAFT, obj); flashSaved();
  });
});

$("#savePlanBtn")?.addEventListener("click", () => {
  if(!$("#p_title")?.value.trim()){ toast("Judul plan wajib diisi", "error"); return; }
  const payload = {}; fieldsPlan.forEach(f => { if($("#p_"+f)) payload[f] = $("#p_"+f).value.trim(); });
  let targetPlan = null;
  if(plannerEditId) {
    const idx = plannerData.findIndex(x => x.id === plannerEditId);
    if(idx !== -1) { plannerData[idx] = { ...plannerData[idx], ...payload }; targetPlan = plannerData[idx]; toast("Plan diperbarui", "success"); }
  } else {
    payload.id = "p_" + Date.now() + Math.random().toString(36).slice(2,5); payload.createdDate = new Date().toISOString().split('T')[0]; payload.status = "planned"; 
    plannerData.unshift(payload); targetPlan = payload; toast("Plan baru ditambahkan", "success");
  }
  saveJSON(LS_PLANNER_DATA, plannerData); renderPlannerGrid(); localStorage.removeItem(LS_PLANNER_DRAFT); closePlanModal();
  if(targetPlan) syncPlanToSheet(targetPlan);
});

async function syncPlanToSheet(planObj) {
  if(typeof APPS_SCRIPT_URL === 'undefined' || !APPS_SCRIPT_URL.includes("http")) return;
  try { await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "sync_plan", plan: planObj }) }); } catch(e) { toast("Gagal membackup plan", "error"); }
}

async function fetchPlannerData() {
  if(typeof APPS_SCRIPT_URL === 'undefined' || !APPS_SCRIPT_URL.includes("http")) return;
  if($("#topLoadingBar")) $("#topLoadingBar").hidden = false; 
  if($("#plannerStatus")) $("#plannerStatus").textContent = "Sinkronisasi planner...";
  try {
    const res = await fetch(APPS_SCRIPT_URL + "?action=list_plans"); const json = await res.json();
    if(json.ok) { plannerData = json.rows || []; saveJSON(LS_PLANNER_DATA, plannerData); if($("#plannerStatus")) $("#plannerStatus").textContent = `Update: ${new Date().toLocaleTimeString('id-ID')}`; }
  } catch(e) { if($("#plannerStatus")) $("#plannerStatus").textContent = "Gagal memuat server."; } 
  finally { if($("#topLoadingBar")) $("#topLoadingBar").hidden = true; renderPlannerGrid(); }
}
$("#refreshPlannerBtn")?.addEventListener("click", fetchPlannerData);
["planSearchInput", "planDateFilter", "planStatusFilter", "planFormatFilter"].forEach(id => { $("#"+id)?.addEventListener("input", renderPlannerGrid); $("#"+id)?.addEventListener("change", renderPlannerGrid); });

/* INIT */
renderDrafts(); 
renderPlannerGrid();/* ==========================================================================
   REELSIGHT — app.js (Insight Reels, Carousel & Planner)
   ========================================================================== */

const LS_DRAFTS = "reelsight_drafts_v3";       
const LS_FORMDRAFT = "reelsight_formdraft_v3";    
const LS_SHEETCACHE = "reelsight_sheetcache_v3"; 
const LS_PLANNER_DATA = "reelsight_planner_v1";
const LS_PLANNER_DRAFT = "reelsight_planner_form_v1";

let drafts = loadJSON(LS_DRAFTS, []);          
let sheetData = loadJSON(LS_SHEETCACHE, []);   
let plannerData = loadJSON(LS_PLANNER_DATA, []);
let currentEditId = null;                      
let plannerEditId = null;
let currentImageDataUrl = null;                
let activeTab = "input";

function loadJSON(key, fallback){ try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }catch(e){ return fallback; } }
function saveJSON(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }
function uid(){ return "d_" + Date.now() + "_" + Math.random().toString(36).slice(2,8); }
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

function toast(msg, type=""){
  const el = $("#toast");
  if(!el) return;
  el.textContent = msg; el.className = "toast show " + type;
  clearTimeout(toast._t); toast._t = setTimeout(()=> el.classList.remove("show"), 2600);
}

function flashSaved(){
  const el = $("#autosaveStatus");
  if(!el) return;
  el.querySelector(".dot").style.background = "var(--amber)"; el.lastChild.textContent = " Menyimpan...";
  clearTimeout(flashSaved._t); flashSaved._t = setTimeout(()=>{ el.querySelector(".dot").style.background = "var(--teal)"; el.lastChild.textContent = " Tersimpan otomatis"; }, 500);
}
function fmtNum(n){ return (Number(n) || 0).toLocaleString("id-ID"); }
function fmtDate(d){
  if(!d) return "-";
  try{ return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric" }); } catch(e){ return d; }
}

// Lightbox logic
const lightbox = $("#lightbox");
const lightboxImg = $("#lightboxImg");
function openLightbox(src){
  if(!src || !lightboxImg) return;
  lightboxImg.src = src;
  if(lightbox) lightbox.hidden = false;
}
$("#lightboxClose")?.addEventListener("click", ()=> { if(lightbox) lightbox.hidden = true; });
lightbox?.addEventListener("click", e => { if(e.target.id === "lightbox") lightbox.hidden = true; });

// Tab Switching
$all(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    activeTab = btn.dataset.tab;
    $all(".tab-btn").forEach(b=>{ b.classList.toggle("active", b===btn); });
    $("#panel-input")?.classList.toggle("hidden", activeTab!=="input");
    $("#panel-lihat")?.classList.toggle("hidden", activeTab!=="lihat");
    $("#panel-planner")?.classList.toggle("hidden", activeTab!=="planner");
    $("#appFooter")?.classList.toggle("hide", activeTab!=="input");
    
    if(activeTab === "lihat") fetchSheetData();
    if(activeTab === "planner" && plannerData.length === 0) fetchPlannerData(); 
  });
});

/* ==========================================================================
   INSIGHT LOGIC
   ========================================================================== */
function renderDrafts(){
  const grid = $("#draftGrid");
  if(!grid) return;
  
  grid.querySelectorAll(".insight-card").forEach(n=>n.remove());
  
  [...drafts].sort((a,b)=> (b._createdAt||0) - (a._createdAt||0)).forEach((d, i)=>{
    const card = buildCard(d, true); card.style.animationDelay = (i*0.04)+"s"; grid.appendChild(card);
  });
  
  const badge = $("#pendingBadge"); 
  if(badge) { badge.hidden = drafts.length === 0; badge.textContent = drafts.length; }
  const footerCount = $("#footerCount");
  if(footerCount) footerCount.textContent = drafts.length; 
  const sendBtn = $("#sendAllBtn");
  if(sendBtn) sendBtn.disabled = drafts.length === 0;
}

function buildCard(d, editable){
  const card = document.createElement("div");
  card.className = `insight-card type-${d.type || 'reels'}`;
  const img = d.image ? `<img class="thumb" src="${d.image}" style="cursor:zoom-in;">` : `<div class="thumb-fallback">🎬</div>`;
  
  let detailsHtml = "";
  if (editable) {
    detailsHtml = `
      <div class="card-stats">
        <div class="card-stat"><b>${d.views || "0"}</b><span>Tayangan</span></div>
        <div class="card-stat"><b>${fmtNum(d.likes)}</b><span>Suka</span></div>
        <div class="card-stat"><b>${fmtNum(d.saves)}</b><span>Disimpan</span></div>
      </div>
      <div class="card-actions">
        <button class="card-edit" data-act="edit">✎ Edit</button>
        <button class="card-delete" data-act="delete">🗑 Hapus</button>
      </div>`;
  } else {
    if (d.type === "carousel") {
       detailsHtml = `
        ${d.isi_carousel ? `<div class="card-script">${escapeHtml(d.isi_carousel)}</div>` : ""}
        <div class="card-details-list">
          <div class="card-detail-item"><span>Tayangan</span><b>${d.views || "-"}</b></div>
          <div class="card-detail-item"><span>Pemirsa</span><b>${d.reach || "-"}</b></div>
          <div class="card-detail-item"><span>Kunjungan Profil</span><b>${d.kunjungan || "-"}</b></div>
          <div class="card-detail-item"><span>Mengikuti</span><b>${d.mengikuti || "-"}</b></div>
          <div class="card-detail-item"><span>Suka</span><b>${fmtNum(d.likes)}</b></div>
          <div class="card-detail-item"><span>Komentar</span><b>${fmtNum(d.comments)}</b></div>
          <div class="card-detail-item"><span>Repost</span><b>${fmtNum(d.reposts)}</b></div>
          <div class="card-detail-item"><span>Share</span><b>${fmtNum(d.shares)}</b></div>
          <div class="card-detail-item"><span>Save</span><b>${fmtNum(d.saves)}</b></div>
        </div>
        <button class="card-copy" data-act="copy">📋 Salin Prompt Analisa</button>`;
    } else {
       detailsHtml = `
        ${d.script ? `<div class="card-script">${escapeHtml(d.script)}</div>` : ""}
        <div class="card-details-list">
          <div class="card-detail-item"><span>Durasi Video</span><b>${d.duration ? d.duration + ' dtk' : "-"}</b></div>
          <div class="card-detail-item"><span>Tayangan</span><b>${d.views || "-"}</b></div>
          <div class="card-detail-item"><span>Pemirsa</span><b>${d.reach || "-"}</b></div>
          <div class="card-detail-item"><span>Waktu Tonton</span><b>${d.watchtime ? d.watchtime + ' dtk' : "-"}</b></div>
          <div class="card-detail-item"><span>Suka</span><b>${fmtNum(d.likes)}</b></div>
          <div class="card-detail-item"><span>Komentar</span><b>${fmtNum(d.comments)}</b></div>
          <div class="card-detail-item"><span>Repost</span><b>${fmtNum(d.reposts)}</b></div>
          <div class="card-detail-item"><span>Disimpan</span><b>${fmtNum(d.saves)}</b></div>
        </div>
        <button class="card-copy" data-act="copy">📋 Salin Prompt Analisa</button>`;
    }
  }
    
  let formatLabel = d.type === "carousel" ? "<span style='color:var(--teal)'>• Carousel</span>" : "• Reels";
  card.innerHTML = `${img}<div class="card-body"><div class="card-date">${fmtDate(d.posted)} ${formatLabel}</div><div class="card-title">${escapeHtml(d.title || "(Tanpa judul)")}</div>${detailsHtml}</div>`;
  
  if(d.image) card.querySelector(".thumb")?.addEventListener("click", ()=> openLightbox(d.image));

  if(editable){
    card.querySelector('[data-act="edit"]')?.addEventListener("click", ()=> openModal(d.id, d.type));
    card.querySelector('[data-act="delete"]')?.addEventListener("click", ()=>{
      if(confirm("Hapus insight ini?")){ drafts = drafts.filter(x=>x.id !== d.id); saveJSON(LS_DRAFTS, drafts); renderDrafts(); }
    });
  } else {
    const copyBtn = card.querySelector('[data-act="copy"]');
    if (copyBtn) copyBtn.addEventListener("click", () => {
      let text = "";
      if (d.type === "carousel") {
          text = `Konten carousel IG tanggal ${fmtDate(d.posted)}, dengan judul ${d.title}, memiliki isi konten ${d.isi_carousel}. Insight ini di unduh pada tanggal ${fmtDate(d.downloaded)} dan memperoleh insight sebagai berikut :\n1. Tayangan : ${d.views}\n2. Pemirsa : ${d.reach}\n3. Kunjungan Profil : ${d.kunjungan}\n4. Mengikuti : ${d.mengikuti}\n5. Suka : ${fmtNum(d.likes)}\n6. Komentar : ${fmtNum(d.comments)}\n7. Posting Ulang : ${fmtNum(d.reposts)}\n8. Dibagikan : ${fmtNum(d.shares)}\n9. Disimpan : ${fmtNum(d.saves)}\nAnalisa mendalam dan beri penilaian terhadap performa konten ini. Berikan kesimpulan dari hasil analisa anda dan berikan ide dan saran untuk menjadi bahan evaluasi konten berikutnya.`;
      } else {
          text = `Konten reels IG tanggal ${fmtDate(d.posted)}, dengan judul ${d.title}, memiliki naskah script ${d.script}, dan dengan durasi video ${d.duration} detik. Insight ini di unduh pada tanggal ${fmtDate(d.downloaded)} dan memperoleh insight sebagai berikut :\n1. Tayangan : ${d.views}\n2. Pemirsa : ${d.reach}\n3. Waktu Tonton Rata-rata : ${d.watchtime}\n4. Suka : ${fmtNum(d.likes)}\n5. Komentar : ${fmtNum(d.comments)}\n6. Posting Ulang : ${fmtNum(d.reposts)}\n7. Dibagikan : ${fmtNum(d.shares)}\n8. Disimpan : ${fmtNum(d.saves)}\nAnalisa mendalam dan beri penilaian terhadap performa konten ini. Berikan kesimpulan dari hasil analisa anda dan berikan ide dan saran untuk menjadi bahan evaluasi konten berikutnya.`;
      }
      navigator.clipboard.writeText(text).then(()=> toast("Disalin! Siap dipaste","success"));
    });
  }
  return card;
}

const overlay = $("#modalOverlay");
const fieldsInsight = ["type","title","script","isi_carousel","posted","downloaded","caption","views","reach","duration","watchtime","kunjungan","mengikuti","likes","comments","reposts","shares","saves"];

function openModal(editId=null, forceType="reels"){
  currentEditId = editId; 
  if(overlay) { overlay.hidden = false; document.body.style.overflow = "hidden"; }
  let activeType = forceType;
  
  if(editId){
    const d = drafts.find(x=>x.id===editId);
    activeType = d.type || "reels";
    if($("#modalTitle")) $("#modalTitle").textContent = activeType === "carousel" ? "Edit Insight Carousel" : "Edit Insight Reels";
    fieldsInsight.forEach(f=> { if($("#f_"+f)) $("#f_"+f).value = d[f] ?? ""; });
    setImage(d.image || null, false);
  } else {
    const saved = loadJSON(LS_FORMDRAFT, null);
    if(saved && saved._id === "new" && saved.type === forceType){ 
      fieldsInsight.forEach(f=> { if($("#f_"+f)) $("#f_"+f).value = saved[f] ?? ""; }); 
      setImage(saved.image || null, false); 
    }
    else { 
      fieldsInsight.forEach(f=> { if($("#f_"+f)) $("#f_"+f).value = ""; }); 
      if($("#f_type")) $("#f_type").value = forceType;
      setImage(null, false); 
    }
    if($("#modalTitle")) $("#modalTitle").textContent = forceType === "carousel" ? "Tambah Insight Carousel" : "Tambah Insight Reels";
  }
  
  $all(".type-reels").forEach(el => el.hidden = (activeType !== "reels"));
  $all(".type-carousel").forEach(el => el.hidden = (activeType !== "carousel"));
}

function closeModal(){ if(overlay) overlay.hidden = true; document.body.style.overflow = ""; currentEditId = null; }

$("#openAddReelsModal")?.addEventListener("click", ()=> openModal(null, "reels"));
$("#openAddCarouselModal")?.addEventListener("click", ()=> openModal(null, "carousel"));
$("#modalCloseBtn")?.addEventListener("click", closeModal);
$("#cancelModalBtn")?.addEventListener("click", closeModal);
fieldsInsight.forEach(f=> {
  $("#f_"+f)?.addEventListener("input", ()=>{
    if(currentEditId) return;
    const obj = { _id: "new", image: currentImageDataUrl };
    fieldsInsight.forEach(k=> { if($("#f_"+k)) obj[k] = $("#f_"+k).value; });
    saveJSON(LS_FORMDRAFT, obj); flashSaved();
  });
});

const fileInput = $("#fileInput");
$("#dropzone")?.addEventListener("click", ()=> fileInput?.click());
fileInput?.addEventListener("change", e=>{ if(e.target.files[0]) {
  const reader = new FileReader(); reader.onload = ()=> { setImage(reader.result, true); }; reader.readAsDataURL(e.target.files[0]);
}});

$("#maximizeBtn")?.addEventListener("click", (e) => {
  e.stopPropagation(); // Mencegah klik tembus memicu ganti gambar
  openLightbox(currentImageDataUrl);
});
$("#replaceImgBtn")?.addEventListener("click", () => fileInput?.click());
$("#removeImgBtn")?.addEventListener("click", () => setImage(null, true));

function setImage(dataUrl, trig){ 
  currentImageDataUrl = dataUrl; 
  if($("#previewImg")) $("#previewImg").src=dataUrl||""; 
  if($("#dropzoneEmpty")) $("#dropzoneEmpty").hidden=!!dataUrl; 
  if($("#dropzonePreview")) $("#dropzonePreview").hidden=!dataUrl; 
  if($("#scanBtn")) $("#scanBtn").disabled=!dataUrl; 
  if(trig) flashSaved(); 
}

/* OCR SCAN SMART LOGIC */
$("#scanBtn")?.addEventListener("click", runScan);
async function runScan(){
  if(!currentImageDataUrl) return;
  const progWrap = $("#scanProgress"), bar = $("#scanProgressBar"), scanBtn = $("#scanBtn");
  if(scanBtn) scanBtn.disabled = true; 
  if(progWrap) progWrap.hidden = false; 
  if(bar) bar.style.width = "4%";

  try{
    const result = await Tesseract.recognize(currentImageDataUrl, "ind+eng", {
      logger: m=>{ if(m.status === "recognizing text" && bar){ bar.style.width = Math.max(6, Math.round(m.progress*100)) + "%"; } }
    });
    if(bar) bar.style.width = "100%";
    applyParsedData(parseInsightText(result.data.text));
    toast("Pemindaian selesai — periksa hasil angka", "success");
  }catch(err){
    console.error(err); toast("Pemindaian gagal, isi manual", "error");
  }finally{
    setTimeout(()=>{ if(progWrap) progWrap.hidden = true; if(scanBtn) scanBtn.disabled = false; }, 500);
  }
}

function parseInsightText(raw) {
  const text = raw.replace(/\r/g, "");
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const out = {};

  let foundTopMetrics = false;
  for (let i = 0; i < lines.length; i++) {
     const match = lines[i].match(/^([\d.,]+[kmb]?)\s+([\d.,]+[kmb]?)\s+([\d.,]+[kmb]?)\s+([\d.,]+[kmb]?)\s+([\d.,]+[kmb]?)$/i);
     if (match) { out.likes = match[1]; out.comments = match[2]; out.reposts = match[3]; out.shares = match[4]; out.saves = match[5]; foundTopMetrics = true; break; }
  }

  const datePattern = /(\d{1,2}\s+[a-zA-Z]+\.?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
  out.posted = findDateNear(lines, /post(ing)?|diposting/i, datePattern);
  out.downloaded = findDateNear(lines, /diunduh|di ?unduh|unduh/i, datePattern);

  const capIdx = lines.findIndex(l => /keterangan/i.test(l));
  if (capIdx !== -1 && lines[capIdx + 1]) {
    let cap = lines[capIdx].replace(/keterangan\s*[:\-]?/i, "").trim();
    if (!cap) cap = lines[capIdx + 1];
    out.caption = cap;
  }

  const knownLabels = [
    { key: 'views', regex: /tayangan/i },
    { key: 'reach', regex: /pemirsa/i },
    { key: 'watchtime', regex: /waktu (tonton|menonton)|rata-?rata/i },
    { key: 'kunjungan', regex: /kunjungan/i },
    { key: 'mengikuti', regex: /mengikuti/i }
  ];
  
  if (!foundTopMetrics) { 
    knownLabels.push({ key: 'likes', regex: /^suka\b|\bsuka$/i }, { key: 'comments', regex: /komentar/i }, { key: 'reposts', regex: /posting ulang/i }, { key: 'shares', regex: /dibagikan|bagikan/i }, { key: 'saves', regex: /disimpan|simpan/i });
  }

  for (let i = 0; i < lines.length; i++) {
    let foundLabels = [];
    knownLabels.forEach(lbl => {
      const match = lines[i].match(lbl.regex);
      if (match) foundLabels.push({ key: lbl.key, index: match.index, regex: lbl.regex });
    });

    if (foundLabels.length > 0) {
      foundLabels.sort((a, b) => a.index - b.index); 
      const numRegex = /([\d]+[.,]?[\d]*)\s*(rb|jt|k|m)?/gi;
      let inlineNums = [...lines[i].matchAll(numRegex)].map(m => m[0]);
      let nextLineNums = lines[i+1] ? [...lines[i+1].matchAll(numRegex)].map(m => m[0]) : [];

      if (nextLineNums.length >= foundLabels.length) { foundLabels.forEach((lbl, idx) => { if (!out[lbl.key]) out[lbl.key] = nextLineNums[idx]; }); } 
      else if (inlineNums.length >= foundLabels.length) { foundLabels.forEach((lbl, idx) => { if (!out[lbl.key]) out[lbl.key] = inlineNums[idx]; }); } 
      else {
        foundLabels.forEach(lbl => {
          if (!out[lbl.key]) {
            let after = lines[i].substring(lbl.index).replace(lbl.regex, "");
            let m = after.match(/([\d]+[.,]?[\d]*)\s*(rb|jt|k|m)?/i);
            if (m) out[lbl.key] = m[0];
            else if (lines[i+1]) { m = lines[i+1].match(/([\d]+[.,]?[\d]*)\s*(rb|jt|k|m)?/i); if (m) out[lbl.key] = m[0]; }
          }
        });
      }
    }
  }
  return out;
}

function findDateNear(lines, labelRe, dateRe) {
  for (let i = 0; i < lines.length; i++) {
    if (labelRe.test(lines[i])) {
      let str = lines[i] + " " + (lines[i+1]||"") + " " + (lines[i+2]||"");
      let m = str.match(dateRe);
      if (m) {
        const months = {jan:1,feb:2,mar:3,apr:4,mei:5,may:5,jun:6,jul:7,agu:8,aug:8,sep:9,okt:10,oct:10,nov:11,des:12,dec:12};
        let dMatch = m[0].match(/(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/);
        if(dMatch){ const mo = months[dMatch[2].toLowerCase().slice(0,3)]; if(mo) return `${dMatch[3]}-${String(mo).padStart(2,"0")}-${String(dMatch[1]).padStart(2,"0")}`; }
        dMatch = m[0].match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if(dMatch){ let yr = dMatch[3].length===2 ? "20"+dMatch[3] : dMatch[3]; return `${yr}-${String(dMatch[2]).padStart(2,"0")}-${String(dMatch[1]).padStart(2,"0")}`; }
        return m[0];
      }
    }
  } return "";
}

function applyParsedData(data){
  Object.keys(data).forEach(k=>{
    const el = $("#f_"+k); if(!el) return;
    let val = data[k];
    if(val === "" || val === null || val === undefined) return;
    if (el.type === "number") val = String(val).replace(/[^\d]/g, ""); 
    if(val !== ""){
      el.value = val; el.classList.add("filled");
      setTimeout(()=> el.classList.remove("filled"), 1200);
    }
  });
  if(!currentEditId) {
    const obj = { _id: "new", image: currentImageDataUrl };
    fieldsInsight.forEach(k=> { if($("#f_"+k)) obj[k] = $("#f_"+k).value; }); 
    saveJSON(LS_FORMDRAFT, obj); flashSaved();
  }
}

$("#saveCardBtn")?.addEventListener("click", ()=>{
  if(!$("#f_title")?.value.trim()){ toast("Judul konten wajib diisi", "error"); return; }
  const payload = { image: currentImageDataUrl };
  fieldsInsight.forEach(f=> { if($("#f_"+f)) payload[f] = $("#f_"+f).value.trim(); });
  if(currentEditId){
    const idx = drafts.findIndex(x=>x.id===currentEditId);
    if(idx !== -1) drafts[idx] = { ...drafts[idx], ...payload };
    toast("Insight diperbarui", "success");
  } else {
    payload.id = uid(); payload._createdAt = Date.now(); drafts.push(payload); toast("Insight ditambahkan", "success");
  }
  saveJSON(LS_DRAFTS, drafts); renderDrafts(); 
  localStorage.removeItem(LS_FORMDRAFT); closeModal();
});

$("#sendAllBtn")?.addEventListener("click", async ()=>{
  if(drafts.length === 0) return;
  const sendBtn = $("#sendAllBtn");
  if(sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Mengirim..."; }
  try{
    const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "append", rows: drafts }) });
    const json = await res.json();
    if(json.ok){ toast(`${drafts.length} insight dikirim`, "success"); drafts = []; saveJSON(LS_DRAFTS, drafts); renderDrafts(); sheetData = []; saveJSON(LS_SHEETCACHE, []); }
    else throw new Error("Gagal backend");
  }catch(e){ toast("Gagal mengirim", "error"); }
  finally{ if(sendBtn){ sendBtn.disabled = drafts.length===0; sendBtn.innerHTML = "Kirim ke Spreadsheet"; } }
});

async function fetchSheetData(){
  if(typeof APPS_SCRIPT_URL === 'undefined' || !APPS_SCRIPT_URL.includes("http")) return;
  if($("#topLoadingBar")) $("#topLoadingBar").hidden = false;
  try{
    const res = await fetch(APPS_SCRIPT_URL + "?action=list"); const json = await res.json();
    sheetData = json.rows || []; saveJSON(LS_SHEETCACHE, sheetData);
  }catch(e){} finally{ if($("#topLoadingBar")) $("#topLoadingBar").hidden = true; renderSheetGrid(); }
}

function renderSheetGrid(){
  const grid = $("#sheetGrid"); 
  if(!grid) return;
  grid.innerHTML = "";
  const kw = $("#searchInput")?.value.toLowerCase(), from = $("#dateFrom")?.value, to = $("#dateTo")?.value;
  let list = sheetData.filter(d=>{
    if(kw && !((d.title||"").toLowerCase().includes(kw))) return false;
    if(from && d.posted < from) return false; if(to && d.posted > to) return false; return true;
  });
  list.sort((a,b)=> (b._createdAt||0) - (a._createdAt||0)).forEach(d=> grid.appendChild(buildCard(d, false)));
  if($("#sheetEmptyHint")) $("#sheetEmptyHint").hidden = list.length > 0;
}

["searchInput","dateFrom","dateTo","sortSelect"].forEach(id=> $("#"+id)?.addEventListener("input", renderSheetGrid));
$("#refreshSheetBtn")?.addEventListener("click", fetchSheetData);

/* ==========================================================================
   FITUR EXPORT EXCEL (Client-side SheetJS dengan 2 Tab: Insight Reels & Carousel)
   ========================================================================== */
$("#downloadExcelBtn")?.addEventListener("click", () => {
  if (sheetData.length === 0) {
    toast("Tidak ada data untuk didownload. Muat ulang dulu dari server.", "error");
    return;
  }

  const dataReels = [];
  const dataCarousel = [];

  sheetData.forEach(d => {
    const dateObj = new Date(d._createdAt);
    const timestamp = !isNaN(dateObj) ? dateObj.toLocaleString("id-ID") : "";

    if (d.type === "carousel") {
      dataCarousel.push({
        "Timestamp": timestamp,
        "ID": d.id || "",
        "Judul Konten": d.title || "",
        "Isi Carousel": d.isi_carousel || "",
        "Tanggal Posting": d.posted || "",
        "Insight Diunduh": d.downloaded || "",
        "Tayangan": d.views || "",
        "Pemirsa": d.reach || "",
        "Kunjungan Profil": d.kunjungan || "",
        "Mengikuti": d.mengikuti || "",
        "Suka": Number(d.likes) || 0,
        "Komentar": Number(d.comments) || 0,
        "Posting Ulang": Number(d.reposts) || 0,
        "Dibagikan": Number(d.shares) || 0,
        "Disimpan": Number(d.saves) || 0,
        "Gambar": d.image || ""
      });
    } else {
      dataReels.push({
        "Timestamp": timestamp,
        "ID": d.id || "",
        "Judul Konten": d.title || "",
        "Script": d.script || "",
        "Reel Diposting": d.posted || "",
        "Insight Diunduh": d.downloaded || "",
        "Keterangan": d.caption || "",
        "Tayangan": d.views || "",
        "Pemirsa": d.reach || "",
        "Waktu Tonton Rata-rata": d.watchtime || "",
        "Suka": Number(d.likes) || 0,
        "Komentar": Number(d.comments) || 0,
        "Posting Ulang": Number(d.reposts) || 0,
        "Dibagikan": Number(d.shares) || 0,
        "Disimpan": Number(d.saves) || 0,
        "Gambar": d.image || "",
        "Durasi Video": d.duration || ""
      });
    }
  });

  dataReels.reverse();
  dataCarousel.reverse();

  // Inisialisasi Workbook SheetJS
  const wb = XLSX.utils.book_new();

  // Buat Sheet "Insight Reels"
  const wsReels = dataReels.length > 0 ? XLSX.utils.json_to_sheet(dataReels) : XLSX.utils.json_to_sheet([{"Timestamp":"","ID":"","Judul Konten":"","Script":"","Reel Diposting":"","Insight Diunduh":"","Keterangan":"","Tayangan":"","Pemirsa":"","Waktu Tonton Rata-rata":"","Suka":"","Komentar":"","Posting Ulang":"","Dibagikan":"","Disimpan":"","Gambar":"","Durasi Video":""}]);
  XLSX.utils.book_append_sheet(wb, wsReels, "Insight Reels");

  // Buat Sheet "Insight Carousel"
  const wsCarousel = dataCarousel.length > 0 ? XLSX.utils.json_to_sheet(dataCarousel) : XLSX.utils.json_to_sheet([{"Timestamp":"","ID":"","Judul Konten":"","Isi Carousel":"","Tanggal Posting":"","Insight Diunduh":"","Tayangan":"","Pemirsa":"","Kunjungan Profil":"","Mengikuti":"","Suka":"","Komentar":"","Posting Ulang":"","Dibagikan":"","Disimpan":"","Gambar":""}]);
  XLSX.utils.book_append_sheet(wb, wsCarousel, "Insight Carousel");

  // Eksekusi Download File Excel (.xlsx) langsung di browser
  XLSX.writeFile(wb, "Laporan_Insight_Reelsight.xlsx");
  toast("Berhasil mengunduh file Excel!", "success");
});

/* ==========================================================================
   PLANNER LOGIC
   ========================================================================== */
const planOverlay = $("#plannerModalOverlay");
const fieldsPlan = ["title", "format", "objective", "concept", "script"];

function renderPlannerGrid() {
  const grid = $("#plannerGrid");
  if(!grid) return;
  grid.innerHTML = "";
  const kw = $("#planSearchInput")?.value.toLowerCase();
  const dateFilt = $("#planDateFilter")?.value;
  const statFilt = $("#planStatusFilter")?.value;
  const fmtFilt = $("#planFormatFilter")?.value;
  let list = plannerData.filter(p => {
    if(kw && !(p.title.toLowerCase().includes(kw) || p.objective.toLowerCase().includes(kw))) return false;
    if(dateFilt && p.createdDate !== dateFilt) return false;
    if(statFilt && p.status !== statFilt) return false;
    if(fmtFilt && p.format !== fmtFilt) return false;
    return true;
  });
  
  if($("#plannerEmptyHint")) $("#plannerEmptyHint").hidden = list.length > 0;
  list.sort((a,b)=> new Date(b.createdDate) - new Date(a.createdDate));
  
  list.forEach(p => {
    const card = document.createElement("div");
    card.className = `plan-card format-${p.format} status-${p.status}`; card.dataset.id = p.id;
    card.innerHTML = `<div class="plan-header"><div class="plan-meta"><span class="plan-date">${fmtDate(p.createdDate)}</span><span class="plan-format-badge">${p.format}</span></div><h3 class="plan-title">${escapeHtml(p.title)}</h3><div class="plan-status-wrap"><select class="status-select" data-id="${p.id}"><option value="planned" ${p.status==='planned'?'selected':''}>⏳ Planned</option><option value="progress" ${p.status==='progress'?'selected':''}>🔥 In Progress</option><option value="done" ${p.status==='done'?'selected':''}>✅ Done</option><option value="cancel" ${p.status==='cancel'?'selected':''}>❌ Cancelled</option></select></div></div><div class="plan-body"><details class="plan-details"><summary>Lihat Rincian Plan</summary><div class="plan-details-content"><div class="plan-section"><strong>Objective</strong><p>${escapeHtml(p.objective) || "-"}</p></div><div class="plan-section"><strong>Konsep / Visual</strong><p>${escapeHtml(p.concept) || "-"}</p></div><div class="plan-section"><strong>Script</strong><p>${escapeHtml(p.script) || "-"}</p></div></div></details></div><div class="plan-footer"><button class="btn-edit-plan" data-act="edit-plan" data-id="${p.id}">✎ Edit Plan</button></div>`;
    
    card.querySelector(".status-select")?.addEventListener("change", (e) => {
      const idx = plannerData.findIndex(x => x.id === p.id);
      if(idx > -1) { plannerData[idx].status = e.target.value; saveJSON(LS_PLANNER_DATA, plannerData); renderPlannerGrid(); syncPlanToSheet(plannerData[idx]); }
    });
    card.querySelector(".btn-edit-plan")?.addEventListener("click", () => openPlanModal(p.id));
    grid.appendChild(card);
  });
}

function openPlanModal(editId=null) {
  plannerEditId = editId; 
  if(planOverlay) planOverlay.hidden = false; document.body.style.overflow = "hidden";
  if(editId) {
    const d = plannerData.find(x => x.id === editId); 
    if($("#planModalTitle")) $("#planModalTitle").textContent = "Edit Plan Konten"; 
    fieldsPlan.forEach(f => { if($("#p_"+f)) $("#p_"+f).value = d[f] ?? ""; });
  } else {
    if($("#planModalTitle")) $("#planModalTitle").textContent = "Tambah Plan Baru";
    const saved = loadJSON(LS_PLANNER_DRAFT, null);
    if(saved && saved._id === "new") { fieldsPlan.forEach(f => { if($("#p_"+f)) $("#p_"+f).value = saved[f] ?? ""; }); } 
    else { fieldsPlan.forEach(f => { if($("#p_"+f)) $("#p_"+f).value = ""; }); if($("#p_format")) $("#p_format").value = "video"; }
  }
}

function closePlanModal() { if(planOverlay) planOverlay.hidden = true; document.body.style.overflow = ""; plannerEditId = null; }

$("#openPlanModalBtn")?.addEventListener("click", () => openPlanModal(null));
$("#planModalCloseBtn")?.addEventListener("click", closePlanModal);
$("#cancelPlanModalBtn")?.addEventListener("click", closePlanModal);
planOverlay?.addEventListener("click", (e)=>{ if(e.target === planOverlay) closePlanModal(); });

fieldsPlan.forEach(f => {
  $("#p_"+f)?.addEventListener("input", () => {
    if(plannerEditId) return;
    const obj = { _id: "new" }; fieldsPlan.forEach(k => { if($("#p_"+k)) obj[k] = $("#p_"+k).value; }); saveJSON(LS_PLANNER_DRAFT, obj); flashSaved();
  });
});

$("#savePlanBtn")?.addEventListener("click", () => {
  if(!$("#p_title")?.value.trim()){ toast("Judul plan wajib diisi", "error"); return; }
  const payload = {}; fieldsPlan.forEach(f => { if($("#p_"+f)) payload[f] = $("#p_"+f).value.trim(); });
  let targetPlan = null;
  if(plannerEditId) {
    const idx = plannerData.findIndex(x => x.id === plannerEditId);
    if(idx !== -1) { plannerData[idx] = { ...plannerData[idx], ...payload }; targetPlan = plannerData[idx]; toast("Plan diperbarui", "success"); }
  } else {
    payload.id = "p_" + Date.now() + Math.random().toString(36).slice(2,5); payload.createdDate = new Date().toISOString().split('T')[0]; payload.status = "planned"; 
    plannerData.unshift(payload); targetPlan = payload; toast("Plan baru ditambahkan", "success");
  }
  saveJSON(LS_PLANNER_DATA, plannerData); renderPlannerGrid(); localStorage.removeItem(LS_PLANNER_DRAFT); closePlanModal();
  if(targetPlan) syncPlanToSheet(targetPlan);
});

async function syncPlanToSheet(planObj) {
  if(typeof APPS_SCRIPT_URL === 'undefined' || !APPS_SCRIPT_URL.includes("http")) return;
  try { await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "sync_plan", plan: planObj }) }); } catch(e) { toast("Gagal membackup plan", "error"); }
}

async function fetchPlannerData() {
  if(typeof APPS_SCRIPT_URL === 'undefined' || !APPS_SCRIPT_URL.includes("http")) return;
  if($("#topLoadingBar")) $("#topLoadingBar").hidden = false; 
  if($("#plannerStatus")) $("#plannerStatus").textContent = "Sinkronisasi planner...";
  try {
    const res = await fetch(APPS_SCRIPT_URL + "?action=list_plans"); const json = await res.json();
    if(json.ok) { plannerData = json.rows || []; saveJSON(LS_PLANNER_DATA, plannerData); if($("#plannerStatus")) $("#plannerStatus").textContent = `Update: ${new Date().toLocaleTimeString('id-ID')}`; }
  } catch(e) { if($("#plannerStatus")) $("#plannerStatus").textContent = "Gagal memuat server."; } 
  finally { if($("#topLoadingBar")) $("#topLoadingBar").hidden = true; renderPlannerGrid(); }
}
$("#refreshPlannerBtn")?.addEventListener("click", fetchPlannerData);
["planSearchInput", "planDateFilter", "planStatusFilter", "planFormatFilter"].forEach(id => { $("#"+id)?.addEventListener("input", renderPlannerGrid); $("#"+id)?.addEventListener("change", renderPlannerGrid); });

/* INIT */
renderDrafts(); 
renderPlannerGrid();
