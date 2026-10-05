# v0.9.1 SRTの時刻変更によるID更新の比較

通常のID完全一致検索を優先する。旧IDが現在解析で解決できず、保存済みスナップショットがsrt_cueの場合のみ、比較処理内で再対応を試みる。ID生成、保存処理、IndexedDB、元基準は変更しない。

必須条件：音源・解析条件一致、record.analysisの識別情報一致、旧IDから解決した保存時pointerがSRT entriesを指すこと、保存済みsnapshotと旧解析値が一致すること、整数cue_indexと本文があること。現在のSRT参照でpointerまたはcue_indexに該当する候補を抽出し、一意で、pointer・cue_index・本文の全てが一致した場合だけ採用。旧・新解析の同じcue_indexの重複も拒否する。

比較結果のreference_idは旧IDを維持。event_changes[].remapとreference_remapsにold_reference_id / new_reference_id / kind / pointer / cue_index / methodを追加。値差分は既存differences()を使用。unavailable_reference_countを追加。影響CUTレビューにもremapを引き継ぐ。通常検証のmissing_referenceはそのまま残す。コンテの参照IDを自動で書き換える機能ではない。

候補なし、複数候補、本文や位置の矛盾、保存時解析なし、snapshot矛盾等は推測せずunavailable_references.reasonへ個別理由を記録する。失敗時は従来のevent_deleted/unresolved_referenceの扱いを維持する。

今回の確認済み実データ条件を再現した合成回帰：
- 保存日時2026-09-27T20:57:24.397Z、旧v0.7.1のrecord.analysis
- 旧srt_de9bbac2e3d0a3fc5beeab127c1c3b48 → 新srt_93927bc2b7547684936f1cf205962c68
- /vocal_asr_timeline/entries/3、cue_index 3、昼が街を叩く 笑い
- start_sec 17.04 → 17.00、end_sec 19.6は不変
- 211参照を値比較、比較不可0、event_changed 1件、影響CUT 06/07、レビュー時刻差-0.04秒
- 他210参照に差分なし、baselineと全入力は非変更

実装時点では、実baseline・修正版解析一式がこの環境に未提供のため、ユーザー報告の条件を合成データで再現して確認した。その後の実データ検証結果は下記の2026-10-05追記を参照。コンパクト基準で保存時pointer/indexを復元できない場合は対応しない。新IDへコンテ参照を変更した場合のreference_added/reference_removedは従来どおり別扱い。

変更：storyboard-baseline.js（比較内fallbackのみ）、impact-review.js（remapの保持）、tests/srt-remap.test.cjs、バージョン・キャッシュ情報。既存改稿案読み込み条件・適用判定には変更なし。


## 検証記録（2026-10-05追記）

**v0.9.1を現時点の検証済み安定版として記録する。** 以下の実データ比較はユーザーによる検証完了報告に基づく。実装時の合成回帰テストとは区別する。

### 既存baselineを使用した実データ比較

- 2026-09-27の既存baselineをそのまま使用し、211/211件の参照値比較に成功。
- SRT cueの開始時刻17.04秒 → 17.00秒（−40ms）に伴うID変更を、旧ID `srt_de9bbac2e3d0a3fc5beeab127c1c3b48` から新ID `srt_93927bc2b7547684936f1cf205962c68` へremap。
- `event_deleted`ではなく`event_changed`として検出。
- `unavailable_reference_count: 0`。
- 影響CUTは06 / 07。
- baseline・入力データは非変更。baselineの再生成・上書きは行っていない。

### metadata nullの調査結果

- 今回のmetadata nullは、配列形式の元コンテにトップレベルのid/title/versionが存在しないためであり、改訂版出力がmetadataを消失させる不具合ではない。
- baseline.boardのmetadataは別管理であり、配列形式の入力へ自動補完しない。
- metadata付きオブジェクト入力 → 改訂版生成 → JSON serialize → 再読込のround-tripで、id/title/versionの保持を確認。v0.9.0時点と現行コードの両方で、schemaなし／既存schema付きの合成44 CUTを検証した。
- 検証値はid `waratte_keruwa_storyboard`、title `笑って蹴るわ`、version `1.0`。44 CUTと未知のトップレベル情報を維持し、変更は指定したCUT 02.actionのみ。元入力も非変更。
- 配列入力は配列出力、オブジェクト入力はオブジェクト出力を維持する。metadata保持のための出力修正・baselineフォールバックは不要と判断した。

今回の追記は検証記録のみ。アプリコード、ID生成、比較・適用処理、保存データは変更していない。
