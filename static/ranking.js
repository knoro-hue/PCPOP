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
  gamepad: '<path fill-rule="evenodd" d="M7 6h10a5 5 0 0 1 5 5v2.5a4.5 4.5 0 0 1-8.2 2.5h-3.6A4.5 4.5 0 0 1 2 13.5V11a5 5 0 0 1 5-5zM6 9.5v1.7H4.3v1.6H6v1.7h1.6v-1.7h1.7v-1.6H7.6V9.5zM16 9.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm2.4 2.4a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/>',
  broadcast: '<circle cx="12" cy="12" r="2.3"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  play: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M10 8.5v7l6-3.5z" fill="#fff"/>',
  chat: '<path d="M4 3.5h16a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2H10l-5 4v-4H4a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2z"/><circle cx="8" cy="10.8" r="1.4" fill="#fff"/><circle cx="12" cy="10.8" r="1.4" fill="#fff"/><circle cx="16" cy="10.8" r="1.4" fill="#fff"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M17 10.2l5-3.2v10l-5-3.2z"/>',
  image: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M4.5 17.5l5-6 4 4.5 2-2 4 3.5z" fill="#fff"/><circle cx="16" cy="8.5" r="1.8" fill="#fff"/>',
  cube: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3.6 7.3L12 12l8.4-4.7M12 12v9.6" fill="none" stroke="#fff" stroke-width="1.4"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="4.2" fill="#fff"/><circle cx="12" cy="13" r="2.5"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4" fill="none" stroke="currentColor" stroke-width="2"/>',
  target: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke="currentColor" stroke-width="2"/>',
  cpu: `<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9" y="9" width="6" height="6" fill="${NAVY}"/><path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3" stroke="currentColor" stroke-width="1.6"/>`,
  gpu: `<rect x="2" y="5" width="20" height="12" rx="1.5"/><circle cx="8.5" cy="11" r="3.4" fill="${NAVY}"/><circle cx="16.5" cy="11" r="2.4" fill="${NAVY}"/><path d="M4 17v3h7v-3" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  memory: `<rect x="2" y="6.5" width="20" height="9.5" rx="1"/><path d="M5 16v3M8 16v3M11 16v3M14 16v3M17 16v3M20 16v3" stroke="currentColor" stroke-width="1.5"/><rect x="4.5" y="9" width="3.5" height="4.5" fill="${NAVY}"/><rect x="10.3" y="9" width="3.5" height="4.5" fill="${NAVY}"/><rect x="16" y="9" width="3.5" height="4.5" fill="${NAVY}"/>`,
  storage: `<rect x="4" y="2.5" width="16" height="19" rx="2"/><rect x="7" y="15.5" width="10" height="3" rx="1" fill="${NAVY}"/>`,
};
const svg = (name) => el("span", { html: `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>` }).firstChild;

/* ------------------------------------------------------------ themes */
const THEMES = {
  game: {
    name: "ゲーム（赤）", icon: "gamepad",
    tab: "<em>ゲーム</em>を快適に楽しみたい方に",
    title: "人気の定番モデル",
    desc: "人気タイトルを高フレームレートで快適にプレイできるスタンダードモデル。",
    chipsTitle: "こんな遊び方におすすめ!",
    chips: [["gamepad", "ゲーム\nプレイ"], ["target", "FPS\nTPS"], ["monitor", "高画質\n高fps"], ["chat", "ボイス\nチャット"]],
  },
  stream: {
    name: "配信（青）", icon: "video",
    tab: "<em>ゲーム配信</em>もしたい方に",
    title: "配信も快適なバランスモデル",
    desc: "ゲームプレイと同時に配信・録画も快適。マルチに活躍できる人気モデル。",
    chipsTitle: "こんな使い方におすすめ!",
    chips: [["gamepad", "ゲーム\nプレイ"], ["broadcast", "ゲーム\n配信"], ["play", "動画\n投稿"], ["chat", "マルチ\nタスク"]],
  },
  creative: {
    name: "クリエイティブ（緑）", icon: "play",
    tab: "<em>動画編集・クリエイティブ</em>に使いたい方に",
    title: "高性能クリエイティブモデル",
    desc: "動画編集・イラスト制作・3D制作など、重い作業も快適にこなせる高性能モデル。",
    chipsTitle: "こんな作業におすすめ!",
    chips: [["video", "動画\n編集"], ["image", "イラスト\n制作"], ["cube", "3D制作"], ["camera", "写真編集\nRAW現像"]],
  },
};
const DEFAULT_THEME = ["game", "stream", "creative"];

/* ------------------------------------------------------------ state */
const slots = [0, 1, 2].map((i) => ({ i, url: "", rank: null, cand: null, theme: DEFAULT_THEME[i], data: null, caseImg: "", sceneImg: "", descMode: "catch" }));

function specValue(d, label, detailed) {
  const s = d.keySpecs.find((x) => x.label === label);
  if (!s) return "";
  if (detailed) return s.display;
  let v = s.short || s.display;
  if (label === "メモリ") v = v.replace("メモリ", " ").replace(/\s+/g, " ").trim();
  return v;
}

// メイン画像以外で「使用シーン」に向く画像を推測
function pickScene(images) {
  const bad = /(case_|award|production-area|service-support|set-device|front_back|_side|overview|lowangle|feature\d|_main)/;
  return images.find((u, i) => i > 0 && !bad.test(u)) || images[1] || images[0] || "";
}

/* ------------------------------------------------------------ panel */
function buildSlotPanel(s) {
  const box = el("div", { class: "slot", id: `slot${s.i}` });
  const sel = el("select");
  for (const [k, t] of Object.entries(THEMES)) sel.append(el("option", { value: k, text: t.name }));
  sel.value = s.theme;
  sel.onchange = () => { s.theme = sel.value; renderCard(s); };

  const descSel = el("select");
  descSel.append(el("option", { value: "catch", text: "説明: 商品キャッチコピー" }), el("option", { value: "theme", text: "説明: テーマ文" }));
  descSel.onchange = () => { s.descMode = descSel.value; renderCard(s); };

  const url = el("input", { type: "url", placeholder: `枠${s.i + 1} の商品URL` });
  const btn = el("button", { text: "取得" });
  const status = el("div", { class: "status" });
  const paste = el("textarea", { rows: "3", placeholder: "商品ページのソース (Ctrl+U)" });
  const pbtn = el("button", { text: "貼り付けたHTMLを解析" });

  const load = async (path, body) => {
    btn.disabled = pbtn.disabled = true;
    status.className = "status"; status.textContent = "取得中…";
    try {
      const d = await call(path, body);
      s.data = d;
      s.caseImg = d.images[0] || "";
      s.sceneImg = pickScene(d.images);
      renderCard(s); renderThumbs(s, box);
      const w = d.warnings.length ? "  ⚠ " + d.warnings.join(" / ") : "";
      status.className = "status " + (w ? "err" : "ok");
      status.textContent = `✔ ${d.productId}  ¥${yen(d.price)}${w}`;
    } catch (e) {
      status.className = "status err";
      status.textContent = "エラー: " + e.message;
      box.querySelector("details").open = true;
      // 商品ページが取れなくても、ランキング一覧の情報 (CPU/GPU/価格/画像) で仮表示
      if (s.cand && body.url) {
        s.data = fromCandidate(s.cand);
        s.caseImg = s.data.images[0] || "";
        s.sceneImg = "";
        renderCard(s); renderThumbs(s, box);
        status.textContent += "\n→ ランキング一覧の情報で仮表示中（メモリ・ストレージは未取得。商品ページのソースを貼ると補完されます）";
      }
    } finally { btn.disabled = pbtn.disabled = false; }
  };
  s.load = () => load("/api/fetch", { url: url.value.trim() });
  s.setUrl = (u) => { url.value = u; };
  btn.onclick = s.load;
  pbtn.onclick = () => load("/api/parse", { html: paste.value, url: url.value });

  box.append(
    el("h3", {}, el("span", { class: "slot-title", text: `枠${s.i + 1}` }), sel),
    el("div", { class: "row" }, url, btn),
    status,
    el("details", {}, el("summary", { text: "取得できない場合: ソース貼り付け" }), paste, pbtn),
    el("div", { class: "row", style: "margin-top:6px" }, descSel),
    el("div", { class: "imgs" }),
  );
  return box;
}

function renderThumbs(s, box) {
  const wrap = $(".imgs", box);
  wrap.replaceChildren();
  const group = (label, key) => {
    const t = el("div", { class: "thumbs" });
    const draw = () => t.querySelectorAll("img").forEach((x) => x.classList.toggle("sel", x.dataset.u === s[key]));
    for (const u of s.data.images) {
      const im = el("img", { src: u, loading: "lazy" });
      im.dataset.u = u;
      im.onclick = () => { s[key] = u; draw(); renderCard(s); };
      t.append(im);
    }
    const up = el("input", { type: "file", accept: "image/*" });
    up.onchange = () => { if (up.files[0]) { s[key] = URL.createObjectURL(up.files[0]); draw(); renderCard(s); } };
    wrap.append(el("div", { class: "pick", text: label }), t, up);
    draw();
  };
  group("左：PC本体画像", "caseImg");
  group("右：イメージ画像（ゲーム画面などをアップロードも可）", "sceneImg");
}

/* ------------------------------------------------------------ POP card */
function renderCard(s) {
  const card = $(`#card${s.i}`);
  const th = THEMES[s.theme];
  card.className = `card t-${s.theme}`;
  card.replaceChildren();
  const d = s.data;
  if (!d) {
    card.classList.add("empty");
    card.textContent = `${s.i + 1}位：商品を取得してください`;
    return;
  }
  const detailed = $("#optDetail")?.checked;
  const tab = el("div", { class: "card-tab" },
    el("span", { class: "ico" }, svg(th.icon)),
    el("span", { contenteditable: "true", html: th.tab }));

  const rows = el("div", { class: "spec-rows" });
  for (const [k, label, icon] of [["CPU", "CPU", "cpu"], ["グラフィックス", "GPU", "gpu"], ["メモリ", "メモリ", "memory"], ["ストレージ", "SSD", "storage"]]) {
    rows.append(el("div", { class: "spec-row" },
      el("div", { class: "k" }, svg(icon), k),
      ed("div", "v", specValue(d, label, detailed) || "—")));
  }
  const desc = s.descMode === "catch" && d.catchcopy ? d.catchcopy : th.desc;
  const info = el("div", { class: "card-info" },
    ed("div", "card-title", th.title),
    ed("div", "card-model", d.model),
    ed("div", "card-desc", desc),
    rows);
  const price = el("div", { class: "card-price" },
    el("span", { class: "y", text: "¥" }), ed("span", "n", yen(d.price)), el("span", { class: "t", text: "税込" }));

  const side = el("div", { class: "card-side" },
    el("div", { class: "rank-badge" },
      el("span", { class: "crown", text: "♛" }), el("span", { class: "a", text: "人気" }), ed("span", "b", `No.${s.rank ?? s.i + 1}`)),
    el("div", { class: "card-scene" }, s.sceneImg ? el("img", { src: s.sceneImg, alt: "" }) : null, price),
    el("div", { class: "card-chips" },
      ed("span", "h", th.chipsTitle),
      el("div", { class: "chips" }, ...th.chips.map(([ic, t]) => el("div", { class: "chip" }, svg(ic), ed("div", "", t))))));

  card.append(tab, el("div", { class: "card-body" },
    el("div", { class: "card-case" }, s.caseImg ? el("img", { src: s.caseImg, alt: "" }) : null),
    info, side));
}

