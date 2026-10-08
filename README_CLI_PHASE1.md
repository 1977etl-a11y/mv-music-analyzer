# MV Analyzer CLI Phase 1

目的: 現在の v0.9.1 PWA を壊さず、既存 Core を Codex / GPT / 将来の MCP から直接呼べる入口を追加する。

## 今回追加するもの

- `cli/mv-analyzer.cjs`
  - `validate` のみ
  - `analysis JSON + storyboard JSON -> validation JSON`
  - 読み取り専用
  - 保存済み比較基準、解析JSON、コンテJSONを変更しない
- `tests/cli-validate.test.cjs`
  - 既存 synthetic fixture で CLI を回帰確認
  - top-level CUT array も確認
  - エラー出力も JSON

## 実行例

```bash
node cli/mv-analyzer.cjs validate \
  --analysis sample_music_analysis_v7.synthetic.json \
  --storyboard sample_storyboard_v0_7_1.synthetic.json
```

ファイルにも保存する場合:

```bash
node cli/mv-analyzer.cjs validate \
  --analysis analysis.json \
  --storyboard storyboard.json \
  --output validation.json
```

## テスト

```bash
node --test tests/cli-validate.test.cjs
```

既存テスト群も同時に実行して、v0.9.1 の挙動を壊していないことを確認する。

## 設計方針

1. CLI は `storyboard.js` の `importJSON()` と `validate()` をそのまま利用する。
2. CLI 独自の検証ロジックを作らない。
3. validation issue はデータとして返し、issue があるだけでは CLI failure にしない。
4. process exit code != 0 は、引数・ファイル読込・JSON parse・runtime failure に限定する。
5. 比較基準の保存/再作成は Phase 1 CLI に実装しない。
6. 意味変質プロトコル、動物リンクはこの公開 repo に入れない。

## PATCHからの最小調整

- 現行synthetic fixtureのreference_countは3ではなく9。Coreを変更せず、期待値を修正し、CLIのissues・affected_cut_idsをCoreの直接呼び出し結果と照合するテストを追加した。
- --outputは新規ファイルへの検証結果出力のみ許可する。排他的作成（wx）で既存ファイルの上書きを拒否し、解析・コンテ・比較基準を保護する。出力先が既に存在する場合は別名を指定する。検証結果を保存できた場合のみstdoutにもJSONを出力する。
- 余分な位置引数と重複したファイル指定オプションを拒否する。
- Coreのrequireをエラー処理内に置き、読込失敗もCLIのJSONエラーとして扱う。
- --helpまたは引数なしはusageを表示して終了コード0。validation issue（severity:errorを含む）は正常な結果で0。CLI/file/JSON/runtime failureはstderrへmv_analyzer_cli.error.v1を出力して1。

## 検証記録（2026-10-09）

- 基点main: a086aed（v0.9.1検証済み安定版）。origin/mainとの一致、作業ツリー未変更を確認してからcodex/cli-phase1を作成した。
- 指定のvalidateコマンド: PASS、終了コード0。2 CUT、9参照、5指摘（warning 4、intentional 1）。指摘は失敗ではなくCoreの検証結果として出力。
- node --test tests/cli-validate.test.cjs: 6/6 PASS。
- node --test tests/*.test.cjs: 140/140 PASS（既存134件を含む）。
- top-level CUT配列、Core結果との一致、正常な指摘出力、CLI/file/JSON/Core failure、新規レポート出力と既存ファイル上書き拒否を確認。
- テスト専用の一時ファイルで解析・コンテ・比較基準のダミーファイルが非変更であることを確認。実ユーザーのbaselineは操作していない。
- storyboard.jsを含む既存Core、PWA、解析JSON、コンテJSONは未変更。追加は本README・CLI・CLIテストの3ファイルのみ。外部依存の追加なし。
- Phase 1 validateで停止。compare、impact-review、音響解析の分離、新しい解析器、MCP server等は実装していない。非公開創作ロジックは含めない。
