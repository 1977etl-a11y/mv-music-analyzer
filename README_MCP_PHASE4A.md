# MV Analyzer MCP Phase 4A

ローカルstdio MCPから既存CLIを呼ぶ薄いラッパーです。公開Analyzer Coreと非公開の創作Skillを将来接続する共通インターフェースであり、創作Skillや演出判定は実装しません。

## 必要環境・導入

Node.js **20以上**。検証環境はNode v24.19.0。公式MCP SDK v2.3.1（`@modelcontextprotocol/server`）、Zod 4.6.5（`zod/v4`）、テスト用公式client v2.3.1を固定し、lockfileを同梱します。SDK要件は[公式package.json](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/package.json)を確認しています。

```sh
cd mcp
npm ci --ignore-scripts
npm test
```

依存はmcp/node_modulesだけに導入されます。ルートpackage.jsonやPWA配信ファイルは変更しません。実運用のみなら `npm ci --ignore-scripts --omit=dev` を利用できます。

## 起動・接続例

以下は架空のパスです。作業領域とファイルは利用者が事前に用意します。

```powershell
$env:MV_ANALYZER_WORKSPACE = 'C:\mv-workspace'
node C:\projects\mv-music-analyzer\mcp\server.mjs
```

MCPクライアントのstdio設定例（クライアントごとの形式に合わせてください）:

```json
{
  "mcpServers": {
    "mv-analyzer": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\projects\\mv-music-analyzer\\mcp\\server.mjs"],
      "env": {"MV_ANALYZER_WORKSPACE": "C:\\mv-workspace"}
    }
  }
}
```

サーバーはstdoutをMCP通信専用に使います。起動失敗はstderrへJSONを出して終了します。HTTPサーバーやネットワーク取得機能はありません。

## ツールと引数

全引数は作業領域からの相対JSONファイルパスです。絶対パス（領域内のものも含む）は受け付けません。余分なキー、output、承認フラグは厳密Zodスキーマで拒否します。

| Tool | 必須パス引数 | 任意パス引数 |
|---|---|---|
| mv_validate | analysis, storyboard | — |
| mv_compare | baseline, analysis, storyboard | — |
| mv_impact_review | baseline, analysis, storyboard | — |
| mv_revision_handoff | review, storyboard | — |
| mv_proposal_create | handoff, storyboard | — |
| mv_proposal_edit | proposal, storyboard, edits | — |
| mv_preflight | proposal, storyboard | analysis |

呼出例: `mv_validate` に `{"analysis":"synthetic/analysis.json","storyboard":"synthetic/board.json"}`。

結果は既存CLIのJSONをMCPのtext contentに格納します。ラッパーによる独自の評価や要約は行いません。差分・pending・blockerは正常な検査結果です。ファイル／引数／CLI失敗はMCPのisErrorまたはプロトコルの入力エラーで返します。CLI失敗JSONは取得できた場合にerrorレスポンス内へ保持します。

MCPは結果ファイルを書きません。次の工程へ渡すJSONの保存はクライアント側で制作者が管理してください。

## 安全境界

- `MV_ANALYZER_WORKSPACE` 未指定、相対指定、存在しないディレクトリなら起動停止。
- 相対パスのみ、`..`、絶対パス、UNC・ドライブ・ADS表現を拒否。realpathで解決後もworkspace内の通常JSONファイルだけを許可。領域外へのsymlink/junctionを拒否します。
- JSONは実行せずparseで確認。固定の `process.execPath` とリポジトリCLIパス、固定コマンド表と引数配列を使用。shellなし。子プロセスにNODE_OPTIONS等を引き継ぎません。
- 上限: 入力1ファイル32 MiB、CLI stdout＋stderr合計16 MiB、CLI実行30秒、MCP入力メッセージ64 KiB、パス4096文字。同時実行1件（重複呼出はbusyエラー）。上限超過は停止して明示的にエラーを返し、途中結果を成功として返しません。
- CLIのファイル読み込みは再openを伴うため、このラッパーは**悪意あるローカルプロセスとのファイル差し替え競争を防ぐOSサンドボックスではありません**。workspace、リポジトリ、Node、依存モジュールを信頼できる利用者だけが変更可能な状態にし、実行中にファイルやリンクを差し替えないでください。第三者と共有して書き換え可能な領域は使用しないでください。
- パス制限は内容の秘密性を分類しません。AIに渡してよいJSONだけをworkspaceへ置いてください。ファイル名・内容・エラーもMCPクライアントへ渡ります。
- baseline保存／再生成／削除、正式apply、最終承認、自動adopt_proposalは提供しません。proposal-editは既存Coreの編集・確認失効規則のみ利用します。
- preflightは技術的検査であり、人間の最終承認の証明ではありません。既存proposal内のフラグの真正性をMCPが保証するものでもありません。正式適用は既存PWAの制作者UIに残します。

## 検証記録

- Phase 3C: Node172/172、Playwright＋Chrome2/2を再実行しPASS。commit `9844e10ad5f050daaec6f5d8db307837c1108884` を `origin/codex/cli-phase3c` へpush済み。
- Phase 4A MCP: **7/7 PASS**。公式clientでstdio接続・7ツール取得、validate/compare/impact-reviewのCLI一致（211件値比較）、handoff/proposal/edit/preflight、入力不変、領域外パス・junction・不正JSON・未知引数の拒否、サイズと実行時間上限、未指定workspaceでの停止を検証。
- 既存Node: **172/172 PASS**。
- npm導入時監査: 0 vulnerabilities。
- 合成fixtureのみを使用。一時workspaceをテストで作り、baseline等は前後のバイト比較で非変更を確認。実作品や個人用パスは追加しません。
- MCPサーバー作成・ローカルSDK接続検証と、特定ChatGPT環境への接続確認は別工程です。今回、特定ChatGPT環境への接続は未実施。

既存CLI/Core/PWA/service worker/HTMLに変更はありません。Phase 4Aは未commit・未push。mainへのmerge・PR作成は行いません。
