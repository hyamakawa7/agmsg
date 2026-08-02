# Phase 3 文書化の対応表

| 出典 | 目的 | 具体対象 | 役割 | 前後関係 | 候補語 | 初出定義 |
|---|---|---|---|---|---|---|
| `docs/plan/linux-desktop-app/implementation-plan.md` 3-4 | Linux 配布時の利用者判断を明確にする | AppImage だけを自動更新対象とし、deb はリリースページから再取得する製品判断と、その理由（権限昇格を伴う自己置換を採用しない） | 目的 | updater 実装と配布手順の前提 | Linux updater 製品方針 | 「Linux updater 製品方針」とは、Linux で自動更新を許可する形式と、対象外形式の取得方法を定める判断を指す |
| `docs/plan/linux-desktop-app/implementation-plan.md` 3-4 | 利用者が Linux 環境の既知挙動を回避できるようにする | 画面下端付近の send-to 下位項目の見切れ、開いた popup 上のホイールによる意図しない宛先変更、`NO_COLOR` 継承時の端末カラー欠落 | 記録 | Phase 2 実測の後、配布 README の利用上の注意として提示 | Linux Known limitations | 「Linux Known limitations」とは、Phase 2 の X11 実測で確認した制限と回避操作の記録を指す |
| `docs/plan/linux-desktop-app/implementation-plan.md` 3-4 / `app/README.md` の手書き運用 | 署名検証可能な更新メタデータを作成する | `latest.json` の `linux-x86_64` が AppImage 本体 URL と対応する `.AppImage.sig` URL を指す手順 | 手段 | deb/AppImage 成果物の生成後、固定 `app-latest` へアップロードする前 | linux-x86_64 updater entry | 「linux-x86_64 updater entry」とは、AppImage とその v2 署名を組にした latest.json の Linux 用エントリを指す |
| `docs/plan/linux-desktop-app/implementation-plan.md` 3-4 / `app/src-tauri/src/agmsg.rs` の install script | deb の依存宣言を後から検証可能にする | `sqlite3` を `bundle.linux.deb.depends` に明示する根拠（同梱 `agmsg-core` の `install.sh` が要求し、アプリ本体の rusqlite は bundled） | 記録 | tauri bundler の既定依存確認と同時に RELEASING へ記載 | sqlite3 dependency rationale | 「sqlite3 dependency rationale」とは、deb の sqlite3 宣言が agmsg-core の実行時要求に基づくことを示す記録を指す |
