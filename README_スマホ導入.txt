MV Music Analyzer PWA v0.2
================================

■ 目的
スマホ/PCブラウザ内で音源を解析し、意味変質型MVプロトコルへ渡す
music_analysis_v2.json を作るための簡易PWAです。

■ v0.2の主な追加
・Essentia.js + @audio/beat の二系統解析
・BPM推定のクロスチェック
・beat timestamps
・general onset timestamps
・低域オンセット / 高域オンセット
・低/中/高域エネルギー時間系列
・構造変化候補
・MV同期候補
・解析器一致度
・JSON共有/保存

■ スマホで使う
PWAは file:// 直開きではなく HTTPS 上で開く必要があります。
GitHub Pages、Cloudflare Pages、Netlify等の静的ホスティングへ
このフォルダ一式を置いてください。

初回:
1. HTTPS URLをChrome/Safariで開く
2. 音源を選択
3. 「解析開始」
4. 初回のみEssentia.js / @audio/beatをCDNから取得
5. JSON保存または共有
6. 必要なら「ホーム画面に追加」

■ 重要
・音源自体はアプリからサーバーへ送信しません。
・Verse/Chorus、楽器名、スキャットなどは自動確定しません。
・低域/高域イベントは映像同期候補として使うための信号特徴です。
・スマホでは長尺/高容量音源でメモリ不足になる場合があります。
