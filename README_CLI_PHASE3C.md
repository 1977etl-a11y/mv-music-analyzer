# CLI Phase 3C — CLIからPWAへの往復統合検証

開始点: `6799296987b0c832194e509cf3b976a085a11b52`（Phase 3B）。作業ブランチ: `codex/cli-phase3c`。

## 範囲

既存 `tests/browser-smoke.cjs` を調査済み。同テストはPWA単体の読込・編集・承認・適用・baseline永続化を扱っています。変更せず、独立した `tests/cli-pwa-roundtrip.cjs` にCLI生成ファイルの再入力部分を追加しました。今回、既存browser-smoke全体の再実行はしていません。

新テストは既存の合成44 CUT fixtureを利用し、レビュー1 CUTを明示的にneeds_revisionとして、実CLIのrevision-handoff → proposal-create → proposal-edit → preflightを実行します。レビュー内の解析差分は変更根拠として保持し、コンテの時刻には反映しません。参照用途は合成テスト用のevidenceとし、音響同期を主張しない動作編集を検証します。

## 実行方法

Playwrightを利用可能にしてください。リポジトリに依存パッケージは追加していません。既存browser-smokeと同様、通常のplaywright解決または環境変数でモジュールを指定できます。

```powershell
$env:PLAYWRIGHT_MODULE = '<Playwrightモジュールの絶対パス>'
$env:BROWSER_CHANNEL = 'chrome'
node tests/cli-pwa-roundtrip.cjs
node --test tests/*.test.cjs
```

ブラウザ統合テストは `*.test.cjs` には含めません。Nodeテスト成功をブラウザ成功の代用にしません。

## 結果（2026-10-09）

環境: Windows、Node v24.19.0、Playwright 1.62.1、インストール済みGoogle Chromeのheadless実行、390×844 viewport。Playwrightは作業環境の同梱ランタイムを利用。

- Node: **172/172 PASS**、失敗0。
- Playwright往復統合: **2/2シナリオ PASS**（オブジェクト形式／最上位配列形式）。
- CLIファイルをPWAの保存済み改稿案編集UIへ再入力し、編集内容、original_cut、前後CUT、未確認状態、review_entriesの保持を確認。
- 未確認／未採用時はapplyGenerate無効。
- 合成データ限定で採用判断、制作指示・理由、6項目の確認、必要な関連指摘確認、最終確認をUI操作で模擬。
- UIから保存したproposalのCLI preflightがeligible_count=1でも、最終確認なしのapplyGenerateは無効。
- 確認済みの合成proposalをCLIで再編集すると確認が失効し、PWA側でも適用不可。
- 元CUT・前CUT・後CUTをそれぞれ変更した入力では照合が停止し、最終確認・生成ボタンが無効。保存されたauthor_checksを勝手に書き換えるのではなく、照合結果により適用不可になることを確認。
- 改訂版は44 CUTを維持し、期待値とのdeepEqualで **CUT 02.actions[0].actionの1フィールドだけ**の変更を確認。他43 CUT、時刻、ID、参照ID、順序、トップレベル形式とmetadataは維持。
- 変更履歴は1 CUT・1フィールド、最終確認true、6項目consistent、held=0。テスト用解析の+0.3秒差分をコンテへ自動反映しない。
- baseline・解析・元コンテ・レビュー等の入力ファイルはバイト比較で非変更を確認。

## 隔離と制約

localhostの一時サーバー、形式ごとに新しいブラウザコンテキスト、一時ファイルを使用し、終了時に破棄します。普段使用するブラウザプロファイルや公開版サイトへ接続しません。

ブラウザ内baselineは開始・終了とも未保存（null）です。保存・再生成を実行していません。合成baseline入力ファイルの非変更を別途確認しています。既存の実作品baselineを使う永続化テストではありません。

公開リポジトリに実作品データや非公開演出ロジックは追加していません。既存Core、PWA、CLI、baseline処理に変更はありません。正式適用CLIや承認フラグも追加していません。

初回実行ではテスト期待値にNode vm由来の別realmのオブジェクトが含まれ、構造が同じでもdeepStrictEqualが失敗しました。期待値をJSON往復で通常オブジェクト化するテスト側の修正のみで解消し、再実行で両形式がPASSしました。アプリ不具合は今回の検証では検出されていません。

commit・push・PR作成・mainへのmergeは未実施。Phase 3Cで停止します。
