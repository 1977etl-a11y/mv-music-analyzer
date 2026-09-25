# MV Music Analyzer v0.7.1

解析JSONと演出者のコンテを、独立したデータとして接続します。音響・Stem・9種類のmotion primitives・歌詞/SRT照合の計算方法はv0.7.0から変更していません。

## 使用方法

1. 「コンテ参照・検証」で保存済みのv0.7解析JSONを読み込むか、「現在の解析を使用」を選びます。
2. コンテJSONを読み込みます。CUTを展開して参照ID、演出関係、動作を確認できます。
3. 基準がない初回のみ「初回の比較基準を保存」。これは現在の参照値を保存する明示的な操作です。過去の解析がなければ過去との差分は復元できません。
4. 新しい解析JSONを読み込むと、保存済み基準と比較します。解析・コンテ・基準を自動修正しません。
5. コンテと検証結果は別々にJSON出力できます。警告やエラーのあるコンテも原内容を保持して出力します。UIは先頭100件の指摘を表示し、検証結果JSONには全件を含みます。

旧 `mv_storyboard_references.v0.1` の例も読み込めます。旧フィールド、CUT番号、時刻、説明を保持し、新しい参照配列とCUT IDを追加します。新形式で保存後はそのIDを使い続けてください。全項目を編集するUIはありません。

## 互換性

- 解析の `schema: mv_music_analysis.v6.1`、保存名 `*_music_analysis_v6_1.json`、`reference_schema: mv_music_analysis.references.v0.7.0` は維持。
- フロントエンドのバージョンのみ0.7.1へ更新。解析にコンテを埋め込みません。
- コンテの新スキーマは `mv_storyboard.v0.7.1`。旧形式はインポート対応。旧コンテ読取側へ新形式を渡す場合はスキーマ対応が必要です。解析側の下流処理には変更不要です。
- [コンテ仕様](STORYBOARD_REFERENCE_v0.7.1.md)、[JSON Schema](storyboard_schema_v0_7_1.json)、[合成入力・出力例](sample_storyboard_v0_7_1.synthetic.json)。解析は既存の `sample_music_analysis_v7.synthetic.json` と組み合わせます。
- Service Workerはキャッシュv0.7.1へ更新し、追加JSとコンテスキーマを初期キャッシュします。

## 検証

`node --test tests/*.test.cjs`。追加テストは参照整合性、複数参照・演出関係、CUT番号変更、差分、手動補正、意図的な時間差・重複、欠損データ、JSON往復、旧形式移行を検証します。

`tests/validate-schema.py` はjsonschemaパッケージで旧解析・新解析・コンテの正式スキーマ検証を行います。`tests/browser-smoke.cjs` はPlaywrightとEdgeを使い、幅390pxのUI、JSON読み書き、不正JSON、オフラインPWA、合成WAVのデコードを確認します。環境指定方法はv0.7.0のREADMEも参照してください。

小規模合成例のcompact JSON: 解析80,604 bytes（変更なし）、コンテ6,435 bytes、うち比較基準1,811 bytes。検証100回平均約0.25ms（開発PC、2CUT）。スマートフォン実機・巨大コンテの性能保証ではありません。解析全体を複製せず、参照される値のみ基準へ保存し、同じIDの参照値は検証中に共有します。CUT詳細は展開時に描画します。多数の相互重複CUTでは指摘数も増えます。

作業環境に実際の「笑って蹴るわ」44CUTコンテZIPは見つからず、合成コンテのみで検証しました。実コンテ、実音源による精度、スマートフォン実機は未検証です。音声認識・forced alignment・コンテ自動生成は追加していません。
