個別POP で使う画像の置き場所です。
このフォルダに下のファイル名で画像を置くと、POP の該当箇所がその画像に置き換わります。
（置いていないものは、これまでどおりツールが作る文字のロゴ・バナーで表示します）

使える形式: .png / .jpg / .jpeg / .webp / .svg   （例: logo_galleria.png）
ファイルを置いたら、ブラウザで POP を作り直す（「取得」をもう一度押す）と反映されます。

■ ヘッダーのロゴ（左上の紺色の枠ごと置き換え）
  logo_galleria       GALLERIA のロゴ
  logo_thirdwave      THIRDWAVE のロゴ（ノートPCなど。シリーズ名が無いので大きめに表示）
  logo_raytrek / logo_diginnos   （他ブランドの商品用）

■ 基本構成の GPU ロゴ（上から順に探して、最初に見つかったものを使います）
  gpu_geforce_rtx5070  など型番入り（RTX の4桁）… その型番だけ専用にしたい時
  gpu_geforce_rtx      GeForce RTX 共通
  gpu_geforce          GeForce 共通
  gpu_radeon           Radeon
  gpu_intel_arc        Intel Arc

■ 基本構成の CPU ロゴ（上から順に探します）
  cpu_intel_core_ultra5 / cpu_intel_core_ultra7 / cpu_intel_core_ultra9
  cpu_intel_core_ultra  Core Ultra 共通
  cpu_intel_core_i5 / cpu_intel_core_i7 / cpu_intel_core_i9
  cpu_intel_core        Core i 共通
  cpu_intel             インテル共通
  cpu_amd_ryzen5 / cpu_amd_ryzen7 / cpu_amd_ryzen9
  cpu_amd_ryzen         Ryzen 共通
  cpu_amd               AMD 共通

■ 下部のバナー（左パネルの「下部バナー」で4つから選べます）
  banner_credit        分割手数料0円（三井住友カード）  ※無い時はツールが作る文字のバナー
  banner_campaign      キャンペーン
  banner_warranty      保証
  banner_service       サービス

  画像サイズ: 2232 × 408 px（POP上で 186 × 34 mm・約300dpi。横:縦 ≒ 5.5:1）
  この大きさは「カスタマイズ内容」の枠（カスタマイズを全部入れた時）と同じです。
  比率が違う画像は、枠に収まるよう余白をつけて縮小表示します。
