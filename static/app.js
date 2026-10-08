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
    await assetsReady;
    base = d; custom = {}; imgSel = 0;
    buildCustomPanel(d);
    render(applyCustom(d));
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
  hdmi: '<svg viewBox="0 0 24 24"><path d="M2 8h20v5l-3 3H5l-3-3z" fill="none" stroke="#111" stroke-width="2"/><path d="M6 11h12" stroke="#111" stroke-width="1.6"/></svg>',
  usb: '<svg viewBox="0 0 24 24"><path d="M12 2v16M12 2l-2.5 3.5h5zM12 13l-5-3V7M12 15l5-3V9" fill="none" stroke="#111" stroke-width="1.8"/><circle cx="12" cy="19.5" r="2.2" fill="#111"/><rect x="5.5" y="5.5" width="3" height="2.5" fill="#111"/><circle cx="17" cy="8" r="1.6" fill="#111"/></svg>',
  twSlash: '<svg viewBox="0 0 30 24"><path d="M6 22L12 2h4L10 22zM13 22L19 2h4l-6 20zM20 22L26 2h3l-6 20z" fill="#1b2350"/></svg>',
  emblem: '<svg viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" fill="#c9a24a"/><path d="M12 6l4 2v4c0 2.6-1.7 4.6-4 5.6-2.3-1-4-3-4-5.6V8z" fill="#1b2350"/></svg>',
};

/* ------------------------------------------------------------ 画像素材 (ツールの pop_assets フォルダ) */
// ファイル名で探す: 候補の先頭から、拡張子 png / jpg / webp / svg のどれかがあれば使う
let assets = new Set();
const assetsReady = fetch("/api/assets").then((r) => r.json()).then((j) => (assets = new Set(j.files.map((f) => f.toLowerCase())))).catch(() => {});
function asset(...names) {
  for (const n of names) {
    for (const ext of ["png", "jpg", "jpeg", "webp", "svg"]) {
      if (assets.has(`${n}.${ext}`)) return `/assets/${n}.${ext}`;
    }
  }
  return "";
}
function gpuAsset(v) {
  const m = v.match(/RTX\s*(\d{4})/i);
  if (/geforce|rtx|gtx/i.test(v)) return asset(...(m ? [`gpu_geforce_rtx${m[1]}`] : []), "gpu_geforce_rtx", "gpu_geforce");
  if (/radeon/i.test(v)) return asset("gpu_radeon");
  if (/\barc\b/i.test(v)) return asset("gpu_intel_arc");
  return "";
}
function cpuAsset(v) {
  let m;
  if ((m = v.match(/Core\s*Ultra\s*(\d)/i))) return asset(`cpu_intel_core_ultra${m[1]}`, "cpu_intel_core_ultra", "cpu_intel");
  if ((m = v.match(/Core\s*i(\d)/i))) return asset(`cpu_intel_core_i${m[1]}`, "cpu_intel_core", "cpu_intel");
  if ((m = v.match(/Ryzen\s*(\d)/i))) return asset(`cpu_amd_ryzen${m[1]}`, "cpu_amd_ryzen", "cpu_amd");
  if (/intel|インテル/i.test(v)) return asset("cpu_intel");
  if (/amd/i.test(v)) return asset("cpu_amd");
  return "";
}
const assetImg = (src, cls) => el("img", { class: cls, src, alt: "" });

/* ------------------------------------------------------------ render */
// 縦書き風ラベル (1文字ずつ縦に並べる)
const vlbl = (t) => el("div", { class: "vlbl" }, ...[...t].map((ch) => el("span", { text: ch })));
const GAME_TEMPLATE = ["Apex Legends", "Valorant", "Monster Hunter Wilds", "Cyberpunk 2077"];
let data = null;     // POP に出しているデータ (カスタマイズ反映後)
let base = null;     // 取得したままのデータ
let custom = {};     // カスタマイズ: {カテゴリ: 選択肢の番号}
let imgSel = 0;      // 選んだPC画像
let gamesMode = "fps";

