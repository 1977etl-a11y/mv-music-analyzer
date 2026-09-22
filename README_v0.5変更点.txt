MV Music Analyzer PWA v0.5 変更点

・v0.4のOriginal + 任意Stem解析を維持。
・映像物理マッピング設計 v0.1 に基づく motion_primitives 層を追加。
・9プリミティブ: ACCENT / SUSTAIN / TRAJECTORY / PERIODICITY / ACCUMULATION / TRANSITION / RELEASE / TEXTURE / FORCE。
・基本窓は4 beats（BPM不明時4秒）。各窓にstrength / confidence / evidenceを保持。
・compact_timelineを追加し、後段の意味変質型MVプロトコルへ渡す情報量を圧縮。
・具体的なBODY / OBJECT / CAMERA / LIGHT / SPACE / EDITは解析側で決定しない。
・RELEASEは転調単独で判定しない。直前ACCUMULATION + TRANSITION/低下を複合。
・TRAJECTORYは現版ではpitch contour未実装。帯域比率傾向を弱い代理値として出し、limitationを明記。
・TEXTUREは材質名を確定せずdominant_band等を出力。
・出力schema: mv_music_analysis.v5 / ファイル名 *_music_analysis_v5.json。

注意: v0.5のconfidenceは学習済み分類器の確率ではなく、ヒューリスティック強度に基づく候補値です。
