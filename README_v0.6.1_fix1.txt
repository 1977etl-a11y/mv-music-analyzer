MV Music Analyzer v0.6.1-fix1

Android/スマホでSRTファイル選択欄を押せない問題を修正。
- ネイティブfile inputを直接操作するUIから、明示的な「SRTファイルを選択」ボタン方式へ変更
- ボタン押下でfile pickerを開く
- SRT MIME acceptを text/plain / application/x-subrip / application/octet-stream まで許容
- Service Worker cache名を更新し、旧UIキャッシュを避ける
- 解析ロジック自体はv0.6.1から変更なし
