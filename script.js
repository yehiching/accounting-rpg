/**
 * 會計RPG MVP
 * - 任務：每個 quest 有正確分錄答案（多行）
 * - 玩家輸入分錄：檢查 借貸平衡 + 科目/方向/金額是否吻合（允許行順序不同）
 * - 通關後才能過帳，累積總帳與試算表
 * - 存檔：localStorage
 */

window.addEventListener("error", (e) => {
  const msg = e?.message || String(e);
  const at  = e?.filename ? `${e.filename}:${e.lineno}:${e.colno}` : "";
  const box = document.querySelector("#feedback");
  if (box) {
    box.className = "msg bad";
    box.textContent = `JS 錯誤：${msg} ${at}`;
  } else {
    alert(`JS 錯誤：${msg}\n${at}`);
  }
});
const STORE_KEY = "acct_rpg_save_v1";

/** 科目表（可擴充） */
const ACCOUNTS = [
  // 資產
  { id:"101", name:"現金", type:"A", normal:"D" },
  { id:"112", name:"應收帳款", type:"A", normal:"D" },
  { id:"121", name:"存貨", type:"A", normal:"D" },
  { id:"141", name:"預付租金", type:"A", normal:"D" },
  // 負債
  { id:"201", name:"應付帳款", type:"L", normal:"C" },
  { id:"211", name:"預收收入", type:"L", normal:"C" },
  // 權益
  { id:"301", name:"資本", type:"E", normal:"C" },
  // 收入
  { id:"401", name:"銷貨收入", type:"R", normal:"C" },
  { id:"411", name:"服務收入", type:"R", normal:"C" },
  // 費用
  { id:"501", name:"租金費用", type:"X", normal:"D" },
  { id:"511", name:"薪資費用", type:"X", normal:"D" },
  { id:"521", name:"進貨（銷貨成本）", type:"X", normal:"D" },
  { id:"531", name:"水電費", type:"X", normal:"D" },
];

/** 任務資料（可新增更多） */
let QUESTS = [
  {
    id:"Q1",
    title:"手搖飲店：開業投入資本",
    shop:"青和手搖飲",
    difficulty:"新手",
    score: 35,
    voucher:
`【憑證】銀行存款單
店主投入現金 NT$ 50,000 作為開業資金。`,
    objective:"把「投入資本」入帳。提示：資產增加？權益增加？",
    answer: [
      { account:"現金", dc:"D", amt:50000 },
      { account:"資本", dc:"C", amt:50000 },
    ],
    hints:[
      "現金變多通常是「借 現金」。",
      "投入資本屬於權益增加，多數在「貸方」。"
    ]
  },
  {
    id:"Q2",
    title:"手搖飲店：現金銷售",
    shop:"青和手搖飲",
    difficulty:"新手",
    score: 40,
    voucher:
`【憑證】收銀日結單
今日現金銷售飲料收入 NT$ 3,200。`,
    objective:"把「現金銷售」入帳。提示：收入科目在哪一邊？",
    answer: [
      { account:"現金", dc:"D", amt:3200 },
      { account:"銷貨收入", dc:"C", amt:3200 },
    ],
    hints:[
      "現金流入 → 通常「借 現金」。",
      "收入增加 → 通常記在「貸方」。"
    ]
  },
  {
    id:"Q3",
    title:"手搖飲店：賒購原料",
    shop:"青和手搖飲",
    difficulty:"新手",
    score: 45,
    voucher:
`【憑證】進貨發票（未付款）
向供應商賒購原料 NT$ 8,000，約定下月付款。`,
    objective:"把「賒購」入帳。提示：存貨增加？負債增加？",
    answer: [
      { account:"存貨", dc:"D", amt:8000 },
      { account:"應付帳款", dc:"C", amt:8000 },
    ],
    hints:[
      "買進尚未付錢：資產（存貨）↑、負債（應付）↑。",
      "負債增加通常在「貸方」。"
    ]
  },
  {
    id:"Q4",
    title:"工作室：預付租金",
    shop:"青和工坊",
    difficulty:"新手",
    score: 50,
    voucher:
`【憑證】租金收據
一次支付未來 2 個月租金 NT$ 20,000（每月 10,000）。`,
    objective:"先把付款記成「資產」而不是「費用」。提示：預付是什麼？",
    answer: [
      { account:"預付租金", dc:"D", amt:20000 },
      { account:"現金", dc:"C", amt:20000 },
    ],
    hints:[
      "一次付未來的：先記「預付」（資產）。",
      "現金流出 → 通常「貸 現金」。"
    ]
  }
];

