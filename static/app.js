"use strict";

const $ = (s) => document.querySelector(s);
const yen = (n) => (n == null ? "" : Number(n).toLocaleString("ja-JP"));
const MAIN_SPECS = ["CPU", "GPU", "メモリ", "SSD"];

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}
const editable = (tag, cls, text) => el(tag, { class: cls, contenteditable: "true", text });

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
    s.innerHTML = "これは商品ページのURLではありません（例: …/TC30/MC25585-SN5037.html）。<br>" +
      '/gamepc などのランキングから作る場合は <a href="/ranking.html">人気ランキングPOP</a> を使ってください。';
    return;
  }
  load("/api/fetch", { url });
};
$("#url").addEventListener("keydown", (e) => e.key === "Enter" && $("#btnFetch").click());
$("#btnParse").onclick = () => load("/api/parse", { html: $("#html").value, url: $("#url").value });
$("#btnPrint").onclick = () => window.print();

/* ------------------------------------------------------------ render */

function detectBrand(name) {
  const m = name.match(/^(GALLERIA|THIRDWAVE|raytrek|Diginnos)/i);
  return m ? m[1].toUpperCase() : "DOSPARA";
}

function render(d) {
  const pop = $("#pop");
  pop.className = "pop";
  pop.replaceChildren();

  // ヘッダー
  const head = el("div", { class: "pop-head" },
    el("div", { class: "top" },
      editable("div", "brand", detectBrand(d.model)),
      d.stock ? editable("div", "stock opt-stock", d.stock) : null),
    d.catchcopy ? editable("div", "catch opt-catch", d.catchcopy) : null,
    editable("div", "model", d.model),
    d.edition ? editable("div", "edition opt-edition", d.edition) : null,
  );

  // 画像 + ベンチ + ラベル
  const img = el("img", { id: "popImg", src: d.images[0] || "", alt: "" });
  const side = el("div", { class: "side" });
  const b = d.benchmark || {};
  if (b.timeSpy) {
    side.append(el("div", { class: "bench opt-bench" },
      el("div", { class: "t", text: "3DMark Time Spy" }),
      editable("div", "s", yen(b.timeSpy)),
      b.level ? el("div", { class: "stars", text: "★".repeat(b.level) + "☆".repeat(5 - b.level) }) : null,
      b["Fire Strike"] ? el("div", { class: "sub", text: `Fire Strike ${yen(b["Fire Strike"])}` }) : null,
    ));
  }
  if (d.labels.length) {
    side.append(el("div", { class: "labels opt-labels" }, ...d.labels.map((t) => editable("span", "", t))));
  }
  const mid = el("div", { class: "pop-mid" }, el("div", { class: "img" }, img), side);

  // スペック
  const specs = el("div", { class: "specs" });
  for (const s of d.keySpecs) {
    const row = el("div", { class: "r" + (MAIN_SPECS.includes(s.label) ? " main" : ""), "data-label": s.label },
      el("div", { class: "k", text: s.label }),
      editable("div", "v", s.display));
    row.hidden = !s.show;
    row._spec = s;
    specs.append(row);
  }

  // 価格
  const priceBox = el("div", { class: "pop-price" },
    el("div", { class: "price" },
      el("span", { class: "yen", text: "¥" }),
      editable("span", "num", yen(d.price)),
      el("span", { class: "tax", text: "（税込）" })),
    d.installment ? el("div", { class: "inst opt-install" },
      el("div", { text: `分割払い ${d.installment.count || ""}回` }),
      el("div", {}, el("b", { contenteditable: "true", text: yen(d.installment.monthly) }), "円/月")) : null,
  );

  const today = new Date();
  const foot = el("div", { class: "pop-foot" },
    editable("span", "", `管理コード：${d.manageCode || d.productId || ""}　${d.warranty || ""}`),
    editable("span", "", `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()} 時点の価格・構成です`));

  pop.append(head, mid, specs, priceBox, foot);

  buildPanel(d);
  applyOptions();
}

function buildPanel(d) {
  $("#editor").hidden = false;

  // 画像
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

  // スペック表示切替
  const box = $("#specToggles");
  box.replaceChildren();
  document.querySelectorAll(".specs .r").forEach((row) => {
    const cb = el("input", { type: "checkbox" });
    cb.checked = !row.hidden;
    cb.onchange = () => (row.hidden = !cb.checked);
    box.append(el("label", { class: "spec-toggle" }, cb,
      el("span", {}, row._spec.label, el("small", { text: row._spec.value.split("\n")[0] }))));
  });

  // 全仕様（確認用）
  const raw = $("#rawTable");
  raw.replaceChildren();
  for (const r of d.specTable) {
    raw.append(el("tr", {}, el("th", { text: r.label }), el("td", { text: r.value })));
  }
}

function applyOptions() {
  const map = {
    optEdition: ".opt-edition", optCatch: ".opt-catch", optLabels: ".opt-labels",
    optBench: ".opt-bench", optInstall: ".opt-install", optStock: ".opt-stock",
  };
  for (const [id, sel] of Object.entries(map)) {
    document.querySelectorAll(sel).forEach((e) => (e.hidden = !$("#" + id).checked));
  }
}

document.querySelectorAll("#editor input[id^=opt]").forEach((cb) => {
  if (cb.id === "optShort") {
    cb.onchange = () => document.querySelectorAll(".specs .r").forEach((row) => {
      row.querySelector(".v").textContent = cb.checked ? row._spec.short : row._spec.display;
    });
  } else {
    cb.onchange = applyOptions;
  }
});