// data フォルダの fps データ (MC番号ごと) → 表。ゲーム・画質・解像度は左パネルで選ぶ
const RES = { FHD: "1080p/FHD", WQHD: "1440p/WQHD", "4K": "2160p/4K" };
function fpsTable(s) {
  const list = s.fps || {};
  if (!Object.keys(list).length) return null;
  const q = $("#fpsQuality").value;
  const cols = [...document.querySelectorAll("#fpsRes input:checked")].map((x) => x.value);
  const games = [...document.querySelectorAll("#fpsGames input:checked")].map((x) => x.value).filter((g) => list[g]);
  return { cols, rows: games.map((g) => ({ title: g.replace("グランド・セフト・オートＶ", "GTA V"),
    vals: cols.map((c) => list[g]?.[q]?.[RES[c]] || "-") })) };
}

function buildFpsPanel(s) {
  const list = s.fps || {};
  const names = Object.keys(list);
  $("#fpsBox").hidden = !names.length;
  if (!names.length) return;
  const box = $("#fpsGames");
  const prev = new Set([...box.querySelectorAll("input:checked")].map((x) => x.value));
  const want = prev.size ? prev : new Set(GAME_TEMPLATE);
  box.replaceChildren(...names.map((g) => {
    const cb = el("input", { type: "checkbox", value: g });
    cb.checked = want.has(g);
    cb.onchange = () => {
      if ([...box.querySelectorAll("input:checked")].length > 5) cb.checked = false;  // 枠に入るのは5本まで
      setGames("fps");
    };
    return el("label", {}, cb, " " + g);
  }));
}