/* ------------------------------------------------------------ init */
const cards = $("#cards");
const slotsBox = $("#slots");
slotsBox.append(el("h2", { text: "POPに載せる3モデル" }));
for (const s of slots) {
  cards.append(el("div", { id: `card${s.i}` }));
  slotsBox.append(buildSlotPanel(s));
  renderCard(s);
}
slotsBox.append(el("label", {}, el("input", { type: "checkbox", id: "optDetail" }), " スペックを詳細表記にする"));
$("#optDetail").onchange = () => slots.forEach(renderCard);

const pop = $("#pop");
const opt = (id, cls) => { const cb = $("#" + id); cb.onchange = () => pop.classList.toggle(cls, !cb.checked); };
opt("optPrice", "no-price");
opt("optRank", "no-rank");
opt("optModel", "no-model");

$("#mascotFile").onchange = (e) => {
  const f = e.target.files[0];
  document.querySelectorAll(".mascot").forEach((m) => {
    if (f) { m.src = URL.createObjectURL(f); m.hidden = false; } else { m.hidden = true; }
  });
  $(".rh-badge").style.right = f ? "52mm" : "9mm";
};
$(".rh-badge").style.right = "9mm";
$("#btnPrint").onclick = () => window.print();

function bigImage(u) {
  return (u || "").replace(/([?&])sw=\d+/, "$1sw=1200");
}