/** UI elements */
const $ = (sel) => document.querySelector(sel);
const questList = $("#questList");
const questBrief = $("#questBrief");
const voucherEl = $("#voucher");
const objectiveEl = $("#objective");
const accSel = $("#accSel");
const dcSel = $("#dcSel");
const amtSel = $("#amtSel");
const linesBody = $("#lines");
const sumD = $("#sumD");
const sumC = $("#sumC");
const feedback = $("#feedback");
const btnAdd = $("#btnAdd");
const btnClear = $("#btnClear");
const btnCheck = $("#btnCheck");
const btnPost = $("#btnPost");
const btnSeed = $("#btnSeed");
const btnDaily = $("#btnDaily");

const ledgerBody = $("#ledgerBody");
const trialBody = $("#trialBody");
const trialD = $("#trialD");
const trialC = $("#trialC");
const trialMsg = $("#trialMsg");

const lvEl = $("#lv");
const scoreEl = $("#score");
const scoreNeedEl = $("#scoreNeed");
const accEl = $("#acc");

let state = loadState();

/** Current quest + journal lines (unposted) */
let currentQuestId = state.currentQuestId || null;
let workingLines = state.workingLines || [];
let lastCheckPassed = state.lastCheckPassed || false;

/** Ledger store: accountName -> {D: total, C: total} */
let ledger = state.ledger || {};
let stats = state.stats || { attempts:0, passes:0, score:0, lv:1 };

function saveState(){
  const payload = {
    currentQuestId,
    workingLines,
    lastCheckPassed,
    ledger,
    stats
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(payload));
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return {};
    return JSON.parse(raw);
  }catch{
    return {};
  }
}

function resetState(){
  localStorage.removeItem(STORE_KEY);
  state = {};
  currentQuestId = null;
  workingLines = [];
  lastCheckPassed = false;
  ledger = {};
  stats = { attempts:0, passes:0, score:0, lv:1 };
  renderAll();
}

function scoreNeedForLevel(lv){
  // 稍微成長曲線
  return 100 + (lv-1)*60;
}

function addscore(amount){
  stats.score += amount;
  while(stats.score >= scoreNeedForLevel(stats.lv)){
    stats.score -= scoreNeedForLevel(stats.lv);
    stats.lv += 1;
    toast(`升級！你現在 Lv ${stats.lv}`, "good");
  }
}


function accuracy(){
  if(stats.attempts === 0) return 0;
  return Math.round((stats.passes / stats.attempts)*100);
}

function toast(text, kind=""){
  feedback.className = "msg" + (kind ? " " + kind : "");
  feedback.innerHTML = text;
}

function initAccountsSelect(){
  const opts = ACCOUNTS.map(a => `<option value="${a.name}">${a.id}｜${a.name}</option>`).join("");
  accSel.innerHTML = `<option value="">選擇科目…</option>${opts}`;
}

