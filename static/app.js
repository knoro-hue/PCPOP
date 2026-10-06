"use strict";

const $ = (s) => document.querySelector(s);
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
const ed = (tag, cls, text) => el(tag, { class: cls, contenteditable: "true", text: text ?? "" });

function setStatus(msg, kind = "") {
  const s = $("#status");
  s.textContent = msg;
  s.className = "status " + kind;
}

async function call(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function load(path, body) {
  const btns = [$("#btnFetch"), $("#btnParse")];
  btns.forEach((b) => (b.disabled = true));
  setStatus("取得中…");
  try {
    const d = await call(path, body);
    render(d);
    const w = d.warnings.length ? "\n⚠ " + d.warnings.join("\n⚠ ") : "";
    setStatus(`取得完了: ${d.productId || ""}  仕様${d.specTable.length}項目 / 画像${d.images.length}枚${w}`,
      d.warnings.length ? "err" : "ok");
  } catch (e) {
    setStatus("エラー: " + e.message + "\n→ 下の「ページのソースを貼り付け」もお試しください。", "err");
    $("#pasteBox").open = true;
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

$("#btnFetch").onclick = () => {
  const url = $("#url").value.trim();
  // 商品ページは /TC30/MC25585-SN5037.html のような形。一覧・ランキングページはランキングPOPへ誘導
  if (!/\/MC\d+(-SN\d+)?\.html/i.test(url)) {
    const s = $("#status");
    s.className = "status err";
    s.innerHTML = "これは商品ページのURLではありません（例: …/TC30/MC19364-SN5020.html）。<br>" +
      'ランキングから作る場合は <a href="/">ランキングPOP</a> を使ってください。';
    return;
  }
  load("/api/fetch", { url });
};
$("#url").addEventListener("keydown", (e) => e.key === "Enter" && $("#btnFetch").click());
$("#btnParse").onclick = () => load("/api/parse", { html: $("#html").value, url: $("#url").value });

/* ------------------------------------------------------------ icons / logos */
const LOGO = {
  geforce: () => el("div", { class: "logo geforce" }, el("b", { text: "GEFORCE" }), el("b", { text: "RTX" }), el("small", { text: "NVIDIA" })),
  radeon: () => el("div", { class: "logo radeon" }, el("b", { text: "RADEON" }), el("small", { text: "AMD" })),
  arc: () => el("div", { class: "logo arc" }, el("small", { text: "intel" }), el("b", { text: "ARC" })),
  intel: (v) => el("div", { class: "logo intel" }, el("i", { text: "intel" }), el("b", { text: "CORE" }),
    el("small", { text: (v.match(/Ultra\s*\d|i\d/i) || [""])[0].toUpperCase() })),
  amd: (v) => el("div", { class: "logo amd" }, el("i", { text: "AMD" }), el("b", { text: "RYZEN" }),
    el("small", { text: (v.match(/Ryzen\s*(\d)/i) || ["", ""])[1] })),
};
const ICON = {
  usbA: '<svg viewBox="0 0 40 24"><rect x="2" y="3" width="36" height="18" rx="3" fill="none" stroke="#222" stroke-width="2.4"/><rect x="8" y="8" width="24" height="5" fill="#222"/></svg>',
  usbC: '<svg viewBox="0 0 40 24"><rect x="2" y="5" width="36" height="14" rx="7" fill="none" stroke="#222" stroke-width="2.4"/><rect x="10" y="10" width="20" height="4" rx="2" fill="#222"/></svg>',
  wifi: '<svg viewBox="0 0 24 24"><path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="19.5" r="1.8" fill="#111"/></svg>',
  lan: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="#111" stroke-width="2"/><path d="M7 9h10v6h-2v2H9v-2H7z" fill="none" stroke="#111" stroke-width="1.6"/><path d="M9 9v2M11 9v2M13 9v2M15 9v2" stroke="#111" stroke-width="1.2"/></svg>',
  emblem: '<svg viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" fill="#c9a24a"/><path d="M12 6l4 2v4c0 2.6-1.7 4.6-4 5.6-2.3-1-4-3-4-5.6V8z" fill="#1b2350"/></svg>',
};

/* ------------------------------------------------------------ render */
// 縦書き風ラベル (1文字ずつ縦に並べる)
const vlbl = (t) => el("div", { class: "vlbl" }, ...[...t].map((ch) => el("span", { text: ch })));
const GAME_TEMPLATE = ["Apex Legends", "Valorant", "Monster Hunter Wilds", "Cyberpunk 2077"];
let data = null;
let gamesMode = "fps";

function gamesTable(d) {
  const s = d.sheet;
  const box = el("div", { class: "games opt-games" }, el("div", { class: "bar", text: "ゲーム性能（3DMarkベンチマーク）" }));
  const tb = el("table");
  if (gamesMode === "fps") {
    const g = s.games?.rows?.length ? s.games : { cols: ["FHD", "4K"], rows: GAME_TEMPLATE.map((t) => ({ title: t, vals: ["", ""] })) };
    const cols = g.cols.slice(0, 3);
    tb.append(el("tr", { class: "hd" }, el("th", { text: "ゲームタイトル" }), ...cols.map((c) => ed("th", "", c))));
    for (const r of g.rows.slice(0, 5)) {
      tb.append(el("tr", {}, ed("th", "", r.title), ...cols.map((_, i) => ed("td", "", r.vals[i] || ""))));
    }
    box.append(tb, ed("div", "note", "※FPSスコアは参考値であり、各ゲームの動作やFPSを保証するものではありません\n※FPS値は基本構成の場合です"));
  } else {
    const b = d.benchmark || {};
    tb.append(el("tr", { class: "hd" }, el("th", { text: "ベンチマーク" }), el("th", { text: "スコア" })));
    for (const [k, v] of [["Time Spy", b.timeSpy], ["Fire Strike", b["Fire Strike"]], ["Fire Strike Ultra", b["Fire Strike Ultra"]]]) {
      if (v) tb.append(el("tr", {}, ed("th", "", k), ed("td", "", yen(v))));
    }
    box.append(tb);
  }
  return box;
}

function portsTable(s) {
  const p = s.ports;
  if (!p?.cols?.length) return null;
  const cols = p.cols.slice(0, 3);
  const tb = el("table");
  tb.append(el("tr", { class: "hd" }, el("th", { text: "端子形状" }), el("th", { text: "インターフェース" }),
    ...cols.map((c) => el("th", { text: c }))));
  const group = (names, icon) => names.forEach((n, i) => {
    const tr = el("tr", { class: i % 2 ? "alt" : "" });
    if (!i) tr.append(el("td", { class: "ic", rowspan: String(names.length), html: ICON[icon] }));
    tr.append(el("td", { class: "nm", text: n }), ...cols.map((_, j) => ed("td", "n", String(p.rows[n]?.[j] ?? 0))));
    tb.append(tr);
  });
  group(["2.0", "3.0", "3.2 Gen1 Type-A", "3.2 Gen2 Type-A"], "usbA");
  group(["3.2 Gen1 Type-C", "3.2 Gen2 Type-C", "3.2 Gen2x2 Type-C", "4.0", "Thunderbolt 4", "Thunderbolt 5"], "usbC");
  return el("div", { class: "ports opt-ports" }, tb);
}

function render(d) {
  data = d;
  const s = d.sheet;
  const pop = $("#pop");
  pop.className = "pop sheet";
  pop.replaceChildren();

  // ヘッダー: ロゴ・シリーズ / Model Name・管理番号・型番
  const head = el("div", { class: "s-head" },
    el("div", { class: "s-brand" },
      el("div", { class: "s-logo" }, el("span", { class: "em", html: ICON.emblem }), ed("span", "t", s.brand)),
      ed("div", "s-series", s.series)),
    el("div", { class: "s-model" },
      el("div", { class: "s-model-top" }, el("span", { text: "Model Name" }), ed("span", "mc", s.mc)),
      ed("div", "s-code", s.code)));

  // PC画像 + 基本構成
  const img = el("img", { id: "popImg", src: d.images[0] || "", alt: "" });
  const basic = el("div", { class: "s-basic" }, el("div", { class: "bar", text: "基本構成" }));
  for (const b of s.basic) {
    const key = b.brand && LOGO[b.brand] ? LOGO[b.brand](b.main) : el("div", { class: "k", text: b.key });
    const inline = b.key === "メモリ";
    basic.append(el("div", { class: "row r-" + (b.brand ? "logo" : "text") }, el("div", { class: "kc" }, key),
      el("div", { class: "vc" + (inline ? " inline" : "") }, ed("div", "m", b.main), b.sub ? ed("div", "s", b.sub) : null)));
  }
  const mid = el("div", { class: "s-mid" }, el("div", { class: "s-img" }, img), basic);

  // ゲーム性能 + 端子
  const tables = el("div", { class: "s-tables" }, gamesTable(d), portsTable(s));

  // 価格
  const inst = d.installment;
  const price = el("div", { class: "s-price" },
    el("div", { class: "amt" }, ed("span", "n", yen(d.price)),
      el("span", { class: "unit" }, el("span", { class: "tax", text: "税込" }), el("span", { class: "en", text: "円" }))),
    inst ? ed("div", "inst opt-install", `三井住友分割払 ${inst.count || 36}回 月々${yen(inst.monthly)}円(税込)`) : null);

  // 仕様
  const sz = s.size || {};
  const spec = el("div", { class: "s-spec opt-spec" }, el("div", { class: "bar", text: "仕様" }),
    el("div", { class: "cells" },
      el("div", { class: "c" }, el("div", { class: "ic" }, el("span", { html: ICON.wifi }), el("small", { text: "Wi-Fi" })),
        el("div", { class: "tx" }, ed("div", "", s.wifi.main), ed("div", "", s.wifi.sub))),
      el("div", { class: "c" }, el("div", { class: "ic" }, el("span", { html: ICON.lan }), el("small", { text: "LAN" })),
        el("div", { class: "tx" }, ed("div", "", s.lan.main), ed("div", "", s.lan.sub))),
      el("div", { class: "c size" }, vlbl("サイズ"),
        el("div", { class: "wdh" }, ...["W", "D", "H"].map((k) =>
          el("div", {}, el("span", { class: "k", text: k + ":" }), ed("span", "v", sz[k] || ""), el("span", { class: "u", text: "mm" }))))),
      el("div", { class: "c weight" }, vlbl("重量"),
        el("div", { class: "kg" }, el("span", { text: "約 " }), ed("b", "", s.weight), el("span", { text: " Kg" })))));

  const warranty = s.warranty ? ed("div", "s-warranty opt-warranty", `${s.warranty} （※別途オプション保証もご加入いただけます）`) : null;

  // 分割手数料0円バナー
  const banner = el("div", { class: "s-banner opt-banner" },
    el("div", { class: "card" }, ed("b", "", "三井住友カード"), ed("span", "", "ショッピングクレジット")),
    el("div", { class: "msg" },
      el("div", { class: "max" }, el("span", { class: "flag", text: "最大" }), ed("b", "", String(inst?.count || 36)), el("span", { text: "回まで" })),
      el("div", { class: "zero" }, el("span", { text: "分割手数料" }), el("b", { text: "0" }), el("span", { text: "円!!" }))));

  const badge = s.badge ? ed("div", "s-badge opt-badge", s.badge) : null;

  pop.append(head, mid, tables, price, spec, warranty, banner, badge);
  buildPanel(d);
  applyOptions();
  fitSheet();
  img.onload = fitSheet;
}

// 型番・価格は枠の幅いっぱいに (長い型番は縮める)
function fitText(node, maxMm, minMm) {
  if (!node) return;
  let mm = maxMm;
  node.style.fontSize = mm + "mm";
  while (mm > minMm && node.scrollWidth > node.clientWidth + 1) {
    mm -= 0.5;
    node.style.fontSize = mm + "mm";
  }
}
function fitSheet() {
  fitText($(".s-code"), 24, 9);
  fitText($(".s-price .n"), 46, 20);
  // 基本構成の値も1行に収める
  document.querySelectorAll(".s-basic .m").forEach((m) => fitText(m, 6.2, 3.6));
}
// 型番・価格のフォント (Anton) は使う時に読み込まれるので、読み込み後に合わせ直す
document.fonts?.addEventListener?.("loadingdone", () => data && fitSheet());
document.fonts?.load("24mm Anton").then(() => data && fitSheet());
document.addEventListener("input", (e) => {
  if (e.target.closest?.(".s-code, .s-price .n, .s-basic .m")) fitSheet();
});

function buildPanel(d) {
  $("#editor").hidden = false;
  $("#gamesHint").textContent = d.sheet.games?.rows?.length
    ? "商品ページのフレームレート表を表示しています。"
    : "商品ページにフレームレート表が見つからないため、fps表は空欄です（POP上で入力できます）。";

  const thumbs = $("#thumbs");
  thumbs.replaceChildren();
  d.images.forEach((u, i) => {
    const t = el("img", { src: u, loading: "lazy", class: i === 0 ? "sel" : "" });
    t.onclick = () => {
      $("#popImg").src = u;
      thumbs.querySelectorAll("img").forEach((x) => x.classList.toggle("sel", x === t));
    };
    thumbs.append(t);
  });

  const raw = $("#rawTable");
  raw.replaceChildren();
  for (const r of d.specTable) {
    raw.append(el("tr", {}, el("th", { text: r.label }), el("td", { text: r.value })));
  }
}

function setGames(mode) {
  gamesMode = mode;
  if (!data) return;
  $(".games").replaceWith(gamesTable(data));
  applyOptions();
}
$("#btnGamesFps").onclick = () => setGames("fps");
$("#btnGamesMark").onclick = () => setGames("mark");

const OPTS = {
  optGames: ".opt-games", optPorts: ".opt-ports", optInstall: ".opt-install", optSpec: ".opt-spec",
  optWarranty: ".opt-warranty", optBanner: ".opt-banner", optBadge: ".opt-badge",
};
function applyOptions() {
  for (const [id, sel] of Object.entries(OPTS)) {
    document.querySelectorAll(sel).forEach((e) => (e.hidden = !$("#" + id).checked));
  }
}
Object.keys(OPTS).forEach((id) => ($("#" + id).onchange = applyOptions));

// 画像が表示されるまで印刷しない
$("#btnPrint").onclick = async () => {
  const img = $("#popImg");
  const b = $("#btnPrint");
  if (img && img.src && !img.complete) {
    b.disabled = true;
    b.textContent = "画像を読み込み中…";
    await new Promise((r) => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); });
    b.disabled = false;
    b.textContent = "印刷 / PDF保存 (A4)";
  }
  await document.fonts?.ready;
  fitSheet();
  window.print();
};
