# v0.8.8 元CUT・前後CUTの照合修正

## 確認した原因
v0.8.7のconfirmationState/carryChecksは、id ?? cutの厳密一致で検索したCUTをオブジェクト全体比較していた。制作情報が同じでも、保存側だけのreferencesやUI補助情報で不一致となる合成44 CUTデータを再現した。previous_cutを読まず配列順を使用する問題も確認した。プロパティ順は従来から正規化済み。neighbors.statusは従来から同一性判定に使用しておらず、今回も使用しない。

ユーザーの実際の570件指摘のコンテ・保存案は作業環境にないため、そのファイルで発火した差異は断定していない。提供された構造を一般化した合成データで検証した。

## 修正
- cut-identity.js: id/cut_id/cut/cut_numberの識別候補を読み取り専用で照合。数字のCUT番号02と2を同一視。曖昧・重複・矛盾したIDは停止。
- previous_cut、previous_cut_id、connections、および後CUTの逆向き接続情報を参照。保存された前後CUTの実体も比較する。
- cut、block、start/end、size、subject、action、composition、previous_cut、next_handoff、camera_directionなど制作情報と未知の追加項目は厳密に比較。時刻別名start_sec/end_secは比較時のみ対応させ、矛盾した別名は停止。
- 同一性比較から除く既知の補助項目はreferences、review_refs、audio_evidence、audio evidence、audio_context、ui、ui_state、_ui、_ui_state、derived_info、_derived。これらは入力・出力から削除しない。参照検証は既存の独立処理で維持する。補助項目の改稿適用は拒否。
- 変更フィールドは現在の元CUTにも同じパス・保存時値が必要。制作情報の実差異や前後CUT不一致は手動チェックで迂回できない。
- 「元CUT・前後CUTの照合差分」にCUT、対象/前/後、フィールド、saved/currentを折りたたみ表示。
- author_checks、確認メモ、revision_summary、reasonを変更しない。最終承認は必須。
- revision-scopeは照合したIDの別名を変更範囲の検証ビューにだけ対応付ける。通常検証器・比較器・baseline処理は変更なし。

## 互換性
proposalはmv_storyboard_revision_proposal.v0.8.4、適用履歴はmv_storyboard_revision_application.v0.8.5を維持。application_versionのみ0.8.8。改訂版は別ファイル。元コンテ・解析・baselineは書き換えない。

## 回帰確認
A〜J: 一致時の適用可能1 CUT、対象/前/後の実差異による停止、文字列番号、unconfirmed/inconsistentの停止、後読み込み時の確認状態・メモの保持、最終承認必須を確認。二打時刻2.3917 / 2.7748秒を維持し、他43 CUTは不変。
Node全113テスト成功。既存211件参照値比較、567件の既存指摘を隔離するテストも維持。隔離したEdgeのスマホ幅で保存案の読み込み→元コンテ後読み込み→診断→最終承認→別JSON書き出しを確認。実機スマートフォン・ユーザー実保存データでは未検証。

## 操作
保存済み案を「改稿案作成」に読み込み、「画面の改稿案を使用」で渡して「元コンテJSON」を指定する。不一致なら「元CUT・前後CUTの照合差分」で値を確認する。一致と制作確認を満たした場合だけ最終確認後に改訂版を生成・書き出す。
