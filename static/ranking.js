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
  os: `<rect x="3" y="3" width="8.5" height="8.5"/><rect x="12.5" y="3" width="8.5" height="8.5"/><rect x="3" y="12.5" width="8.5" height="8.5"/><rect x="12.5" y="12.5" width="8.5" height="8.5"/>`,
};
const svg = (name) => el("span", { html: `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>` }).firstChild;

const bigImage = (u) => (u || "").replace(/([?&])sw=\d+/, "$1sw=1200");

/* ------------------------------------------------------------ state */
let sections = [];   // [{title, series, items}]
let section = null;  // 選択中のシリーズ
let picked = [];     // POPに載せるランキング項目 (選択順・最大3)
let topImgs = [];  // トップ画像 [手前, 奥] (黒＋白の2台並び or 1枚)
const slots = [0, 1, 2].map((i) => ({ i, cand: null }));

/* ------------------------------------------------------------ spec helpers */
// ランキングページ (/TC30) に出ている情報だけを使う
function rowSpecs(c) {
  return [
    ["CPU", "cpu", c.cpu || "—"],
    ["グラフィックス", "gpu", c.video || "—"],
    ["OS", "os", c.os || "—"],
  ];
}

function splitName(name) {
  const m = (name || "").match(/^(.*?)\s*(『.*』.*)$/);
  return m ? [m[1], m[2]] : [name || "", ""];
}

/* ------------------------------------------------------------ POP: header */
let galleria = null;  // galleria.net のシリーズ画像 {X: {bg: {url|css}, pc}, ...}

// 「Fシリーズ（ピラーレス）」→ letter "F" + tag「ピラーレス」
function seriesInfo(sec) {
  const m = (sec?.series || "").match(/^(.*?)\s*[（(](.+)[)）]\s*$/);
  const main = m ? m[1] : sec?.series || "";
  const sub = m ? m[2] : "";
  const L = (main.match(/^([A-Z])\s*シリーズ$/i) || [])[1]?.toUpperCase() || "";
  return { main, sub, L };
}

function renderHeader() {
  if (!section) return;
  const { main, sub, L } = seriesInfo(section);
  const ser = $("#popSeries");
  ser.replaceChildren(...(L
    ? [el("span", { class: "L", text: L }), el("span", { class: "S", text: "Series" })]
    : [el("span", { class: "W", text: main })]));
  const tag = $("#popSeriesSub");
  tag.textContent = sub;
  tag.hidden = !sub;
  const first = section.items[0]?.name || "";
  $("#popKicker").textContent = /^GALLERIA/i.test(first) ? "GALLERIA GAMING PC" : "GAMING PC";
  $("#rh").dataset.series = L || "other";
  renderBackground();
  renderTopImage();
  fitSeries();
}

// 背景: galleria.net のシリーズ画像 (取れない時は同じ雰囲気のグラデーション)
function renderBackground() {
  const bgEl = $("#rhBg");
  const { L } = seriesInfo(section);
  const g = $("#optOfficialBg").checked && galleria?.[L];
  bgEl.style.backgroundImage = "";
  bgEl.classList.toggle("official", !!g?.bg);
  if (g?.bg?.url) bgEl.style.backgroundImage = `url("${viaLocal(g.bg.url)}")`;
  else if (g?.bg?.css) bgEl.style.backgroundImage = g.bg.css;
}

// シリーズ名を枠の幅に収まる最大サイズに
function fitSeries() {
  const ser = $("#popSeries");
  let mm = 30;
  ser.style.fontSize = mm + "mm";
  while (mm > 9 && ser.scrollWidth > ser.clientWidth + 1) {
    mm -= 0.5;
    ser.style.fontSize = mm + "mm";
  }
}

