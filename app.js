/* ==========================================================================
   REELSIGHT — app.js (Insight & Planner)
   ========================================================================== */

/* ---------- Storage keys ---------- */
const LS_DRAFTS = "reelsight_drafts_v2";       
const LS_FORMDRAFT = "reelsight_formdraft_v2";    
const LS_SHEETCACHE = "reelsight_sheetcache_v2"; 
const LS_PLANNER_DATA = "reelsight_planner_v1";
const LS_PLANNER_DRAFT = "reelsight_planner_form_v1";

/* ---------- State ---------- */
let drafts = loadJSON(LS_DRAFTS, []);          
let sheetData = loadJSON(LS_SHEETCACHE, []);   
let plannerData = loadJSON(LS_PLANNER_DATA, []);
let currentEditId = null;                      
let plannerEditId = null;
let currentImageDataUrl = null;                
let activeTab = "input";

/* ---------- Helpers ---------- */
function loadJSON(key, fallback){ try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }catch(e){ return fallback; } }
function saveJSON(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }
function uid(){ return "d_" + Date.now() + "_" + Math.random().toString(36).slice(2,8); }
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

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
  flashSaved._t = setTimeout(()=>{ el.querySelector(".dot").style.background = "var(--teal)"; el.lastChild.textContent = " Tersimpan otomatis"; }, 500);
}
function fmtNum(n){ return (Number(n) || 0).toLocaleString("id-ID"); }
function fmtDate(d){
  if(!d) return "-";
  try{ return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric" }); }
  catch(e){ return d; }
}

/* ==========================================================================
   TAB NAVIGATION
   ========================================================================== */
$all(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    activeTab = btn.dataset.tab;
    $all(".tab-btn").forEach(b=>{ b.classList.toggle("active", b===btn); });
    
    $("#panel-input").classList.toggle("hidden", activeTab!=="input");
    $("#panel-lihat").classList.toggle("hidden", activeTab!=="lihat");
    $("#panel-planner").classList.toggle("hidden", activeTab!=="planner");
    $("#appFooter").classList.toggle("hide", activeTab!=="input");
    
    if(activeTab === "lihat") fetchSheetData();
    // PERBAIKAN: Hanya auto-fetch saat planner kosong agar plan yang baru tidak tertimpa. 
    // Sisanya user bisa pakai tombol ↻ Sync
    if(activeTab === "planner" && plannerData.length === 0) fetchPlannerData(); 
  });
});

/* ==========================================================================
   INSIGHT LOGIC
   ========================================================================== */
function renderDrafts(){
  const grid = $("#draftGrid");
  grid.querySelectorAll(".insight-card").forEach(n=>n.remove());
  $("#draftEmptyHint").hidden = drafts.length > 0;
  
  [...drafts].sort((a,b)=> (b._createdAt||0) - (a._createdAt||0)).forEach((d, i)=>{
    const card = buildCard(d, true); card.style.animationDelay = (i*0.04)+"s"; grid.appendChild(card);
  });
  const badge = $("#pendingBadge"); badge.hidden = drafts.length === 0; badge.textContent = drafts.length;
  $("#footerCount").textContent = drafts.length; $("#sendAllBtn").disabled = drafts.length === 0;
}

function buildCard(d, editable){
  const card = document.createElement("div");
  card.className = "insight-card";
  const img = d.image ? `<img class="thumb" src="${d.image}">` : `<div class="thumb-fallback">🎬</div>`;
  
  let details = editable ? `
    <div class="card-stats">
      <div class="card-stat"><b>${d.views || "0"}</b><span>Tayangan</span></div>
      <div class="card-stat"><b>${fmtNum(d.likes)}</b><span>Suka</span></div>
      <div class="card-stat"><b>${fmtNum(d.saves)}</b><span>Disimpan</span></div>
    </div>
    <div class="card-actions">
      <button class="card-edit" data-act="edit">✎ Edit</button>
      <button class="card-delete" data-act="delete">🗑 Hapus</button>
    </div>` : `
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
    
  card.innerHTML = `${img}<div class="card-body"><div class="card-date">${fmtDate(d.posted)}</div><div class="card-title">${escapeHtml(d.title || "(Tanpa judul)")}</div>${details}</div>`;
  
  if(editable){
    card.querySelector('[data-act="edit"]').addEventListener("click", ()=> openModal(d.id));
    card.querySelector('[data-act="delete"]').addEventListener("click", ()=>{
      if(confirm("Hapus insight ini?")){ drafts = drafts.filter(x=>x.id !== d.id); saveJSON(LS_DRAFTS, drafts); renderDrafts(); }
    });
  } else {
    const copyBtn = card.querySelector('[data-act="copy"]');
    if (copyBtn) copyBtn.addEventListener("click", () => {
      const text = `Konten reels IG tanggal ${fmtDate(d.posted)}, dengan judul "${d.title || "-"}", memiliki naskah script :

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
      navigator.clipboard.writeText(text).then(()=> toast("Disalin! Siap dipaste","success"));
    });
  }
  return card;
}