function renderQuests(){
  questList.innerHTML = "";
  QUESTS.forEach(q=>{
    const active = q.id === currentQuestId;
    const tagClass = q.difficulty === "新手" ? "good" : "warn";
    const el = document.createElement("div");
    el.className = "quest";
    el.innerHTML = `
      <div class="meta">
        <span class="tag ${tagClass}">${q.difficulty}</span>
        <span class="tag">Score +${q.score}</span>
        <span class="tag">${q.shop}</span>
      </div>
      <h3>${q.title}</h3>
      <p>${q.objective}</p>
      <div class="row">
        <button class="btn ${active ? "secondary" : ""}" data-pick="${q.id}">${active ? "已選擇" : "接任務"}</button>
        <button class="btn secondary" data-peek="${q.id}">看提示</button>
      </div>
    `;
    questList.appendChild(el);
  });

  questList.querySelectorAll("[data-pick]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-pick");
      pickQuest(id);
    });
  });
  questList.querySelectorAll("[data-peek]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-peek");
      const q = QUESTS.find(x=>x.id===id);
      if(!q) return;
      const h = q.hints.map((x,i)=>`<div>提示 ${i+1}：${escapeHtml(x)}</div>`).join("");
      toast(`<b>提示卡</b><div style="margin-top:6px">${h}</div>`, "warn");
    });
  });
}

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function pickQuest(id){
  currentQuestId = id;
  workingLines = [];
  lastCheckPassed = false;
  btnPost.disabled = true;
  renderCurrentQuest();
  renderLines();
  toast("任務已接取：先依憑證做分錄，然後按「檢查＆送出」。");
  saveState();
}

function renderCurrentQuest(){
  const q = QUESTS.find(x=>x.id===currentQuestId);
  if(!q){
    questBrief.className = "msg";
    questBrief.textContent = "請先在左邊選擇一個任務。";
    voucherEl.textContent = "";
    objectiveEl.textContent = "";
    return;
  }
  questBrief.className = "msg";
  questBrief.innerHTML = `<b>${q.title}</b>（${q.shop}｜Score +${q.score}）`;
  voucherEl.textContent = q.voucher;
  objectiveEl.textContent = q.objective;
}