// ランキング一覧の項目だけで作る仮データ (商品ページが取得できない時用)
function fromCandidate(c) {
  const m = c.name.match(/^(.*?)\s*(『.*』.*)$/);
  const ks = [];
  if (c.os) ks.push({ label: "OS", value: c.os, display: c.os, short: c.os });
  if (c.cpu) ks.push({ label: "CPU", value: c.cpu, display: c.cpu, short: c.cpu });
  if (c.video) ks.push({ label: "GPU", value: c.video, display: c.video, short: c.video });
  return {
    productId: c.url.match(/(MC\d+(?:-SN\d+)?)/)?.[1] || "", model: m ? m[1] : c.name, edition: m ? m[2] : "",
    catchcopy: "", price: c.price, keySpecs: ks, images: c.image ? [bigImage(c.image)] : [], warnings: ["仮データ"],
  };
}

/* ------------------------------------------------------------ ranking candidates */
let candidates = [];
let picked = []; // 選択順 (最大3)

function renderCandidates() {
  const box = $("#candidates");
  box.replaceChildren();
  if (!candidates.length) return;
  box.append(el("h2", { text: `ランキング（${candidates.length}件）から3つ選択` }),
    el("p", { class: "hint", text: "チェックした順に 枠1→枠2→枠3 に入ります。" }));
  for (const c of candidates) {
    const cb = el("input", { type: "checkbox" });
    const idx = picked.indexOf(c);
    cb.checked = idx >= 0;
    cb.disabled = idx < 0 && picked.length >= 3;
    cb.onchange = () => {
      if (cb.checked) picked.push(c); else picked = picked.filter((x) => x !== c);
      renderCandidates();
    };
    box.append(el("label", { class: "cand" + (idx >= 0 ? " on" : "") },
      cb,
      el("span", { class: "cand-slot", text: idx >= 0 ? `枠${idx + 1}` : "" }),
      el("img", { src: c.image, loading: "lazy", alt: "" }),
      el("span", { class: "cand-body" },
        el("b", { text: `${c.rank}位 ` }), c.name,
        el("small", { text: `${c.cpu} / ${c.video}　¥${yen(c.price)}` }))));
  }
  const go = el("button", { class: "primary wide", text: `選択した${picked.length}モデルでPOP作成` });
  go.disabled = !picked.length;
  go.onclick = applyPicked;
  box.append(go);
}