const overlay = $("#modalOverlay");
const fieldsInsight = ["title","script","posted","downloaded","caption","views","reach","duration","watchtime","likes","comments","reposts","shares","saves"];

function openModal(editId=null){
  currentEditId = editId; overlay.hidden = false; document.body.style.overflow = "hidden";
  if(editId){
    const d = drafts.find(x=>x.id===editId);
    $("#modalTitle").textContent = "Edit Insight";
    fieldsInsight.forEach(f=> $("#f_"+f).value = d[f] ?? "");
    setImage(d.image || null, false);
  } else {
    $("#modalTitle").textContent = "Tambah Insight Baru";
    const saved = loadJSON(LS_FORMDRAFT, null);
    if(saved && saved._id === "new"){ fieldsInsight.forEach(f=> $("#f_"+f).value = saved[f] ?? ""); setImage(saved.image || null, false); }
    else { fieldsInsight.forEach(f=> $("#f_"+f).value = ""); setImage(null, false); }
  }
}

// PERBAIKAN: Fungsi penutup modal tidak lagi menghapus memory draft agar data tetap aman saat tidak sengaja tertutup
function closeModal(){ 
  overlay.hidden = true; 
  document.body.style.overflow = ""; 
  currentEditId = null; 
}

$("#openAddModal").addEventListener("click", ()=> openModal(null));
$("#modalCloseBtn").addEventListener("click", closeModal);
$("#cancelModalBtn").addEventListener("click", closeModal);
fieldsInsight.forEach(f=> $("#f_"+f).addEventListener("input", ()=>{
  if(currentEditId) return;
  const obj = { _id: "new", image: currentImageDataUrl };
  fieldsInsight.forEach(k=> obj[k] = $("#f_"+k).value);
  saveJSON(LS_FORMDRAFT, obj); flashSaved();
}));

const fileInput = $("#fileInput");
$("#dropzone").addEventListener("click", ()=> fileInput.click());
fileInput.addEventListener("change", e=>{ if(e.target.files[0]) {
  const reader = new FileReader(); reader.onload = ()=> { setImage(reader.result, true); }; reader.readAsDataURL(e.target.files[0]);
}});
function setImage(dataUrl, trig){ currentImageDataUrl = dataUrl; $("#previewImg").src=dataUrl||""; $("#dropzoneEmpty").hidden=!!dataUrl; $("#dropzonePreview").hidden=!dataUrl; $("#scanBtn").disabled=!dataUrl; if(trig)flashSaved(); }

$("#saveCardBtn").addEventListener("click", ()=>{
  if(!$("#f_title").value.trim()){ toast("Judul konten wajib diisi", "error"); return; }
  const payload = { image: currentImageDataUrl };
  fieldsInsight.forEach(f=> payload[f] = $("#f_"+f).value.trim());
  if(currentEditId){
    const idx = drafts.findIndex(x=>x.id===currentEditId);
    if(idx !== -1) drafts[idx] = { ...drafts[idx], ...payload };
    toast("Insight diperbarui", "success");
  } else {
    payload.id = uid(); payload._createdAt = Date.now(); drafts.push(payload); toast("Insight ditambahkan", "success");
  }
  
  saveJSON(LS_DRAFTS, drafts); 
  renderDrafts(); 
  
  // PERBAIKAN: Draft di hapus HANYA jika kartu sudah berhasil disimpan
  localStorage.removeItem(LS_FORMDRAFT); 
  closeModal();
});

$("#sendAllBtn").addEventListener("click", async ()=>{
  if(drafts.length === 0) return;
  $("#sendAllBtn").disabled = true; $("#sendAllBtn").textContent = "Mengirim...";
  try{
    const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "append", rows: drafts }) });
    const json = await res.json();
    if(json.ok){ toast(`${drafts.length} insight berhasil dikirim`, "success"); drafts = []; saveJSON(LS_DRAFTS, drafts); renderDrafts(); sheetData = []; saveJSON(LS_SHEETCACHE, []); }
    else throw new Error("Gagal backend");
  }catch(e){ toast("Gagal mengirim", "error"); }
  finally{ $("#sendAllBtn").disabled = drafts.length===0; $("#sendAllBtn").innerHTML = "Kirim ke Spreadsheet"; }
});