function renderLines(){
  linesBody.innerHTML = "";
  let d=0,c=0;
  workingLines.forEach((ln, idx)=>{
    const isD = ln.dc === "D";
    const deb = isD ? ln.amt : 0;
    const cre = !isD ? ln.amt : 0;
    d += deb; c += cre;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(ln.account)}</td>
      <td class="right mono">${deb ? deb.toLocaleString() : ""}</td>
      <td class="right mono">${cre ? cre.toLocaleString() : ""}</td>
      <td class="right">
        <button class="btn secondary" data-del="${idx}" style="padding:6px 10px; border-radius:10px">刪除</button>
      </td>
    `;
    linesBody.appendChild(tr);
  });
  sumD.textContent = d.toLocaleString();
  sumC.textContent = c.toLocaleString();

  linesBody.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const i = Number(btn.getAttribute("data-del"));
      workingLines.splice(i,1);
      lastCheckPassed = false;
      btnPost.disabled = true;
      renderLines();
      saveState();
    });
  });
}

function addLine(){
  const acc = accSel.value;
  const dc = dcSel.value;
  const amt = Number(amtSel.value);

  if(!currentQuestId){
    toast("先接一個任務喔（左邊任務板）。", "warn");
    return;
  }
  if(!acc){
    toast("請先選一個科目。", "warn");
    return;
  }
  if(!Number.isFinite(amt) || amt<=0){
    toast("金額要輸入大於 0 的數字。", "warn");
    return;
  }
  workingLines.push({ account:acc, dc, amt: Math.round(amt) });
  amtSel.value = "";
  lastCheckPassed = false;
  btnPost.disabled = true;
  renderLines();
  saveState();
}
function checkEntry(){
  toast("checkEntry() 有被按到", "warn");
  const q = QUESTS.find(x=>x.id===currentQuestId);
  if(!q){ toast("請先接任務。", "warn"); return; }

  stats.attempts += 1;

  // 1) 借貸平衡檢查
  const totalD = workingLines.filter(x=>x.dc==="D").reduce((s,x)=>s+x.amt,0);
  const totalC = workingLines.filter(x=>x.dc==="C").reduce((s,x)=>s+x.amt,0);
  if(totalD !== totalC){
    lastCheckPassed = false;
    btnPost.disabled = true;
    toast(`借貸不平衡：借 ${totalD.toLocaleString()}、貸 ${totalC.toLocaleString()}。先把它配平。`, "bad");
    saveState();
    renderStats();
    return;
  }

  // 2) 正確性檢查：允許順序不同，但科目/方向/金額需吻合
  const normalize = (lines)=> lines
    .map(x=>`${x.account}|${x.dc}|${x.amt}`)
    .sort();

  const userNorm = normalize(workingLines);
  const ansNorm  = normalize(q.answer);

  const sameLen = userNorm.length === ansNorm.length;
  const sameAll = sameLen && userNorm.every((v,i)=>v===ansNorm[i]);

  if(sameAll){
    lastCheckPassed = true;
    stats.passes += 1;
    btnPost.disabled = false;
    addscore(q.score);
    toast(
      `通關成功 ✅<br/>
       你把這筆交易分錄做對了！現在可以按「過帳」把它寫入總帳。<br/>
       <span class="sub">小提醒：過帳後才會出現在總帳/試算表。</span>`,
      "good"
    );
  }else{
    lastCheckPassed = false;
    btnPost.disabled = true;

    // 提示：比較差異
    const want = new Set(ansNorm);
    const have = new Set(userNorm);
    const missing = [...want].filter(x=>!have.has(x));
    const extra = [...have].filter(x=>!want.has(x));

    let msg = `接近了，但還沒完全正確 ❗<br/>`;
    if(missing.length){
      msg += `<div style="margin-top:6px"><b>可能少了：</b><div class="mono" style="margin-top:4px">${missing.map(escapeHtml).join("<br/>")}</div></div>`;
    }
    if(extra.length){
      msg += `<div style="margin-top:6px"><b>可能多了／方向或金額不對：</b><div class="mono" style="margin-top:4px">${extra.map(escapeHtml).join("<br/>")}</div></div>`;
    }
    msg += `<div style="margin-top:8px">你可以按「看提示」拿線索，但我不直接給答案。</div>`;
    toast(msg, "warn");
  }

  saveState();
  renderStats();
}

function postEntry(){
  if(!lastCheckPassed){
    toast("要先「檢查＆送出」通關，才能過帳。", "warn");
    return;
  }
  const q = QUESTS.find(x=>x.id===currentQuestId);
  if(!q){ return; }

  // 寫入總帳
  workingLines.forEach(ln=>{
    if(!ledger[ln.account]) ledger[ln.account] = {D:0, C:0};
    ledger[ln.account][ln.dc] += ln.amt;
  });

  // 過帳後，任務完成：自動切到下一個任務（同店優先）
  toast(`已過帳 ✅ 分錄已寫入總帳。你可以去「總帳/試算表」看看變化。`, "good");

  // 清空工作台
  workingLines = [];
  lastCheckPassed = false;
  btnPost.disabled = true;

  // 自動挑下一個同店任務（若有）
  const idx = QUESTS.findIndex(x=>x.id===q.id);
  const next = QUESTS.slice(idx+1).find(x=>x.shop===q.shop) || QUESTS[idx+1] || null;
  currentQuestId = next ? next.id : null;

  renderAll();
  saveState();
}

function computeEndingBalance(accountName){
  const acc = ACCOUNTS.find(a=>a.name===accountName);
  const rec = ledger[accountName] || {D:0,C:0};
  // 期末餘額：依正常餘額決定正負
  // 若 normal=D => balance = D - C ; normal=C => balance = C - D
  if(!acc) return { D: rec.D, C: rec.C, bal: 0, side:"" };
  const bal = acc.normal==="D" ? (rec.D - rec.C) : (rec.C - rec.D);
  const side = bal >= 0 ? acc.normal : (acc.normal==="D" ? "C":"D"); // 若反向則側別翻轉
  return { D: rec.D, C: rec.C, bal: Math.abs(bal), side };
}

function renderLedger(){
  const names = ACCOUNTS.map(a=>a.name);
  ledgerBody.innerHTML = "";
  names.forEach(name=>{
    const rec = ledger[name] || {D:0,C:0};
    const eb = computeEndingBalance(name);
    if(rec.D===0 && rec.C===0) return; // 不顯示零活動科目
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(name)}</td>
      <td class="right mono">${rec.D.toLocaleString()}</td>
      <td class="right mono">${rec.C.toLocaleString()}</td>
      <td class="right mono">${eb.bal.toLocaleString()} ${eb.side ? (eb.side==="D" ? "（借）" : "（貸）") : ""}</td>
    `;
    ledgerBody.appendChild(tr);
  });
  if(!ledgerBody.children.length){
    ledgerBody.innerHTML = `<tr><td colspan="4" class="mono" style="color:rgba(170,179,218,.8); padding:12px;">目前沒有任何過帳紀錄。</td></tr>`;
  }
}

