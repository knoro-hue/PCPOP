"use strict";

const $ = (s, r = document) => r.querySelector(s);
const yen = (n) => (n == null ? "" : Number(n).toLocaleString("ja-JP"));

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}
const ed = (tag, cls, text) => el(tag, { class: cls, contenteditable: "true", text });

async function call(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

/* ------------------------------------------------------------ icons (24x24) */
const NAVY = "#0a2a7a";
const ICONS = {
  cpu: `<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9" y="9" width="6" height="6" fill="${NAVY}"/><path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3" stroke="currentColor" stroke-width="1.6"/>`,
  gpu: `<rect x="2" y="5" width="20" height="12" rx="1.5"/><circle cx="8.5" cy="11" r="3.4" fill="${NAVY}"/><circle cx="16.5" cy="11" r="2.4" fill="${NAVY}"/><path d="M4 17v3h7v-3" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  memory: `<rect x="2" y="6.5" width="20" height="9.5" rx="1"/><path d="M5 16v3M8 16v3M11 16v3M14 16v3M17 16v3M20 16v3" stroke="currentColor" stroke-width="1.5"/><rect x="4.5" y="9" width="3.5" height="4.5" fill="${NAVY}"/><rect x="10.3" y="9" width="3.5" height="4.5" fill="${NAVY}"/><rect x="16" y="9" width="3.5" height="4.5" fill="${NAVY}"/>`,
  storage: `<rect x="4" y="2.5" width="16" height="19" rx="2"/><rect x="7" y="15.5" width="10" height="3" rx="1" fill="${NAVY}"/>`,
};
const svg = (name) => el("span", { html: `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>` }).firstChild;

const bigImage = (u) => (u || "").replace(/([?&])sw=\d+/, "$1sw=1200");

/* ------------------------------------------------------------ state */
let sections = [];   // [{title, series, items}]
let section = null;  // 選択中のシリーズ
let picked = [];     // POPに載せるランキング項目 (選択順・最大3)
let topImgs = [];  // トップ画像 [手前, 奥] (黒＋白の2台並び or 1枚)
const slots = [0, 1, 2].map((i) => ({ i, cand: null, data: null }));

/* ------------------------------------------------------------ spec helpers */
function specFromData(d, label, detailed) {
  const s = d.keySpecs.find((x) => x.label === label);
  if (!s) return "";
  if (detailed) return s.display;
  let v = s.short || s.display;
  if (label === "メモリ") v = v.replace("メモリ", " ").replace(/\s+/g, " ").trim();
  return v;
}

function rowSpecs(s, detailed) {
  const d = s.data, c = s.cand;
  const get = (label, fromCand) => (d && specFromData(d, label, detailed)) || fromCand || "—";
  return [
    ["CPU", "cpu", get("CPU", c?.cpu)],
    ["グラフィックス", "gpu", get("GPU", c?.video)],
    ["メモリ", "memory", get("メモリ", c?.memory?.replace("メモリ", " ").replace(/\s+/g, " ").trim())],
    ["ストレージ", "storage", get("SSD", c?.storage)],
  ];
}

function splitName(name) {
  const m = (name || "").match(/^(.*?)\s*(『.*』.*)$/);
  return m ? [m[1], m[2]] : [name || "", ""];
}

/* ------------------------------------------------------------ POP: header */
function renderHeader() {
  if (!section) return;
  // 「Fシリーズ（ピラーレス）」→ 大見出し「Fシリーズ」+ タグ「ピラーレス」
  const m = section.series.match(/^(.*?)\s*[（(](.+)[)）]\s*$/);
  const main = m ? m[1] : section.series;
  const sub = m ? m[2] : "";
  $("#popSeries").textContent = main;
  const tag = $("#popSeriesSub");
  tag.textContent = sub;
  tag.hidden = !sub;
  const first = section.items[0]?.name || "";
  $("#popKicker").textContent = /^GALLERIA/i.test(first) ? "GALLERIA ゲーミングPC" : "ゲーミングPC";
  renderTopImage();
  fitSeries();
}

// シリーズ名を枠の幅に収まる最大サイズに
function fitSeries() {
  const ser = $("#popSeries");
  let mm = 24;
  ser.style.fontSize = mm + "mm";
  while (mm > 9 && ser.scrollWidth > ser.clientWidth + 1) {
    mm -= 0.5;
    ser.style.fontSize = mm + "mm";
  }
}

const sameImgs = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function renderTopImage() {
  const [a, b] = topImgs;
  const i1 = $("#popImg"), i2 = $("#popImg2");
  i1.hidden = !a; if (a) i1.src = a;
  i2.hidden = !b; if (b) i2.src = b;
  $("#rhImg").classList.toggle("pair", !!b);
  $("#topThumbs").querySelectorAll(".th").forEach((x) => x.classList.toggle("sel", sameImgs(x._imgs, topImgs)));
}

function defaultTopImgs(c) {
  if (!c) return [];
  return [bigImage(c.image), bigImage(c.image2)].filter((u, i, arr) => u && arr.indexOf(u) === i);
}

function buildTopThumbs() {
  const opts = [];
  const add = (imgs, label) => {
    imgs = imgs.filter(Boolean);
    if (imgs.length && !opts.some((o) => sameImgs(o.imgs, imgs))) opts.push({ imgs, label });
  };
  for (const it of section?.items || []) {
    const pair = defaultTopImgs(it);
    if (pair.length === 2) add(pair, `${it.rank}位 ${(it.colors || []).join("＋") || "2色"}`);
  }
  for (const it of section?.items || []) {
    add([bigImage(it.image)], `${it.rank}位 ${it.colors?.[0] || ""}`);
    add([bigImage(it.image2)], `${it.rank}位 ${it.colors?.[1] || ""}`);
  }
  for (const s of slots) if (s.data) s.data.images.forEach((u) => add([u], "商品ページ"));
  const box = $("#topThumbs");
  box.replaceChildren();
  for (const o of opts) {
    const th = el("div", { class: "th" + (o.imgs.length > 1 ? " pair" : ""), title: o.label },
      ...o.imgs.map((u) => el("img", { src: u, loading: "lazy", alt: "" })),
      el("span", { text: o.label }));
    th._imgs = o.imgs;
    th.onclick = () => { topImgs = o.imgs; renderTopImage(); };
    box.append(th);
  }
  $("#imgBox").hidden = !opts.length;
  renderTopImage();
}

$("#topImgFile").onchange = (e) => {
  const f = e.target.files[0];
  if (f) { topImgs = [URL.createObjectURL(f)]; renderTopImage(); }
};

/* ------------------------------------------------------------ POP: rank rows */
// 王冠アイコン（色は段の --m1/--m2/--m3 = 金・銀・銅）
function crownSvg(idx) {
  const g = `cg${idx}`;
  return `<svg class="crown-svg" viewBox="0 0 100 84" aria-hidden="true">
  <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" style="stop-color:var(--m1)"/><stop offset=".55" style="stop-color:var(--m2)"/><stop offset="1" style="stop-color:var(--m3)"/>
  </linearGradient></defs>
  <path d="M10 78 L5 28 L29 48 L50 12 L71 48 L95 28 L90 78 Z" fill="url(#${g})" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
  <rect x="10" y="66" width="80" height="12" fill="var(--m3)" opacity=".35"/>
  <circle cx="5" cy="25" r="5.5" fill="url(#${g})" stroke="#fff" stroke-width="2.5"/>
  <circle cx="50" cy="9" r="6" fill="url(#${g})" stroke="#fff" stroke-width="2.5"/>
  <circle cx="95" cy="25" r="5.5" fill="url(#${g})" stroke="#fff" stroke-width="2.5"/>
</svg>`;
}

function renderRow(s) {
  const row = $(`#row${s.i}`);
  row.replaceChildren();
  const c = s.cand;
  if (!c) {
    row.className = "rrow empty";
    row.textContent = `${s.i + 1}段目：モデル未選択`;
    return;
  }
  const rank = c.rank;
  row.className = `rrow rank-${rank <= 3 ? rank : "other"}`;
  const d = s.data;
  const [model, edition] = d ? [d.model, d.edition] : splitName(c.name);
  const price = d?.price ?? c.price;
  const inst = d?.installment?.monthly ? d.installment : c.installment;
  const stock = d?.stock || c.stock;

  const medal = el("div", { class: "medal" });
  medal.innerHTML = crownSvg(s.i);
  medal.append(el("div", { class: "num" }, ed("span", "no", `${rank}`), el("span", { class: "i", text: "位" })));

  const specs = el("div", { class: "specs" },
    ...rowSpecs(s, $("#optDetail").checked).map(([k, ic, v]) =>
      el("div", { class: "spec" }, el("div", { class: "k" }, svg(ic), k), ed("div", "v", v))));

  const head = el("div", { class: "rhead" },
    ed("div", "name", model),
    edition ? ed("div", "edition", edition) : null);

  const priceBox = el("div", { class: "pricebox" },
    stock ? ed("div", "stock", stock) : null,
    el("div", { class: "lbl", text: "販売価格" }),
    el("div", { class: "amt" }, el("span", { class: "y", text: "¥" }), ed("span", "n", yen(price)), el("span", { class: "t", text: "税込" })),
    inst?.monthly ? el("div", { class: "inst" }, "月々 ", ed("b", "", yen(inst.monthly)), `円（${inst.count || 36}回）`) : null);

  row.append(medal, head, specs, priceBox);
  fitRow(row);
}

// 段からはみ出す時は文字を少しずつ小さくする (スペックは改行して全部表示)
function fitRow(row) {
  let k = 1;
  row.style.setProperty("--k", k);
  while (k > 0.6 && row.scrollHeight > row.clientHeight + 1) {
    k = Math.round((k - 0.04) * 100) / 100;
    row.style.setProperty("--k", k);
  }
}

const renderAll = () => slots.forEach(renderRow);
document.fonts?.ready.then(() => { fitSeries(); slots.forEach((s) => fitRow($(`#row${s.i}`))); });
$("#rows").addEventListener("input", (e) => { const r = e.target.closest(".rrow"); if (r) fitRow(r); });
$("#popSeries").addEventListener("input", fitSeries);

/* ------------------------------------------------------------ slots (商品ページ取得) */
function buildSlotPanel(s) {
  const box = el("div", { class: "slot", id: `slot${s.i}` });
  const title = el("span", { class: "slot-title", text: `${s.i + 1}段目` });
  const url = el("input", { type: "url", placeholder: "商品URL" });
  const btn = el("button", { text: "取得" });
  const status = el("div", { class: "status" });
  const paste = el("textarea", { rows: "3", placeholder: "商品ページのソース (Ctrl+U)" });
  const pbtn = el("button", { text: "貼り付けたHTMLを解析" });

  const load = async (path, body) => {
    btn.disabled = pbtn.disabled = true;
    status.className = "status"; status.textContent = "取得中…";
    try {
      s.data = await call(path, body);
      status.className = "status ok";
      status.textContent = `✔ ${s.data.productId}  ¥${yen(s.data.price)}`;
    } catch (e) {
      s.data = null;
      status.className = "status err";
      status.textContent = `商品ページ未取得（${e.message}）\n→ ランキングの情報で表示中。メモリ・ストレージは「—」。ソース貼り付けで補完できます。`;
    } finally {
      btn.disabled = pbtn.disabled = false;
      renderRow(s);
      if (s.i === 0 && !topImgs.length && s.data?.images?.[0]) topImgs = [s.data.images[0]];
      buildTopThumbs();
    }
  };
  s.load = () => (url.value.trim() ? load("/api/fetch", { url: url.value.trim() }) : Promise.resolve());
  s.setCand = (c) => {
    s.cand = c; s.data = null;
    url.value = c ? c.url : "";
    title.textContent = c ? `${s.i + 1}段目：${c.rank}位` : `${s.i + 1}段目`;
    status.textContent = "";
  };
  btn.onclick = s.load;
  pbtn.onclick = () => load("/api/parse", { html: paste.value, url: url.value });

  box.append(el("h3", {}, title), el("div", { class: "row" }, url, btn), status,
    el("details", {}, el("summary", { text: "ソース貼り付け" }), paste, pbtn));
  return box;
}

/* ------------------------------------------------------------ ranking / series */
function renderCandidates() {
  const box = $("#candidates");
  box.replaceChildren();
  if (!section) return;
  box.append(el("p", { class: "hint", text: "チェックした順に 1段目→2段目→3段目 に入ります（初期値は1〜3位）。" }));
  for (const c of section.items) {
    const cb = el("input", { type: "checkbox" });
    const idx = picked.indexOf(c);
    cb.checked = idx >= 0;
    cb.disabled = idx < 0 && picked.length >= 3;
    cb.onchange = () => {
      if (cb.checked) picked.push(c); else picked = picked.filter((x) => x !== c);
      renderCandidates();
    };
    box.append(el("label", { class: "cand" + (idx >= 0 ? " on" : "") },
      cb, el("span", { class: "cand-slot", text: idx >= 0 ? `${idx + 1}段` : "" }),
      el("img", { src: c.image, loading: "lazy", alt: "" }),
      el("span", { class: "cand-body" }, el("b", { text: `${c.rank}位 ` }), c.name,
        el("small", { text: `${c.cpu} / ${c.video}　¥${yen(c.price)}` }))));
  }
  const go = el("button", { class: "primary wide", text: "選択したモデルでPOP作成" });
  go.disabled = !picked.length;
  go.onclick = applyPicked;
  box.append(go);
}

async function applyPicked() {
  slots.forEach((s, i) => s.setCand(picked[i] || null));
  topImgs = defaultTopImgs(picked[0]);
  renderHeader(); renderAll(); buildTopThumbs();
  await Promise.all(slots.filter((s) => s.cand).map((s) => s.load()));  // 3商品を並列取得
}

function selectSection(i) {
  section = sections[i];
  picked = section.items.slice(0, 3);
  renderCandidates();
  applyPicked();
}

$("#seriesSel").onchange = (e) => selectSection(Number(e.target.value));

async function loadRanking(body) {
  const st = $("#rankStatus");
  st.className = "status"; st.textContent = "ランキング取得中…（ページの表示を待っています。10秒ほどかかります）";
  try {
    ({ sections } = await call("/api/ranking", body));
    const sel = $("#seriesSel");
    sel.replaceChildren(...sections.map((s, i) => el("option", { value: String(i), text: `${s.series}（${s.items.length}件）` })));
    $("#seriesBox").hidden = false;
    st.className = "status ok";
    st.textContent = `${sections.length}シリーズのランキングを取得しました`;
    selectSection(0);
  } catch (e) {
    st.className = "status err";
    st.textContent = "エラー: " + e.message;
    $("#catPaste").open = true;
  }
}
$("#btnRank").onclick = () => loadRanking({ url: $("#catUrl").value.trim() });
$("#btnRankParse").onclick = () => loadRanking({ url: $("#catUrl").value.trim(), html: $("#catHtml").value });

// ページ全体 (JavaScript 実行後) をコピーするコード
const COPY_JS = "copy(document.documentElement.outerHTML)";
const BOOKMARKLET = "javascript:(()=>{const h=document.documentElement.outerHTML;" +
  "navigator.clipboard.writeText(h).then(()=>alert('ページをコピーしました。POPツールに貼り付けてください。'),()=>prompt('Ctrl+Cでコピーしてください',h));})()";
$("#copyCode").textContent = COPY_JS;
$("#bookmarklet").href = BOOKMARKLET;
$("#btnCopyCode").onclick = () => navigator.clipboard.writeText(COPY_JS).then(() => ($("#btnCopyCode").textContent = "コピーしました"));

/* ------------------------------------------------------------ init */
const rows = $("#rows");
const slotsBox = $("#slots");
slotsBox.append(el("h2", { text: "各段の商品ページ（メモリ・ストレージ取得用）" }));
for (const s of slots) {
  rows.append(el("div", { id: `row${s.i}` }));
  slotsBox.append(buildSlotPanel(s));
  renderRow(s);
}

const pop = $("#pop");
const opt = (id, cls) => { const cb = $("#" + id); cb.onchange = () => pop.classList.toggle(cls, !cb.checked); };
opt("optPrice", "no-price");
opt("optInstall", "no-inst");
opt("optStock", "no-stock");
$("#optDetail").onchange = renderAll;
$("#btnPrint").onclick = () => window.print();

// 印刷余白: @page の余白を設定し、POP全体をその内側に収まるよう縮小
const printStyle = el("style");
document.head.append(printStyle);
function applyPrintMargin() {
  const m = Number($("#printMargin").value);
  const k = Math.min((210 - 2 * m) / 210, (297 - 2 * m) / 297) * 0.995;
  printStyle.textContent = `@page { size: A4 portrait; margin: ${m}mm; }\n` +
    `@media print { .rpop { zoom: ${k.toFixed(4)}; margin: 0 auto; } }`;
}
$("#printMargin").onchange = applyPrintMargin;
applyPrintMargin();
