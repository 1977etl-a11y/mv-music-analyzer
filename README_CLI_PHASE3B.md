# CLI Phase 3B — 改稿案編集と技術的な適用前検査

開始点: Phase 3A `2e1203997195a172cc96e1ac56532c77792a4446`。既存Core/PWAは変更しません。

```sh
node cli/mv-analyzer.cjs proposal-edit --proposal proposal.json --storyboard storyboard.json --edits edits.json --output proposal_edited.json
node cli/mv-analyzer.cjs preflight --proposal proposal_edited.json --storyboard storyboard.json --analysis analysis.json --output preflight.json
```

編集指定例（合成CUT）:

```json
{"edits":[{"cut_id":"cut_demo_a","path":["actions","0","action"],"value":"ゆっくり手を下ろす"}]}
```

## 編集

`MVRevisionProposal.restore()` で独立コピーを復元し、編集対象と元CUT・前後CUTを `MVCutIdentity.matchContext()` で照合してから `MVRevisionFields.promote()` に渡します。Coreの編集可能な既存プリミティブ値のみ扱い、識別子・参照・新規フィールド・構造や型の変更を拒否します。pathの各要素は文字列です。

`draft_changes` 更新と確認状態の失効はCoreの規則に従います。対象CUTおよび依存する隣接CUTの確認は必要に応じて `unconfirmed` へ戻ります。確認メモは保持されます。decisionや承認情報の編集APIはありません。editsの追加キーによる承認指定も拒否します。

入力proposalは変更しません。バッチの途中で失敗しても、部分編集結果をstdoutや出力ファイルへ書き出しません。ゼロ対象には空editsを指定できます。同値編集ではCoreが不要な差分を増やしません。

## preflightの意味と制限

**preflightは技術的検査であり、人間の最終承認を証明しません。** 入力proposalの確認フラグの真正性をCLIだけでは保証できません。`eligible_count` が正でも正式適用の許可ではありません。

`MVRevisionApply.inspect(proposal, board, {}, analysis)` の結果を変更・省略せず出力します。承認JSONは受け付けず、一時的なapprovalsは常に空オブジェクトです。proposalに既存の採用判断がなければ、Coreどおり候補0件になります。CLIは判断を補いません。

`--analysis` は省略可能です。省略時はnullを渡し、Coreが解析不足と判定する内容を保持します。blockers・pending・warningsや検証不能な理由があっても、検査を実行できた場合は終了コード0です。引数・JSON・ファイル・Core実行の失敗はstderrの `mv_analyzer_cli.error.v1` と非0終了です。

元コンテのオブジェクト形式・最上位CUT配列をサポートします。全入力は読み取り専用で、`--output` は排他的新規作成のみです。

`apply`、`--approve`、`--final-confirmed`、`--force`、承認JSON入力は未実装・拒否します。正式な改訂版コンテ生成は既存PWAの制作者確認UIで行ってください。ブラウザでの改稿案再読込・最終適用テストは別工程です。

## テスト

```sh
node --test tests/cli-proposal.test.cjs
node --test tests/*.test.cjs
```

既存の合成44 CUT fixtureを使用。指定draftのみの変更、他43 CUTのdraft不変、元情報保持、失効、Core差分一致、不正パス拒否、元CUT／前後CUT不一致、preflight全出力一致、入力保護、正式適用の拒否を検証します。実作品データ・非公開ロジックは追加していません。