async function applyPicked() {
  slots.forEach((s, i) => {
    const c = picked[i] || null;
    s.cand = c;
    s.rank = c ? c.rank : null;
    s.setUrl(c ? c.url : "");
    if (!c) { s.data = null; renderCard(s); }
  });
  // 3商品を並列で取得 (サーバー側も並列処理)
  await Promise.all(slots.filter((s) => s.cand).map((s) => s.load()));
}

async function loadRanking(body) {
  const st = $("#rankStatus");
  st.className = "status"; st.textContent = "ランキング取得中…（ブラウザでページを実行しています）";
  try {
    const { items } = await call("/api/ranking", body);
    candidates = items;
    picked = items.slice(0, 3);
    st.className = "status ok";
    st.textContent = `ランキング ${items.length}件を取得しました`;
    renderCandidates();
    await applyPicked();
  } catch (e) {
    st.className = "status err";
    st.textContent = "エラー: " + e.message;
    $("#catPaste").open = true;
  }
}
$("#btnRank").onclick = () => loadRanking({ url: $("#catUrl").value.trim() });
$("#btnRankParse").onclick = () => loadRanking({ url: $("#catUrl").value.trim(), html: $("#catHtml").value });

// ブックマークレット / コンソール用のコピーコード
const COPY_JS = "copy(document.querySelector('ul.model-card-list.--ranking').outerHTML)";
const BOOKMARKLET = "javascript:(()=>{const u=document.querySelector('ul.model-card-list.--ranking');" +
  "if(!u){alert('ランキングが見つかりません');return;}const h=u.outerHTML;" +
  "navigator.clipboard.writeText(h).then(()=>alert('ランキングをコピーしました。POPツールに貼り付けてください。'),()=>prompt('Ctrl+Cでコピーしてください',h));})()";
$("#copyCode").textContent = COPY_JS;
$("#bookmarklet").href = BOOKMARKLET;
$("#btnCopyCode").onclick = () => navigator.clipboard.writeText(COPY_JS).then(() => ($("#btnCopyCode").textContent = "コピーしました"));
