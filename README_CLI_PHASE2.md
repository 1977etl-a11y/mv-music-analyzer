# MV Music Analyzer CLI Phase 2

Phase 1 commit `2b97a8c3f6b2fc75d8c992fb51415f3da62d805d` を起点とする、読み取り専用の比較・影響CUTレビューCLIです。新しい解析器や比較規則は追加していません。

## 実行

```sh
node cli/mv-analyzer.cjs validate --analysis analysis.json --storyboard storyboard.json
node cli/mv-analyzer.cjs compare --baseline baseline.json --analysis analysis.json --storyboard storyboard.json --output comparison.json
node cli/mv-analyzer.cjs impact-review --baseline baseline.json --analysis analysis.json --storyboard storyboard.json --output impact_review.json
```

- baselineはPWAから書き出したJSONファイルを指定します。ブラウザのIndexedDBにはアクセスしません。
- コンテはオブジェクト形式・最上位CUT配列形式とも、既存 `MVStoryboard.importJSON()` で読み込みます。
- `compare` は `MVStoryboardBaseline.check()` と `compare()` を使用し、Coreの結果全体をそのまま出力します。CLI独自のラッパーや判定は追加しません。
- `impact-review` は同じ3入力から比較を再実行し、`MVImpactReview.build()` の `mv_impact_cut_review.v0.8.2` をそのまま出力します。レビューID、候補、全対象CUTの `unreviewed` 初期状態を維持します。PWAで扱う既存レビュー形式です。
- 比較不能・参照欠落・音源や解析条件の変更は、比較結果の `analysis_status`、`identity_changes`、`unavailable_references` などで確認してください。参照ID照合件数と値比較件数は別です。レビュー対象が0 CUTでも、比較できたとは限りません。
- review出力に含まれる情報は既存Coreの範囲です。比較不能な参照の個別理由を確認する場合は `compare` の出力も使用してください。
- `--output` は排他的新規作成です。既存ファイルや入力は上書きできません。成功時はstdoutにもJSONを出力します。`--compact` で省スペース出力を指定できます。
- 差分や未解決参照は正常な結果として終了コード0です。引数・ファイル・JSON・実行エラーはstderrの `mv_analyzer_cli.error.v1` と非0終了になります。

## 実装範囲と保護

`cli/baseline-core.cjs` がリポジトリ内のbaseline IIFEをNode `vm` で読み込み、`check` / `compare` だけを公開します。入力JSONをJavaScriptとして評価しません。`save` / `recreate` / `load` は実行しません。

既存Core、PWA、ID生成、保存基準の形式は変更しません。baseline・解析・コンテ入力は読み取り専用です。proposal、apply、音源分離、音声認識、MCP、デスクトップ化は今回の対象外です。

## 検証

```sh
node --test tests/cli-validate.test.cjs
node --test tests/cli-compare.test.cjs
node --test tests/*.test.cjs
```

合成44 CUT / 211参照fixtureを使用。Core直接呼び出しとの全出力一致、SRTのID再対応付け（17.04→17.00秒、-0.0400秒、CUT 06/07のみ）、比較不能状態、CUT配列入力、入力不変、既存出力拒否、機械可読エラーを検証します。実作品の音源・コンテやブラウザ内baselineを利用するテストではありません。

実行結果：Phase 1専用 6/6 PASS、Phase 2専用 12/12 PASS、全Node 152/152 PASS（既存140件を維持）。ブラウザUIでの再入力操作は未実施ですが、レビューJSONはCore直接出力との完全一致を確認しています。