async function fetchSheetData(){
  if(!APPS_SCRIPT_URL.includes("http")) return;
  $("#topLoadingBar").hidden = false;
  try{
    const res = await fetch(APPS_SCRIPT_URL + "?action=list"); const json = await res.json();
    sheetData = json.rows || []; saveJSON(LS_SHEETCACHE, sheetData);
  }catch(e){} finally{ $("#topLoadingBar").hidden = true; renderSheetGrid(); }
}
function renderSheetGrid(){
  const grid = $("#sheetGrid"); grid.innerHTML = "";
  const kw = $("#searchInput").value.toLowerCase(), from = $("#dateFrom").value, to = $("#dateTo").value;
  let list = sheetData.filter(d=>{
    if(kw && !((d.title||"").toLowerCase().includes(kw))) return false;
    if(from && d.posted < from) return false; if(to && d.posted > to) return false; return true;
  });
  list.sort((a,b)=> (b._createdAt||0) - (a._createdAt||0)).forEach(d=> grid.appendChild(buildCard(d, false)));
  $("#sheetEmptyHint").hidden = list.length > 0;
}
["searchInput","dateFrom","dateTo","sortSelect"].forEach(id=> $("#"+id).addEventListener("input", renderSheetGrid));
$("#refreshSheetBtn").addEventListener("click", fetchSheetData);


/* ==========================================================================
   PLANNER LOGIC
   ========================================================================== */
const planOverlay = $("#plannerModalOverlay");
const fieldsPlan = ["title", "format", "objective", "concept", "script"];

function renderPlannerGrid() {
  const grid = $("#plannerGrid");
  grid.innerHTML = "";
  
  const kw = $("#planSearchInput").value.toLowerCase();
  const dateFilt = $("#planDateFilter").value;
  const statFilt = $("#planStatusFilter").value;
  const fmtFilt = $("#planFormatFilter").value;
  
  let list = plannerData.filter(p => {
    if(kw && !(p.title.toLowerCase().includes(kw) || p.objective.toLowerCase().includes(kw))) return false;
    if(dateFilt && p.createdDate !== dateFilt) return false;
    if(statFilt && p.status !== statFilt) return false;
    if(fmtFilt && p.format !== fmtFilt) return false;
    return true;
  });
  
  $("#plannerEmptyHint").hidden = list.length > 0;
  list.sort((a,b)=> new Date(b.createdDate) - new Date(a.createdDate));
  
  list.forEach(p => {
    const card = document.createElement("div");
    card.className = `plan-card format-${p.format} status-${p.status}`;
    card.dataset.id = p.id;
    
    card.innerHTML = `
      <div class="plan-header">
        <div class="plan-meta">
          <span class="plan-date">${fmtDate(p.createdDate)}</span>
          <span class="plan-format-badge">${p.format}</span>
        </div>
        <h3 class="plan-title">${escapeHtml(p.title)}</h3>
        <div class="plan-status-wrap">
          <select class="status-select" data-id="${p.id}">
            <option value="planned" ${p.status==='planned'?'selected':''}>⏳ Planned</option>
            <option value="progress" ${p.status==='progress'?'selected':''}>🔥 In Progress</option>
            <option value="done" ${p.status==='done'?'selected':''}>✅ Done</option>
            <option value="cancel" ${p.status==='cancel'?'selected':''}>❌ Cancelled</option>
          </select>
        </div>
      </div>
      <div class="plan-body">
        <details class="plan-details">
          <summary>Lihat Rincian Plan</summary>
          <div class="plan-details-content">
            <div class="plan-section"><strong>Objective</strong><p>${escapeHtml(p.objective) || "-"}</p></div>
            <div class="plan-section"><strong>Konsep / Visual</strong><p>${escapeHtml(p.concept) || "-"}</p></div>
            <div class="plan-section"><strong>Script</strong><p>${escapeHtml(p.script) || "-"}</p></div>
          </div>
        </details>
      </div>
      <div class="plan-footer">
        <button class="btn-edit-plan" data-act="edit-plan" data-id="${p.id}">✎ Edit Plan</button>
      </div>
    `;
    
    card.querySelector(".status-select").addEventListener("change", (e) => {
      const newStatus = e.target.value;
      const idx = plannerData.findIndex(x => x.id === p.id);
      if(idx > -1) {
        plannerData[idx].status = newStatus;
        saveJSON(LS_PLANNER_DATA, plannerData);
        renderPlannerGrid(); 
        syncPlanToSheet(plannerData[idx]); 
      }
    });
    
    card.querySelector(".btn-edit-plan").addEventListener("click", () => openPlanModal(p.id));
    grid.appendChild(card);
  });
}