function renderTrialBalance(){
  trialBody.innerHTML = "";
  let totalDeb=0, totalCre=0;

  ACCOUNTS.forEach(a=>{
    const rec = ledger[a.name] || {D:0,C:0};
    if(rec.D===0 && rec.C===0) return;
    const eb = computeEndingBalance(a.name);
    let deb=0, cre=0;
    if(eb.side==="D") deb = eb.bal;
    if(eb.side==="C") cre = eb.bal;
    totalDeb += deb; totalCre += cre;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.id}｜${escapeHtml(a.name)}</td>
      <td class="right mono">${deb ? deb.toLocaleString() : ""}</td>
      <td class="right mono">${cre ? cre.toLocaleString() : ""}</td>
    `;
    trialBody.appendChild(tr);
  });

  trialD.textContent = totalDeb.toLocaleString();
  trialC.textContent = totalCre.toLocaleString();

  if(!trialBody.children.length){
    trialMsg.className = "msg";
    trialMsg.textContent = "尚未過帳任何分錄。";
    return;
  }

  if(totalDeb === totalCre){
    trialMsg.className = "msg good";
    trialMsg.innerHTML = `試算表平衡 ✅ 借貸合計皆為 <span class="mono">${totalDeb.toLocaleString()}</span>`;
  }else{
    const diff = Math.abs(totalDeb-totalCre);
    trialMsg.className = "msg bad";
    trialMsg.innerHTML = `試算表不平衡 ❌ 借 <span class="mono">${totalDeb.toLocaleString()}</span>、貸 <span class="mono">${totalCre.toLocaleString()}</span>，差額 <span class="mono">${diff.toLocaleString()}</span>`;
  }
}

function renderStats(){
  lvEl.textContent = String(stats.lv);
scoreEl.textContent = String(stats.score);
scoreNeedEl.textContent = String(scoreNeedForLevel(stats.lv));
  accEl.textContent = `${accuracy()}%`;
}

function renderAll(){
  renderQuests();
  renderCurrentQuest();
  renderLines();
  renderLedger();
  renderTrialBalance();
  renderStats();
}

function seedMoreQuests(){
  // 再塞一批（示範用：可自行擴充）
  const extra = [
    {
      id:"Q5",
      title:"手搖飲店：支付水電費（現金）",
      shop:"青和手搖飲",
      difficulty:"新手",
      score: 45,
      voucher:
`【憑證】水電繳費收據
以現金支付本月水電費 NT$ 1,500。`,
      objective:"費用增加？現金減少？",
      answer:[
        { account:"水電費", dc:"D", amt:1500 },
        { account:"現金", dc:"C", amt:1500 }
      ],
      hints:[
        "費用通常在借方增加。",
        "現金流出 → 貸現金。"
      ]
    },
    {
      id:"Q6",
      title:"手搖飲店：支付供應商貨款",
      shop:"青和手搖飲",
      difficulty:"新手",
      score: 55,
      voucher:
`【憑證】轉帳明細
支付上月賒購原料款 NT$ 8,000。`,
      objective:"把「還應付」入帳：負債減少在哪邊？",
      answer:[
        { account:"應付帳款", dc:"D", amt:8000 },
        { account:"現金", dc:"C", amt:8000 }
      ],
      hints:[
        "負債減少 → 通常記在借方（把它沖掉）。",
        "現金流出 → 貸現金。"
      ]
    }
  ];
  const ids = new Set(QUESTS.map(q=>q.id));
  extra.forEach(q=>{ if(!ids.has(q.id)) QUESTS.push(q); });
  renderQuests();
  toast("已載入更多任務 ✅", "good");
}

function dailyQuest(){
  // 產生一個隨機任務（簡單交易）
  const pool = [
    { title:"網拍：現金收到服務收入", shop:"青和網拍", score:45,
      voucher:`【憑證】入帳通知\n收到代客上架服務費 NT$ 2,000（現金入帳）。`,
      objective:"收入增加、現金增加。",
      answer:[{account:"現金",dc:"D",amt:2000},{account:"服務收入",dc:"C",amt:2000}],
      hints:["現金流入 → 借現金。","服務收入屬收入 → 貸方。"]
    },
    { title:"工坊：發放薪資（現金）", shop:"青和工坊", score:50,
      voucher:`【憑證】薪資表\n以現金支付本週工讀生薪資 NT$ 3,000。`,
      objective:"薪資費用增加、現金減少。",
      answer:[{account:"薪資費用",dc:"D",amt:3000},{account:"現金",dc:"C",amt:3000}],
      hints:["費用增加通常在借方。","現金流出 → 貸現金。"]
    }
  ];
  const pick = pool[Math.floor(Math.random()*pool.length)];
  const newId = "D" + Math.random().toString(16).slice(2,8).toUpperCase();
  const q = {
    id:newId,
    title: pick.title,
    shop: pick.shop,
    difficulty:"每日",
    score: pick.score,
    voucher: pick.voucher,
    objective: pick.objective,
    answer: pick.answer,
    hints: pick.hints
  };
  QUESTS.unshift(q);
  pickQuest(q.id);
  renderQuests();
  toast("今日委託已接取（隨機任務）✅", "good");
}

function initTabs(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.getAttribute("data-tab");
      $("#tab-workbench").style.display = tab==="workbench" ? "" : "none";
      $("#tab-ledger").style.display     = tab==="ledger" ? "" : "none";
      $("#tab-trial").style.display      = tab==="trial" ? "" : "none";
      // re-render for latest
      renderLedger();
      renderTrialBalance();
      saveState();
    });
  });
}

/** Wire events */
btnAdd.addEventListener("click", addLine);
btnClear.addEventListener("click", ()=>{
  workingLines = [];
  lastCheckPassed = false;
  btnPost.disabled = true;
  renderLines();
  toast("已清空分錄。", "warn");
  saveState();
});
btnCheck.addEventListener("click", checkEntry);
btnPost.addEventListener("click", postEntry);
btnSeed.addEventListener("click", seedMoreQuests);
btnDaily.addEventListener("click", dailyQuest);
$("#btnReset").addEventListener("click", resetState);

// Enter to add
amtSel.addEventListener("keydown", (e)=>{
  if(e.key==="Enter") addLine();
});

/** Boot */
initAccountsSelect();
initTabs();
renderAll();

// restore quest selection
if(currentQuestId){
  renderCurrentQuest();
  renderLines();
  if(lastCheckPassed) btnPost.disabled = false;
} else {
  voucherEl.textContent = "";
  objectiveEl.textContent = "";
  $("#voucher").textContent = "";
  $("#objective").textContent = "";
}

// If state had lines, show sums
renderLines();
renderStats();
renderLedger();
renderTrialBalance();
saveState();