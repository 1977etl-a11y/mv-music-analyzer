/* Independent author-owned storyboard references. Never modifies analysis data. */
(function(root){
  'use strict';
  const R=typeof module==='object'&&module.exports?require('./references.js'):root.MVReferences;
  const SCHEMA='mv_storyboard.v0.7.1', clone=x=>JSON.parse(JSON.stringify(x));
  const kinds=['audio_event','motion_window','lyric_line','srt_cue','section'];
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  function shape(b){
    if(!b||!Array.isArray(b.cuts)||b.cuts.some(c=>!c||typeof c!=='object'||['references','relations','mappings','actions','subjects','uncertainties'].some(k=>c[k]!==undefined&&!Array.isArray(c[k]))))throw Error('CUTと配列フィールドの形式を確認してください。');
    for(const c of b.cuts){
      for(const r of c.references||[])if(!r||typeof r.target_id!=='string')throw Error('参照target_idが必要です。');
      for(const r of c.relations||[])if(!r||!Array.isArray(r.targets)||r.targets.some(t=>!t||typeof t.id!=='string'))throw Error('演出関係targetsが不正です。');
      for(const m of c.mappings||[])if(!m||!Array.isArray(m.analysis_ids))throw Error('写像analysis_idsが不正です。');
    }
    for(const k of ['motifs','transitions'])if(b[k]!==undefined&&!Array.isArray(b[k]))throw Error(`${k}は配列です。`);
    for(const m of b.motifs||[])if(!m||!Array.isArray(m.occurrences)||m.occurrences.some(o=>!o))throw Error('モチーフoccurrencesが不正です。');
    if((b.transitions||[]).some(t=>!t))throw Error('境界設定が不正です。');
    return b;
  }
  function resolve(a,id){
    const ref=a?.unified_timeline?.references?.[id];
    if(!ref||typeof ref.pointer!=='string')return null;
    let value=a;
    for(const part of ref.pointer.split('/').slice(1)){
      const key=part.replace(/~1/g,'/').replace(/~0/g,'~');
      if(!value||!Object.prototype.hasOwnProperty.call(value,key))return null;
      value=value[key];
    }
    if(!value||value.id!==id)return null;
    return {ref,value,kind:ref.kind==='input_structure'&&value.kind==='SECTION'?'section':ref.kind};
  }
  function snapshot(a,id){
    const found=resolve(a,id);if(!found)return null;
    const {ref,value,kind}=found;
    const detail={};
    // Small values only; no audio_context, frame arrays, or edit-history duplication.
    for(const key of ['type','text','raw_text','kind','classification','primitives','metrics','numbers','scores','dominant','method','alignment_method','timing_status','manual_corrected','source','source_id'])
      if(value[key]!==undefined)detail[key]=value[key];
    return {kind,start_sec:ref.start_sec??null,end_sec:ref.end_sec??null,provenance:ref.provenance,confidence:value.confidence??null,detail:clone(detail)};
  }
  function identity(a){return {schema:a.schema,reference_schema:a.reference_schema,source_id:a.source?.id,duration_sec:a.source?.duration_sec,conditions:{essentia_js:a.engine?.essentia_js,audio_beat:a.engine?.audio_beat,analysis_sample_rate_hz:a.engine?.analysis_sample_rate_hz},reference_identity:a.reference_identity};}
  function importJSON(text){
    const b=JSON.parse(text);
    if(!b||!Array.isArray(b.cuts))throw Error('cuts配列が必要です。');
    if(b.schema===SCHEMA)return shape(b);
    if(b.schema!=='mv_storyboard_references.v0.1')throw Error('未対応のコンテスキーマです。');
    const id=R.stableId('storyboard',b);
    return {...b,schema:SCHEMA,legacy_schema:b.schema,id,title:b.title||'Imported storyboard',version:'1',analysis:{file:b.analysis_file,reference_schema:b.reference_schema,source_id:b.source_id},motifs:[],transitions:[],migration_notes:['旧フィールドを保持。初回に割り当てたCUT IDは保存後に再生成しない。未指定の演出は空欄。'],cuts:b.cuts.map((c,i)=>({...c,id:c.id||R.stableId('cut',{storyboard:id,original:c,duplicate:i}),subjects:[],shot:{},actions:[],mappings:[],uncertainties:[],review_status:'pending',references:[...Object.entries({audio_event_ids:'audio_event',motion_window_ids:'motion_window',lyric_line_ids:'lyric_line',srt_ids:'srt_cue',section_ids:'section'}).flatMap(([key,kind])=>(c[key]||[]).map(target_id=>({target_id,kind,purpose:'未指定',usage_status:'candidate'})))],relations:(c.relations||[]).map(r=>({...r,targets:[...['audio_event_id','lyric_line_id'].filter(k=>r[k]).map(k=>({type:'analysis',id:r[k]}))],decision_by:r.decision_by||'unspecified'}))}))};
  }
  function targets(b){const ids=new Set();for(const c of b.cuts){for(const r of c.references||[])ids.add(r.target_id);for(const rel of c.relations||[])for(const t of rel.targets||[])if(t.type==='analysis')ids.add(t.id);for(const m of c.mappings||[])for(const id of m.analysis_ids||[])ids.add(id);}return ids;}
  function captureBaseline(b,a){
    if(!a?.unified_timeline?.references)throw Error('v0.7の参照索引を持つ解析JSONが必要です。');
    const out=clone(b);out.analysis={...out.analysis,...identity(a)};
    out.baseline={analysis:identity(a),references:{}};
    for(const id of targets(b)){const s=snapshot(a,id);if(s)out.baseline.references[id]=s;}
    return out;
  }
  function validate(b,a){
    const issues=[];
    const add=(code,cut,ref,reason,intentional=false,severity='warning')=>issues.push({code,cut_id:cut?.id??null,reference_id:ref??null,severity:intentional?'intentional':severity,reason,recommended_check:'参照元JSONとCUTの時刻・演出意図を確認してください。'});
    if(b?.schema!==SCHEMA||!Array.isArray(b?.cuts))return {issues:[{code:'invalid_storyboard',severity:'error',reason:'コンテ形式が不正です。',cut_id:null,reference_id:null,recommended_check:'スキーマを確認してください。'}],affected_cut_ids:[]};
    try{shape(b);}catch(e){add('invalid_storyboard',null,null,e.message,false,'error');return {issues,affected_cut_ids:[]};}
    for(const key of ['id','title','version'])if(typeof b[key]!=='string'||!b[key])add('storyboard_metadata',null,null,`${key}が必要です。`,false,'error');
    const cutIds=new Set(),motifIds=new Set((b.motifs||[]).map(m=>m.id));
    for(const c of b.cuts){if(!c.id||cutIds.has(c.id))add('cut_id',c,null,'CUT IDが欠落または重複しています。',false,'error');cutIds.add(c.id);}
    const available=!!a?.unified_timeline?.references, duration=a?.source?.duration_sec;
    if(!available)add('missing_analysis',null,null,'解析の参照索引が未取得です。',false,'error');
    const baseline=b.baseline?.references||{};
    const cache=new Map();
    const changedSource=available&&b.analysis?.source_id&&b.analysis.source_id!==a.source?.id;
    const changedConditions=available&&b.baseline?.analysis&&R.stableId('identity',b.baseline.analysis)!==R.stableId('identity',identity(a));
    function checkTarget(c,id,kind){
      if(!available)return null;
      if(!cache.has(id))cache.set(id,snapshot(a,id));
      const current=cache.get(id);
      if(!current){add('missing_reference',c,id,'解析に参照先IDが存在しません。',false,'error');return null;}
      if(kind&&kind!==current.kind)add('reference_kind',c,id,'参照種類が一致しません。',false,'error');
      const prior=baseline[id];
      if(!prior)add('missing_baseline',c,id,'参照値の比較基準が未保存です。');
      else if(R.stableId('value',prior)!==R.stableId('value',current)){
        const fields=Object.keys(current).filter(k=>JSON.stringify(prior[k])!==JSON.stringify(current[k]));
        add('analysis_changed',c,id,`参照値変更: ${fields.join(', ')}。演出は変更していません。`);
      }
      return current;
    }
    for(const c of b.cuts){
      if(!finite(c.start_sec)||!finite(c.end_sec)||c.start_sec<0||c.end_sec<=c.start_sec)add('cut_time',c,null,'CUT時刻が不正です。',false,'error');
      if(finite(duration)&&c.end_sec>duration)add('outside_audio',c,null,'CUTが音源尺を超えています。',false,'error');
      if(changedSource||changedConditions)add('analysis_identity_changed',c,null,'解析元または解析条件が変わりました。');
      for(const r of c.references||[]){
        if(!kinds.includes(r.kind))add('reference_kind',c,r.target_id,'未対応の参照種類です。',false,'error');
        const s=checkTarget(c,r.target_id,r.kind);if(!s)continue;
        if(r.source_range&&(r.source_range.start_sec!==s.start_sec||r.source_range.end_sec!==s.end_sec))add(s.detail.manual_corrected?'stale_manual_time':'stale_reference_time',c,r.target_id,'保存した参照時刻が現在の解析と異なります。');
        if(r.usage_status==='confirmed'&&(typeof s.confidence!=='number'||s.confidence<.7))add('uncertain_confirmed',c,r.target_id,'数値信頼度が低い、または未定義の解析を確定扱いしています。');
        if(finite(s.start_sec)){
          const at=r.cut_time_sec??c.start_sec,delta=at-s.start_sec;
          const declared=r.timing?.offset_sec;
          const intentional=r.timing?.intentional===true&&typeof r.timing.explanation==='string'&&r.timing.explanation.trim().length>0&&finite(declared)&&Math.abs(delta-declared)<.001;
          if(Math.abs(delta)>.001)add('time_offset',c,r.target_id,`参照開始からCUT内使用時刻まで ${delta.toFixed(3)} 秒。`,intentional);
          if(declared!==undefined&&(!finite(declared)||Math.abs(delta-declared)>.001))add('offset_mismatch',c,r.target_id,'宣言した時間差と実際の時刻が一致しません。');
          if(!finite(at)||at<c.start_sec||at>c.end_sec)add('usage_time',c,r.target_id,'CUT内の使用時刻が範囲外です。',false,'error');
        }
      }
      for(const rel of c.relations||[]){
        if(![null,'一致','無視','反転','遅延'].includes(rel.relation))add('relation_type',c,null,'演出関係が不正です。',false,'error');
        if(rel.relation&&(!rel.explanation||!rel.decision_by||rel.decision_by==='analyzer'))add('author_decision',c,null,'演出者と判断の説明が必要です。');
        for(const t of rel.targets||[]){if(t.type==='analysis')checkTarget(c,t.id);else if(t.type==='cut'?!cutIds.has(t.id):t.type==='motif'?!motifIds.has(t.id):true)add('relation_target',c,t.id,'演出関係の参照先が存在しません。',false,'error');}
      }
      for(const m of c.mappings||[]){for(const id of m.analysis_ids||[])checkTarget(c,id);if(!m.decision_by||!m.explanation)add('mapping_author',c,null,'写像の演出者と説明が未指定です。');}
    }
    const ordered=b.cuts.filter(c=>finite(c.start_sec)&&finite(c.end_sec)).slice().sort((x,y)=>x.start_sec-y.start_sec);
    function boundary(left,right,type){const intent=(b.transitions||[]).find(t=>t.from_cut_id===left.id&&t.to_cut_id===right.id&&t.type===type&&t.intentional&&t.explanation);add(`cut_${type}`,right,left.id,type==='gap'?'CUT間に空白があります。':'CUT間に重複があります。',!!intent);}
    let furthest=null,active=[];
    for(const c of ordered){if(furthest&&c.start_sec>furthest.end_sec)boundary(furthest,c,'gap');active=active.filter(prior=>prior.end_sec>c.start_sec);for(const prior of active)boundary(prior,c,'overlap');active.push(c);if(!furthest||c.end_sec>furthest.end_sec)furthest=c;}
    for(const m of b.motifs||[])for(const o of m.occurrences||[])for(const id of [o.cut_id,o.previous_cut_id,o.next_cut_id].filter(Boolean))if(!cutIds.has(id))add('motif_cut',null,id,'モチーフの登場CUTが存在しません。',false,'error');
    for(const t of b.transitions||[])if(!cutIds.has(t.from_cut_id)||!cutIds.has(t.to_cut_id))add('transition_cut',null,null,'境界設定のCUTが存在しません。',false,'error');
    return {issues,affected_cut_ids:[...new Set(issues.filter(i=>i.cut_id&&i.severity!=='intentional').map(i=>i.cut_id))],policy:'Validation never changes author decisions or baseline.'};
  }
  const api={SCHEMA,importJSON,resolve,snapshot,identity,captureBaseline,validate};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.MVStoryboard=api;
})(typeof globalThis==='object'?globalThis:this);