const sameImgs = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// 画像の白い背景を透明にして (外周からつながる白だけ)、余白を切り取る
function trimImage(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height);
  const { data, width: w, height: h } = id;
  const isBg = (p) => data[p * 4 + 3] < 16 || (data[p * 4] > 236 && data[p * 4 + 1] > 236 && data[p * 4 + 2] > 236);
  const seen = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let qh = 0, qt = 0;
  const push = (p) => { if (!seen[p] && isBg(p)) { seen[p] = 1; q[qt++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (qh < qt) {
    const p = q[qh++], x = p % w;
    data[p * 4 + 3] = 0;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  g.putImageData(id, 0, 0);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return c;
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

const viaLocal = (u) => (/^(blob:|data:|\/)/.test(u) ? u : "/img?u=" + encodeURIComponent(u));
const loadImg = (u) => new Promise((ok, ng) => {
  const im = new Image();
  im.onload = () => ok(im); im.onerror = ng;
  im.src = viaLocal(u);
});

// WEBのカードと同じ重ね方: 手前に1台目 (黒)、右奥に2台目 (白)。2台目は1台目の幅の82%右へずらす
const OVERLAP_SHIFT = 0.82;
async function composeTop(urls) {
  const parts = (await Promise.all(urls.map(loadImg))).map(trimImage);
  if (parts.length === 1) return parts[0].toDataURL("image/png");
  let [a, b] = parts;
  const sb = a.height / b.height;  // 高さをそろえる
  const bw = b.width * sb, bh = a.height;
  const off = a.width * OVERLAP_SHIFT;
  const out = document.createElement("canvas");
  out.width = Math.ceil(off + bw); out.height = a.height;
  const g = out.getContext("2d");
  g.drawImage(b, off, 0, bw, bh);
  g.drawImage(a, 0, 0);
  return out.toDataURL("image/png");
}

let topToken = 0;
async function renderTopImage() {
  const img = $("#popImg");
  $("#topThumbs").querySelectorAll(".th").forEach((x) => x.classList.toggle("sel", sameImgs(x._imgs, topImgs)));
  const token = ++topToken;
  if (!topImgs.length) { img.hidden = true; return; }
  try {
    const src = await composeTop(topImgs);
    if (token !== topToken) return;
    img.src = src; img.hidden = false;
  } catch {
    if (token !== topToken) return;
    img.src = topImgs[0]; img.hidden = false;  // 中継できない時はそのまま
  }
}

function defaultTopImgs(c) {
  if (!c) return [];
  return [bigImage(c.image), bigImage(c.image2)].filter((u, i, arr) => u && arr.indexOf(u) === i);
}

function buildTopThumbs() {
  const opts = [];
  const add = (imgs, label) => {
    imgs = imgs.filter(Boolean);
    if (!opts.some((o) => sameImgs(o.imgs, imgs))) opts.push({ imgs, label });
  };
  for (const it of section?.items || []) {
    const pair = defaultTopImgs(it);
    if (pair.length === 2) add(pair, `${it.rank}位 ${(it.colors || []).join("＋") || "2色"}`);
  }
  const g = galleria?.[seriesInfo(section).L];
  if (g?.pc) add([g.pc], "公式サイトのPC");
  for (const it of section?.items || []) {
    if (it.image) add([bigImage(it.image)], `${it.rank}位 ${it.colors?.[0] || ""}`);
    if (it.image2) add([bigImage(it.image2)], `${it.rank}位 ${it.colors?.[1] || ""}`);
  }
  add([], "画像なし（背景のみ）");
  const box = $("#topThumbs");
  box.replaceChildren();
  for (const o of opts) {
    const th = el("div", { class: "th" + (o.imgs.length > 1 ? " pair" : "") + (o.imgs.length ? "" : " none"), title: o.label },
      ...o.imgs.map((u) => el("img", { src: u.startsWith("http") && !/dospara/.test(u) ? viaLocal(u) : u, loading: "lazy", alt: "" })),
      el("span", { text: o.label }));
    th._imgs = o.imgs;
    th.onclick = () => { topImgs = o.imgs; renderTopImage(); };
    box.append(th);
  }
  $("#imgBox").hidden = !section;
  renderTopImage();
}

$("#topImgFile").onchange = (e) => {
  const f = e.target.files[0];
  if (f) { topImgs = [URL.createObjectURL(f)]; renderTopImage(); }
};

// galleria.net のシリーズ画像を取得 (ランキング取得と並行。失敗しても POP は作れる)
async function loadGalleria() {
  const st = $("#galleriaStatus");
  st.className = "status"; st.textContent = "galleria.net の背景画像を取得中…";
  try {
    ({ series: galleria } = await call("/api/galleria", {}));
    st.className = "status ok"; st.textContent = `galleria.net の画像を取得しました（${Object.keys(galleria).join(" / ")} Series）`;
  } catch (e) {
    galleria = {};
    st.className = "status err"; st.textContent = "galleria.net の画像を取得できませんでした（シリーズ別の色で表示します）: " + e.message;
  }
  renderBackground(); buildTopThumbs();
}
$("#optOfficialBg").onchange = renderBackground;

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
  const [model, edition] = splitName(c.name);

  const medal = el("div", { class: "medal" });
  medal.innerHTML = crownSvg(s.i);
  medal.append(el("div", { class: "num" }, ed("span", "no", `${rank}`), el("span", { class: "i", text: "位" })));

  const specs = el("div", { class: "specs" },
    ...rowSpecs(c).map(([k, ic, v]) =>
      el("div", { class: "spec" }, el("div", { class: "k" }, svg(ic), k), ed("div", "v", v))));

  const head = el("div", { class: "rhead" },
    c.tags?.length ? el("div", { class: "tags" }, ...c.tags.map((t) => ed("span", "tag", t))) : null,
    ed("div", "name", model),
    edition ? ed("div", "edition", edition) : null);

  const inst = c.installment;
  const priceBox = el("div", { class: "pricebox" },
    c.stock ? ed("div", "stock", c.stock) : null,
    el("div", { class: "lbl", text: "販売価格" }),
    el("div", { class: "amt" }, el("span", { class: "y", text: "¥" }), ed("span", "n", yen(c.price)), el("span", { class: "t", text: "税込" })),
    inst?.monthly ? el("div", { class: "inst" }, "月々 ", ed("b", "", yen(inst.monthly)), `円（${inst.count || 36}回）`) : null);

  row.append(medal, head, specs, priceBox);
  fitRow(row);
}

// 段からはみ出す時は文字を少しずつ小さくする (スペックは改行して全部表示)
function fitRow(row) {
  // 価格は枠の幅に収まるサイズに
  const amt = row.querySelector(".amt"), n = row.querySelector(".amt .n");
  if (amt && n) {
    let mm = 11.5;
    n.style.fontSize = mm + "mm";
    while (mm > 7 && amt.scrollWidth > amt.clientWidth + 1) { mm -= 0.25; n.style.fontSize = mm + "mm"; }
  }
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
document.fonts?.load("900 italic 10mm Poppins").then(fitSeries);

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

function applyPicked() {
  slots.forEach((s, i) => (s.cand = picked[i] || null));
  topImgs = defaultTopImgs(picked[0]);
  renderHeader(); renderAll(); buildTopThumbs();
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
    if (!galleria) loadGalleria();
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
for (const s of slots) {
  rows.append(el("div", { id: `row${s.i}` }));
  renderRow(s);
}

const pop = $("#pop");
const opt = (id, cls) => { const cb = $("#" + id); cb.onchange = () => pop.classList.toggle(cls, !cb.checked); };
opt("optPrice", "no-price");
opt("optInstall", "no-inst");
opt("optStock", "no-stock");
opt("optTags", "no-tags");
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