function openPlanModal(editId=null) {
  plannerEditId = editId; 
  planOverlay.hidden = false; 
  document.body.style.overflow = "hidden";
  
  if(editId) {
    const d = plannerData.find(x => x.id === editId);
    $("#planModalTitle").textContent = "Edit Plan Konten";
    fieldsPlan.forEach(f => $("#p_"+f).value = d[f] ?? "");
  } else {
    $("#planModalTitle").textContent = "Tambah Plan Baru";
    const saved = loadJSON(LS_PLANNER_DRAFT, null);
    if(saved && saved._id === "new") {
      fieldsPlan.forEach(f => $("#p_"+f).value = saved[f] ?? "");
    } else {
      fieldsPlan.forEach(f => $("#p_"+f).value = "");
      $("#p_format").value = "video"; 
    }
  }
}

// PERBAIKAN: Tidak menghapus memory form draft saat ditutup. 
function closePlanModal() { 
  planOverlay.hidden = true; 
  document.body.style.overflow = ""; 
  plannerEditId = null; 
}

$("#openPlanModalBtn").addEventListener("click", () => openPlanModal(null));
$("#planModalCloseBtn").addEventListener("click", closePlanModal);
$("#cancelPlanModalBtn").addEventListener("click", closePlanModal);
planOverlay.addEventListener("click", (e)=>{ if(e.target === planOverlay) closePlanModal(); });

fieldsPlan.forEach(f => $("#p_"+f).addEventListener("input", () => {
  if(plannerEditId) return;
  const obj = { _id: "new" };
  fieldsPlan.forEach(k => obj[k] = $("#p_"+k).value);
  saveJSON(LS_PLANNER_DRAFT, obj); 
  flashSaved();
}));

$("#savePlanBtn").addEventListener("click", () => {
  if(!$("#p_title").value.trim()){ toast("Judul plan wajib diisi", "error"); return; }
  
  const payload = {};
  fieldsPlan.forEach(f => payload[f] = $("#p_"+f).value.trim());
  
  let targetPlan = null;
  
  if(plannerEditId) {
    const idx = plannerData.findIndex(x => x.id === plannerEditId);
    if(idx !== -1) {
      plannerData[idx] = { ...plannerData[idx], ...payload };
      targetPlan = plannerData[idx];
      toast("Plan diperbarui", "success");
    }
  } else {
    const now = new Date();
    payload.id = "p_" + Date.now() + Math.random().toString(36).slice(2,5);
    payload.createdDate = now.toISOString().split('T')[0];
    payload.status = "planned"; 
    plannerData.unshift(payload);
    targetPlan = payload;
    toast("Plan baru ditambahkan", "success");
  }
  
  saveJSON(LS_PLANNER_DATA, plannerData);
  renderPlannerGrid();
  
  // PERBAIKAN: Hapus form draft HANYA kalau sudah berhasil di-submit
  localStorage.removeItem(LS_PLANNER_DRAFT);
  closePlanModal();
  
  if(targetPlan) syncPlanToSheet(targetPlan);
});

async function syncPlanToSheet(planObj) {
  if(!APPS_SCRIPT_URL.includes("http")) return;
  try {
    await fetch(APPS_SCRIPT_URL, { 
      method: "POST", 
      body: JSON.stringify({ action: "sync_plan", plan: planObj }) 
    });
  } catch(e) {
    console.error("Gagal sync plan:", e);
    toast("Gagal membackup plan ke Sheet. Cek koneksi internet.", "error");
  }
}

async function fetchPlannerData() {
  if(!APPS_SCRIPT_URL.includes("http")) return;
  $("#topLoadingBar").hidden = false;
  $("#plannerStatus").textContent = "Sinkronisasi planner dari server...";
  try {
    const res = await fetch(APPS_SCRIPT_URL + "?action=list_plans");
    const json = await res.json();
    if(json.ok) {
      plannerData = json.rows || [];
      saveJSON(LS_PLANNER_DATA, plannerData);
      $("#plannerStatus").textContent = `Update terakhir: ${new Date().toLocaleTimeString('id-ID')}`;
    }
  } catch(e) {
    $("#plannerStatus").textContent = "Gagal memuat dari server, menampilkan data lokal.";
  } finally {
    $("#topLoadingBar").hidden = true;
    renderPlannerGrid();
  }
}
$("#refreshPlannerBtn").addEventListener("click", fetchPlannerData);

["planSearchInput", "planDateFilter", "planStatusFilter", "planFormatFilter"].forEach(id => {
  $("#"+id).addEventListener("input", renderPlannerGrid);
  $("#"+id).addEventListener("change", renderPlannerGrid);
});


/* INIT */
renderDrafts();
renderPlannerGrid();