function gamesTable(d) {
  const s = d.sheet;
  const box = el("div", { class: "games opt-games" }, el("div", { class: "bar", text: "ゲーム性能（3DMarkベンチマーク）" }));
  const tb = el("table");
  if (gamesMode === "fps") {
    const g = fpsTable(s) || (s.games?.rows?.length ? s.games
      : { cols: ["FHD", "4K"], rows: GAME_TEMPLATE.map((t) => ({ title: t, vals: ["", ""] })) });
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
  const note = s.note;  // ノートPCの時は画面・重量・用途などのノート用レイアウト
  buildFpsPanel(s);  // 表を作る前にゲームの選択欄を用意
  const pop = $("#pop");
  pop.className = "pop sheet" + (note ? " note" : "");
  pop.replaceChildren();

  // ヘッダー: ロゴ・シリーズ / Model Name・管理番号・型番
  const logoFile = asset("logo_" + s.brand.toLowerCase());
  const head = el("div", { class: "s-head" + (s.series ? "" : " no-series") },
    el("div", { class: "s-brand" },
      logoFile ? assetImg(logoFile, "s-logo-img") : textLogo(s.brand),
      s.series ? ed("div", "s-series", s.series) : null),
    el("div", { class: "s-model" },
      el("div", { class: "s-model-top" }, el("span", { text: "Model Name" }), ed("span", "mc", note ? s.pid : s.mc)),
      ed("div", "s-code", s.code),
      s.codeSub ? ed("div", "s-code-sub", s.codeSub) : null));  // 型番の後ろの説明 (小さく)

  const img = el("img", { id: "popImg", src: d.images[imgSel] || d.images[0] || "", alt: "" });

  // 価格
  const inst = d.installment;
  const price = el("div", { class: "s-price" },
    el("div", { class: "amt" }, ed("span", "n", yen(d.price)),
      el("span", { class: "unit" }, el("span", { class: "tax", text: "税込" }), el("span", { class: "en", text: "円" }))),
    inst ? ed("div", "inst opt-install", `三井住友分割払 ${inst.count || 36}回 月々${yen(inst.monthly)}円(税込)`) : null);

  const warranty = s.warranty ? ed("div", "s-warranty opt-warranty", `${s.warranty} （※別途オプション保証もご加入いただけます）`) : null;

  // 下部: カスタマイズ内容 (カスタマイズした時) か、選んだバナー
  const banner = d.customBox?.length ? customBox(d.customBox) : bannerEl(inst);


  const body = note ? noteBody(d, img) : deskBody(d, img);
  pop.append(head, ...body.top, price, ...body.bottom, warranty, banner);
  buildPanel(d);
  applyOptions();
  fitSheet();
  img.onload = fitSheet;
}

/* ---------- 下部バナー (分割手数料0円 / キャンペーン / 保証 / サービス を選べる) */
// 画像は pop_assets に置く: banner_credit / banner_campaign / banner_warranty / banner_service (.png/.jpg)
// 枠の大きさは 186 × 34 mm (カスタマイズ内容を全部入れた時の枠と同じ)
const BANNERS = [
  { id: "credit", label: "分割手数料0円（三井住友カード）", file: "banner_credit" },
  { id: "campaign", label: "キャンペーン", file: "banner_campaign" },
  { id: "warranty", label: "保証", file: "banner_warranty" },
  { id: "service", label: "サービス", file: "banner_service" },
];
let bannerSel = "credit";
let bannerUpload = "";  // 「画像を選ぶ」で選んだ画像 (このPOPだけで使う)

function bannerEl(inst) {
  const b = BANNERS.find((x) => x.id === bannerSel) || BANNERS[0];
  const file = bannerUpload || asset(b.file);
  if (file) return el("div", { class: "s-banner img opt-banner" }, assetImg(file, ""));
  if (b.id === "credit") {  // 画像が無い時は文字で作った分割手数料0円バナー
    return el("div", { class: "s-banner opt-banner" },
      el("div", { class: "card" }, ed("b", "", "三井住友カード"), ed("span", "", "ショッピングクレジット")),
      el("div", { class: "msg" },
        el("div", { class: "max" }, el("span", { class: "flag", text: "最大" }), ed("b", "", String(inst?.count || 36)), el("span", { text: "回まで" })),
        el("div", { class: "zero" }, el("span", { text: "分割手数料" }), el("b", { text: "0" }), el("span", { text: "円!!" }))));
  }
  return el("div", { class: "s-banner empty opt-banner" },
    el("div", { text: `${b.label}バナー：pop_assets フォルダに ${b.file}.png を置いてください（186 × 34 mm）` }));
}

function buildBannerPanel() {
  const box = $("#bannerSel");
  box.replaceChildren(...BANNERS.map((b) => {
    const r = el("input", { type: "radio", name: "banner", value: b.id });
    r.checked = b.id === bannerSel;
    r.onchange = () => { bannerSel = b.id; bannerUpload = ""; $("#bannerFile").value = ""; rerender(); };
    const has = asset(b.file) ? "" : (b.id === "credit" ? "（画像なし：文字のバナー）" : "（画像なし）");
    return el("label", {}, r, ` ${b.label}`, el("small", { class: "hint", text: has }));
  }));
}
$("#bannerFile").onchange = (e) => {
  const f = e.target.files[0];
  if (f) { bannerUpload = URL.createObjectURL(f); rerender(); }
};
function rerender() { if (base) render(applyCustom(base)); }
assetsReady.then(buildBannerPanel);

function textLogo(brand) {
  if (/^THIRDWAVE$/i.test(brand)) {
    return el("div", { class: "s-logo tw" }, el("span", { class: "em", html: ICON.twSlash }), ed("span", "t", "THIRDWAVE"));
  }
  return el("div", { class: "s-logo" }, el("span", { class: "em", html: ICON.emblem }), ed("span", "t", brand));
}

function specLogo(key, main, brand) {
  const file = key === "GPU" ? gpuAsset(main) : key === "CPU" ? cpuAsset(main) : "";
  if (file) return assetImg(file, "logo-img");
  return brand && LOGO[brand] ? LOGO[brand](main) : el("div", { class: "k", text: key });
}

/* ---------- デスクトップ: PC画像 + 基本構成 / ゲーム性能 + 端子 / 仕様 */
function deskBody(d, img) {
  const s = d.sheet;
  const basic = el("div", { class: "s-basic" }, el("div", { class: "bar", text: "基本構成" }));
  for (const b of s.basic) {
    const inline = b.key === "メモリ" || b.key === "SSD";
    basic.append(el("div", { class: "row r-" + (b.brand ? "logo" : "text") }, el("div", { class: "kc" }, specLogo(b.key, b.main, b.brand)),
      el("div", { class: "vc" + (inline ? " inline" : "") }, ed("div", "m", b.main), b.sub ? ed("div", "s", b.sub) : null,
        b.extra ? ed("div", "x", b.extra) : null)));  // メモリの「+ ヒートシンク」などは2行目に
  }
  const mid = el("div", { class: "s-mid" }, el("div", { class: "s-img" }, img), basic);
  const tables = el("div", { class: "s-tables" }, gamesTable(d), portsTable(s));

  const sz = s.size || {};
  const spec = el("div", { class: "s-spec opt-spec" }, el("div", { class: "bar", text: "仕様" }),
    el("div", { class: "cells" },
      iconCell("wifi", "Wi-Fi", s.wifi.main, s.wifi.sub),
      iconCell("lan", "LAN", s.lan.main, s.lan.sub),
      sizeCell(sz, ""),
      el("div", { class: "c weight" }, vlbl("重量"),
        el("div", { class: "kg" }, el("span", { text: "約 " }), ed("b", "", s.weight), el("span", { text: " Kg" })))));
  return { top: [mid, tables], bottom: [spec] };
}

const iconCell = (icon, label, main, sub) => el("div", { class: "c" },
  el("div", { class: "ic" }, el("span", { html: ICON[icon] }), el("small", { text: label })),
  el("div", { class: "tx" }, ed("div", "", main), sub ? ed("div", "sub", sub) : null));
const sizeCell = (sz, noteText) => el("div", { class: "c size" }, vlbl("サイズ"),
  el("div", { class: "wdh" }, ...["W", "D", "H"].map((k) =>
    el("div", {}, el("span", { class: "k", text: k + ":" }), ed("span", "v", sz[k] || ""), el("span", { class: "u", text: "mm" }))),
    noteText ? ed("div", "gomu", noteText) : null));

/* ---------- ノート: 重量・画面 / 画像 + 用途 or ゲーム性能 / CPU・GPU・メモリ・SSD・OS / インターフェース仕様 */
const USE_LABEL = { office: "Office" };
function usesTable(uses) {
  const tb = el("table");
  tb.append(el("tr", { class: "hd" }, el("th", { text: "主な用途" }), el("th", { text: "目安" })));
  for (const [k, v] of Object.entries(uses)) {
    tb.append(el("tr", {}, ed("th", "", USE_LABEL[k.toLowerCase()] || k), ed("td", "", v)));
  }
  return el("div", { class: "uses opt-games" }, tb, ed("div", "note", "◎＝文句なし　○＝余裕　△＝十分"));
}

function noteBody(d, img) {
  const s = d.sheet, n = s.note;
  const weight = el("div", { class: "n-weight" }, el("small", { text: "重量" }), el("small", { text: "約" }),
    ed("b", "", n.weight), el("small", { text: "kg" }));
  const disp = el("div", { class: "n-disp" },
    el("div", { class: "l1" }, ed("span", "inch", n.inch),
      el("span", { class: "u" }, el("span", { class: "ui", text: "インチ" }), ed("span", "pnl", n.panel))),
    el("div", { class: "l2" }, ed("span", "hz", n.hz), el("span", { class: "hzu", text: "Hz" }),
      el("span", { class: "res" }, el("small", { text: "解像度" }), ed("span", "rv", n.res),
        n.gamut ? ed("span", "gamut", n.gamut) : null)));  // 色域 (製品仕様にある時だけ)
  const right = Object.keys(n.uses || {}).length ? usesTable(n.uses) : gamesTable(d);
  const top = el("div", { class: "n-top" },
    el("div", { class: "n-left" }, weight, el("div", { class: "s-img" }, img)),
    el("div", { class: "n-right" }, disp, right));

  const b = Object.fromEntries(s.basic.map((x) => [x.key, x]));
  const line = (key, main, sub, brand) => el("div", { class: "n-row" },
    el("div", { class: "lg" }, specLogo(key, main, brand)),
    el("div", { class: "tx" }, ed("div", "m", main), sub ? ed("div", "s", sub) : null));
  const ssdSub = b.SSD.detail || "";
  const box = el("div", { class: "n-box" },
    line("CPU", b.CPU.main, b.CPU.sub, b.CPU.brand),
    line("GPU", n.gpu.main, n.gpu.sub, b.GPU.brand),
    el("div", { class: "n-cols" },
      el("div", {}, ed("div", "m", b["メモリ"].main), ed("div", "s", b["メモリ"].sub), b["メモリ"].extra ? ed("div", "s", b["メモリ"].extra) : null),
      el("div", {}, ed("div", "m", b.SSD.main), ed("div", "s", ssdSub)),
      el("div", {}, ed("div", "m os", b.OS.main.replace(/\s+(\d+ビット)$/, "\n$1")))));

  const io = el("div", { class: "s-spec n-if opt-spec" }, el("div", { class: "bar", text: "インターフェース仕様" }),
    el("div", { class: "cells" },
      iconCell("wifi", "Wi-Fi", n.wifi.main, n.wifi.sub),
      iconCell("lan", "LAN", n.lan.main, n.lan.sub),
      n.hdmi ? el("div", { class: "c" }, el("div", { class: "ic" }, el("span", { html: ICON.hdmi }), el("small", { text: "HDMI" }))) : null,
      el("div", { class: "c" }, el("div", { class: "ic" }, el("span", { html: ICON.usb }), el("small", { text: "USB" })),
        ed("div", "usb", n.usb.join("\n"))),
      sizeCell(n.size || {}, n.sizeNote)));
  return { top: [top, box], bottom: [io] };
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
  fitLayout();
  fitText($(".s-code"), $(".s-code-sub") ? 21 : 24, 9);
  fitText($(".s-code-sub"), 3.6, 2.2);
  fitText($(".s-series"), 13, 7);  // GSL-Series など長いシリーズ名は小さく
  // 基本構成の値も1行に収める
  document.querySelectorAll(".s-basic .m").forEach((m) => fitText(m, 6.2, 3.6));
  document.querySelectorAll(".n-row .m").forEach((m) => fitText(m, 6, 3.6));
  // 基本構成の行に収まらない時は補足 (かっこ内・+ 付属品) の文字を小さく
  document.querySelectorAll(".s-basic .vc, .n-cols > div").forEach(fitHeight);
  // カスタマイズ内容: 枠 (34mm) に入るまで文字を小さく
  const cb = $(".s-custom");
  if (cb) {
    const vs = [...cb.querySelectorAll(".v")];
    vs.forEach((v) => (v.style.fontSize = ""));
    let mm = vs.length ? parseFloat(getComputedStyle(vs[0]).fontSize) / 3.7795 : 0;
    while (mm > 2 && cb.scrollHeight > cb.clientHeight + 1) {
      mm -= 0.1;
      vs.forEach((v) => (v.style.fontSize = mm.toFixed(1) + "mm"));
    }
  }
}

function fitHeight(box) {
  const subs = [...box.querySelectorAll(".s, .x")];
  if (!subs.length) return;
  subs.forEach((x) => (x.style.fontSize = ""));
  let mm = parseFloat(getComputedStyle(subs[0]).fontSize) / 3.7795;
  while (mm > 2 && box.scrollHeight > box.clientHeight + 1) {
    mm -= 0.2;
    subs.forEach((x) => (x.style.fontSize = mm.toFixed(1) + "mm"));
  }
}

// 中身が A4 に入りきらない時 (カスタマイズ内容の枠が大きい等) は、画像・表・価格を少しずつ小さくして重ならないようにする
function fitLayout() {
  const pop = $("#pop.sheet");
  if (!pop) return;
  const tables = pop.querySelector(".s-tables");
  const price = pop.querySelector(".s-price .n");
  const fits = () => pop.scrollHeight <= pop.clientHeight + 1 &&
    (!tables || [...tables.children].every((c) => c.hidden || c.getBoundingClientRect().bottom <= tables.getBoundingClientRect().bottom + 1));
  for (let k = 1; k >= 0.7; k -= 0.03) {
    pop.style.setProperty("--k", k.toFixed(2));
    fitText(price, 38.8 * Math.max(k, 0.82), 20);  // 価格は 110pt から最大 2割まで
    if (fits()) return;
  }
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
  if (Object.keys(d.sheet.fps || {}).length) $("#gamesHint").textContent = `data フォルダの fps データ（${d.sheet.mc}）を表示しています。`;
  else if (!d.sheet.games?.rows?.length) $("#gamesHint").textContent += `\n※ data フォルダの fps データに ${d.sheet.mc || "この商品"} がありません。`;

  const thumbs = $("#thumbs");
  thumbs.replaceChildren();
  d.images.forEach((u, i) => {
    const t = el("img", { src: u, loading: "lazy", class: i === imgSel ? "sel" : "" });
    t.onclick = () => {
      imgSel = i;
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
$("#fpsQuality").onchange = () => setGames("fps");
document.querySelectorAll("#fpsRes input").forEach((cb) => (cb.onchange = () => setGames("fps")));
$("#btnGamesMark").onclick = () => setGames("mark");

/* ------------------------------------------------------------ カスタマイズ */
// 商品ページのカスタマイズ選択肢から選ぶ → 合計金額・スペック表記に反映。
// メモリ・SSD はスペック欄に、それ以外 (Office・CPUファン・グリス・電源・無線LAN) は下のバナーの代わりの枠に出す
const SPEC_CUSTOM = ["メモリ", "SSD"];
const CUSTOM_LABEL = { "オフィスソフト": "Office" };

// "64GB (32GB×2) (DDR5-4800) + ホワイトヒートシンク(ARGB…)" → ["64GB", "(32GB×2) (DDR5-4800)", "+ ホワイトヒートシンク(ARGB…)"]
function splitMemory(t) {
  const [body, ...plus] = t.split(/\s*\+\s*/);
  const m = body.match(/^(\S+)\s*(.*)$/);
  const extra = plus.length ? "+ " + plus.join(" + ") : "";
  return m ? [m[1], m[2], extra] : [body, "", extra];
}
function splitSsd(t) {     // "2TB SSD (M.2 NVMe Gen4) WD SN850X (読込速度 …)" → ["2TB SSD", "M.2 NVMe Gen4 WD SN850X"]
  const s = t.replace(/\s*\((?:読込|読み込み)速度[^)]*\)/, "").trim();
  const m = s.match(/^(\S+\s*SSD)\s*(.*)$/i) || s.match(/^(\S+)\s*(.*)$/);
  return m ? [m[1], m[2].replace(/^\(([^)]*)\)/, "$1").trim()] : [s, ""];
}
function wifiOf(t) {       // "Wi-Fi 6+Bluetooth(R)5.2対応 無線LAN" → {main: "6 対応", sub: "(Bluetooth 5.2)"}
  const w = t.match(/Wi-?Fi\s*(\d+E?)/i), b = t.match(/Bluetooth(?:\(R\))?\s*([\d.]+)/i);
  return w ? { main: `${w[1]} 対応`, sub: b ? `(Bluetooth ${b[1]})` : "" } : { main: "搭載", sub: "" };
}

function applyCustom(orig) {
  const d = structuredClone(orig);
  const picks = Object.keys(orig.customize || {}).filter((cat) => cat in custom)  // 並びは商品ページの順
    .map((cat) => ({ cat, opt: orig.customize[cat][custom[cat]] }))
    .filter((x) => x.opt && !x.opt.base);
  const add = picks.reduce((a, x) => a + x.opt.price, 0);
  if (add && orig.price) {
    d.price = orig.price + add;
    // 月々の分割額は 元の月々 × (合計 / 元の価格) を100円単位に (目安。POP上で修正可)
    if (orig.installment?.monthly) d.installment.monthly = Math.round(orig.installment.monthly * d.price / orig.price / 100) * 100;
  }
  const b = Object.fromEntries(d.sheet.basic.map((x) => [x.key, x]));
  for (const { cat, opt } of picks) {
    if (cat === "メモリ") [b["メモリ"].main, b["メモリ"].sub, b["メモリ"].extra] = splitMemory(opt.pop);
    if (cat === "SSD") {
      [b.SSD.main, b.SSD.detail] = splitSsd(opt.pop);
      b.SSD.sub = b.SSD.detail;
    }
    if (cat === "無線LAN") {
      d.sheet.wifi = wifiOf(opt.pop);
      if (d.sheet.note) d.sheet.note.wifi = wifiOf(opt.pop);
    }
  }
  d.customBox = picks.filter((x) => !SPEC_CUSTOM.includes(x.cat)).map((x) => ({ k: CUSTOM_LABEL[x.cat] || x.cat, v: x.opt.pop }));
  d.customAdd = add;
  return d;
}

function customBox(items) {
  return el("div", { class: "s-custom opt-banner" + (items.length > 3 ? " two" : "") },
    el("div", { class: "bar", text: "カスタマイズ内容" }),
    el("div", { class: "items" }, ...items.map((x) => el("div", { class: "it" }, el("div", { class: "k", text: x.k }), ed("div", "v", x.v)))));
}

function buildCustomPanel(d) {
  const box = $("#customSel");
  const cats = Object.keys(d.customize || {});
  $("#customBox").hidden = !cats.length;
  box.replaceChildren(...cats.map((cat) => {
    const sel = el("select", { class: "wide-sel" });
    d.customize[cat].forEach((o, i) => {
      const op = el("option", { value: String(i), text: `${o.label}${o.base ? "（標準）" : `（+${yen(o.price)}円）`}` });
      if (o.base) op.selected = true;
      sel.append(op);
    });
    sel.onchange = () => { custom[cat] = Number(sel.value); updateCustom(); };
    return el("label", { class: "cust" }, el("span", { class: "lbl", text: CUSTOM_LABEL[cat] || cat }), sel);
  }));
  updateCustomSum();
}
function updateCustomSum() {
  const d = applyCustom(base);
  $("#customSum").textContent = d.customAdd
    ? `カスタマイズ +${yen(d.customAdd)}円 → 合計 ${yen(d.price)}円（税込）`
    : "標準構成のままです";
}
function updateCustom() {
  updateCustomSum();
  render(applyCustom(base));
}
$("#btnCustomReset").onclick = () => {
  custom = {};
  buildCustomPanel(base);
  render(applyCustom(base));
};

const OPTS = {
  optGames: ".opt-games", optPorts: ".opt-ports", optInstall: ".opt-install", optSpec: ".opt-spec",
  optWarranty: ".opt-warranty", optBanner: ".opt-banner",
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
