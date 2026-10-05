/* One immutable local baseline. Commit success is reported only after IDB completion. */
(()=>{
  const schema='mv_storyboard_baseline.v0.8.1';
  function check(record){
    if(![schema,'mv_storyboard_baseline.v0.7.1'].includes(record?.schema)||!record.board||!Array.isArray(record.board.cuts)||!record.board.cuts.length||!record.baseline?.references||!record.baseline?.analysis||!Number.isFinite(Date.parse(record.saved_at)))throw Error('比較基準JSONの形式が不正です。専用の書き出しファイルを指定してください。');
    MVStoryboard.importJSON(JSON.stringify(record.board));
    return record;
  }
  async function database(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('mv-storyboard-baseline',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('baselines');
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(Error('保存領域が他のタブで使用中です。'));
      request.onsuccess=()=>resolve(request.result);
    });
  }
  async function access(record,replaceExpected){
    const db=await database();
    return new Promise((resolve,reject)=>{
      let value;const tx=db.transaction('baselines',record?'readwrite':'readonly');
      // add, not put: concurrent tabs cannot overwrite the first baseline.
      const store=tx.objectStore('baselines');
      const request=store.get('active');
      request.onsuccess=()=>{
        const initial=store.get('initial');initial.onsuccess=()=>{
          value=request.result||initial.result||null;
          if(!record)return;
          if(replaceExpected){
            if(!value||MVReferences.stableId('baseline',value)!==replaceExpected){tx.abort();return;}
            store.add(value,'history:'+crypto.randomUUID());
            store.put(record,'active');
          }else if(value){tx.abort();}else store.add(record,'initial');
        };
      };
      tx.oncomplete=()=>{db.close();resolve(record||value||null);};
      tx.onabort=()=>{db.close();reject(tx.error||Error('比較基準の保存を完了できませんでした。'));};
      tx.onerror=()=>{};
    });
  }
  function create(board,analysis){
    if(!board)throw Error('コンテを読み込んでください。');
    if(!analysis?.unified_timeline?.references)throw Error('解析JSONを読み込んでください。');
    const baseline=MVStoryboard.captureBaseline(board,analysis).baseline;
    return check(JSON.parse(JSON.stringify({schema,snapshot_version:'1',saved_at:new Date().toISOString(),board,baseline})));
  }
  function differences(before,after,path=''){
    if(JSON.stringify(before)===JSON.stringify(after))return [];
    if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>differences(before[key],after[key],path?path+'.'+key:key));
    return [{field:path,before:before??null,after:after??null,before_present:before!==undefined,after_present:after!==undefined}];
  }
  function baselineValues(record){
    const stored=record.baseline.references,values={...stored},sources={},unavailable={};
    const archived=record.analysis;
    const present=!!archived?.unified_timeline?.references;
    const identityMatches=present&&record.baseline.analysis?.source_id&&MVReferences.stableId('identity',record.baseline.analysis)===MVReferences.stableId('identity',MVStoryboard.identity(archived));
    for(const id of MVStoryboard.targets(record.board)){
      if(stored[id]){sources[id]={origin:'baseline.references',saved_at:record.saved_at};continue;}
      if(!present){unavailable[id]='missing_snapshot_and_saved_analysis';continue;}
      if(!identityMatches){unavailable[id]='saved_analysis_identity_mismatch';continue;}
      const value=MVStoryboard.snapshot(archived,id);
      if(!value){unavailable[id]='reference_absent_from_saved_analysis';continue;}
      values[id]=value;sources[id]={origin:'analysis',pointer:archived.unified_timeline.references[id]?.pointer??'review_items',saved_at:record.saved_at};
    }
    return {values,sources,unavailable};
  }
  // Comparison-only fallback. Never writes IDs or saved records.
  function remapSrt(record,analysis,id,prior,compatible){
    const fail=reason=>({reason});
    if(!compatible)return fail('source_or_conditions_changed');
    const archived=record.analysis;
    if(!archived?.unified_timeline?.references)return fail('missing_saved_analysis_for_srt_remap');
    if(MVReferences.stableId('identity',record.baseline.analysis)!==MVReferences.stableId('identity',MVStoryboard.identity(archived)))return fail('saved_analysis_identity_mismatch');
    const old=MVStoryboard.resolve(archived,id);
    if(!old||old.kind!=='srt_cue'||!/^\/vocal_asr_timeline\/entries\/\d+$/.test(old.ref.pointer))return fail('invalid_saved_srt_pointer');
    if(differences(prior,MVStoryboard.snapshot(archived,id)).length)return fail('saved_srt_snapshot_conflict');
    const text=cue=>typeof cue.raw_text==='string'?cue.raw_text:typeof cue.text==='string'?cue.text:null;
    const index=old.value.cue_index,body=text(old.value);
    if(!Number.isInteger(index)||body===null)return fail('missing_saved_srt_identity');
    const candidates=Object.entries(analysis.unified_timeline.references).filter(([,ref])=>ref.kind==='srt_cue').map(([key])=>({id:key,found:MVStoryboard.resolve(analysis,key)})).filter(c=>c.found&&(c.found.ref.pointer===old.ref.pointer||c.found.value.cue_index===index));
    if(!candidates.length)return fail('srt_remap_candidate_missing');
    if(candidates.length!==1)return fail('srt_remap_ambiguous');
    const candidate=candidates[0],now=candidate.found;
    if(now.ref.pointer!==old.ref.pointer||now.value.cue_index!==index||text(now.value)!==body)return fail('srt_remap_identity_conflict');
    // Also detect duplicate/unindexed cues at the same cue index.
    if(!Array.isArray(analysis.vocal_asr_timeline?.entries)||analysis.vocal_asr_timeline.entries.filter(c=>c?.cue_index===index).length!==1||archived.vocal_asr_timeline.entries.filter(c=>c?.cue_index===index).length!==1)return fail('srt_remap_ambiguous');
    return {snapshot:MVStoryboard.snapshot(analysis,candidate.id),remap:{old_reference_id:id,new_reference_id:candidate.id,kind:'srt_cue',pointer:old.ref.pointer,cue_index:index,method:'saved_analysis_pointer_cue_index_exact_text'}};
  }
  function compare(record,board,analysis){
    if(!board||!analysis?.unified_timeline?.references)throw Error('現在の解析JSONとコンテを読み込んでください。保存基準だけでは現在の解析値を比較できません。');
    const stored=record.baseline.references,resolved=baselineValues(record),values=resolved.values;
    const originalTargets=MVStoryboard.targets(record.board),currentTargets=MVStoryboard.targets(board);
    const allTargets=new Set([...originalTargets,...currentTargets]);
    const identityChanges=differences(record.baseline.analysis,MVStoryboard.identity(analysis));
    const compatible=identityChanges.length===0;
    const report=MVStoryboard.validate({...board,baseline:{...record.baseline,references:values},analysis:record.baseline.analysis},analysis);
    // Keep full validation unchanged; separate only top-level metadata findings in comparison output.
    const metadataIssues=report.issues.filter(issue=>issue.code==='storyboard_metadata');
    const analysisReport={...report,issues:report.issues.filter(issue=>issue.code!=='storyboard_metadata')};
    const old=record.board.cuts,now=board.cuts,changes=[];
    const key=(c,i)=>c.id??c.cut??'position:'+(i+1);
    const before=new Map(old.map((c,i)=>[key(c,i),c])),after=new Map(now.map((c,i)=>[key(c,i),c]));
    for(const [id,c] of after){if(!before.has(id))changes.push({cut_id:id,cut_number:c.cut_number??c.cut??id,change:'added'});else if(MVReferences.stableId('cut',c)!==MVReferences.stableId('cut',before.get(id)))changes.push({cut_id:id,cut_number:c.cut_number??c.cut??id,change:'changed'});}
    for(const [id,c] of before)if(!after.has(id))changes.push({cut_id:id,cut_number:c.cut_number??c.cut??id,change:'removed'});
    const affectedIndex=new Map();
    for(const cuts of [old,now])cuts.forEach((c,i)=>{for(const id of MVStoryboard.targets({cuts:[c]})){
      if(!affectedIndex.has(id))affectedIndex.set(id,new Map());
      affectedIndex.get(id).set(key(c,i),{cut_id:key(c,i),cut_number:c.cut_number??c.cut??key(c,i)});
    }});
    const affected=id=>[...(affectedIndex.get(id)?.values()||[])];
    const eventChanges=[],unavailable=[],remaps=[];let valueCount=0;
    for(const id of allTargets){
      const prior=values[id],was=originalTargets.has(id),is=currentTargets.has(id);let current=MVStoryboard.snapshot(analysis,id);
      const entry={reference_id:id,affected_cuts:affected(id)};
      if(!was&&is)eventChanges.push({...entry,change:'reference_added'});
      if(was&&!is)eventChanges.push({...entry,change:'reference_removed'});
      let remapFailure=null;
      if(!current&&prior?.kind==='srt_cue'){const result=remapSrt(record,analysis,id,prior,compatible);if(result.snapshot){current=result.snapshot;entry.remap=result.remap;remaps.push(result.remap);}else remapFailure=result.reason;}
      if(!current){const change=prior?'event_deleted':'unresolved_reference';eventChanges.push({...entry,change});unavailable.push({...entry,reason:remapFailure??change});continue;}
      if(!was||!is)continue;
      if(!prior){unavailable.push({...entry,reason:resolved.unavailable[id]??'missing_snapshot'});continue;}
      if(!compatible){unavailable.push({...entry,reason:'source_or_conditions_changed'});continue;}
      valueCount++;
      const fields=differences(prior,current);
      if(fields.length)eventChanges.push({...entry,change:'event_changed',fields});
    }
    const status=!compatible?'解析値の比較不可：音源・解析条件が異なります':valueCount===0?'解析値の比較不可':unavailable.length?'一部比較不可':eventChanges.length?'比較済み・差分あり':'比較済み・差分0件';
    return {saved_at:record.saved_at,analysis_status:status,cut_status:changes.length?'CUT差分あり':'CUT比較済み・差分0件',compared_reference_count:allTargets.size,value_compared_reference_count:valueCount,stored_reference_count:Object.keys(stored).length,legacy_reference_count:Object.values(resolved.sources).filter(s=>s.origin==='analysis').length,baseline_value_sources:resolved.sources,cut_changes:changes,event_changes:eventChanges,unavailable_references:unavailable,unavailable_reference_count:unavailable.length,reference_remaps:remaps,identity_changes:identityChanges,analysis_comparison:analysisReport,storyboard_metadata_issues:metadataIssues,note:'参照IDの照合件数と実際の値比較件数は別です。旧形式の保存済み解析値は由来を明示して読み取ります。現在値による代用はしません。比較は読み取り専用です。'};
  }
  globalThis.MVStoryboardBaseline={check,create,compare,baselineValues,load:()=>access(),save:record=>access(check(record)),recreate:(record,expected)=>access(check(record),MVReferences.stableId('baseline',expected))};
})();
