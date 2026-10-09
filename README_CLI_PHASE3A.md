# CLI Phase 3A — 改稿案の初期生成

開始点: `origin/codex/cli-phase2` / `e0b45fd2c4310561610cf03fd3402c2a428cca47`。

```sh
node cli/mv-analyzer.cjs revision-handoff --review review.json --storyboard storyboard.json --output handoff.json
node cli/mv-analyzer.cjs proposal-create --handoff handoff.json --storyboard storyboard.json --output proposal.json
```

- `revision-handoff`: 既存 `checkReview()` / `build()` を利用。制作者が `needs_revision` としたCUTのみを `mv_storyboard_revision_handoff.v0.8.3` として出力します。
- `proposal-create`: 既存 `check()` / `create()` を利用。`mv_storyboard_revision_proposal.v0.8.4` を出力します。`original_cut` と `draft_cut` は同内容の独立コピー、`draft_changes` は空、`decision` は `unreviewed`、6項目の制作者確認は `unconfirmed` です。
- 対象0件は両コマンドとも正常終了します。
- 元コンテはオブジェクト形式と最上位CUT配列の両方を受け付けます。`importJSON()` で形式を検証したうえで、生成には入力の元フィールドを保持して渡します。
- CLIアダプターはhandoffのCoreエラーを隠さず停止します。proposal生成前にはレビューCoreによる判断の再確認と、`MVCutIdentity.resolve()` / `compare()` による元CUT照合を行います。Coreの正規化・派生フィールド除外規則をそのまま使用します。
- 前後CUTの解決はCoreに委ねます。Coreが元コンテ順を使う場合も `source_storyboard_order` の由来と `unconfirmed` を維持し、接続意図の確認済みとはしません。明示した接続先が解決できない場合は、別CUTに代用せず未取得・未確認を保持します。
- 生成を阻害するエラーはstderrの `mv_analyzer_cli.error.v1` と非0終了で報告し、stdoutや出力ファイルに不正な案を生成しません。Coreの `errors` は可能な場合、エラーJSONの `errors` に保持します。
- `--output` は新規作成限定。既存出力・全入力の上書きを拒否します。成功時はstdoutにも出力します。
- baseline、解析、コンテ、レビューは変更しません。PWA/Coreは未変更。編集・preflight・apply・自動承認は今回の対象外です。

## テスト

```sh
node --test tests/cli-revision.test.cjs
node --test tests/*.test.cjs
```

既存合成fixtureを使用し、選別、ゼロ件、Core出力一致、独立コピー、前後CUT、配列入力、矛盾・重複・欠損・不一致の停止、入力保護を検証します。実作品データは追加しません。ブラウザUI操作による再入力検証は未実施です。
