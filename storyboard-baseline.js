/* One immutable local baseline. Commit success is reported only after IDB completion. */
(()=>{
  const schema='mv_storyboard_baseline.v0.7.1';
  function check(record){
    if(record?.schema!==schema||!record.board||!Array.isArray(record.board.cuts)||!record.board.cuts.length||!record.baseline?.references||!record.baseline?.analysis||!record.analysis?.unified_timeline?.references||!Number.isFinite(Date.parse(record.saved_at)))throw Error('比較基準JSONの形式が不正です。専用の書き出しファイルを指定してください。');
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
  async function access(record){
    const db=await database();
    return new Promise((resolve,reject)=>{
      let value;const tx=db.transaction('baselines',record?'readwrite':'readonly');
      // add, not put: concurrent tabs cannot overwrite the first baseline.
      const request=record?tx.objectStore('baselines').add(record,'initial'):tx.objectStore('baselines').get('initial');
      request.onsuccess=()=>{value=request.result;};
      tx.oncomplete=()=>{db.close();resolve(record||value||null);};
      tx.onabort=()=>{db.close();reject(tx.error||Error('比較基準の保存を完了できませんでした。'));};
      tx.onerror=()=>{};
    });
  }
  function create(board,analysis){
    if(!board)throw Error('コンテを読み込んでください。');
    if(!analysis?.unified_timeline?.references)throw Error('解析JSONを読み込んでください。');
    const baseline=board.baseline||MVStoryboard.captureBaseline(board,analysis).baseline;
    return check(JSON.parse(JSON.stringify({schema,saved_at:new Date().toISOString(),board,analysis,baseline})));
  }
  function compare(record,board,analysis){
    if(!board||!analysis)throw Error('現在の解析とコンテを読み込んでください。');
    const stored=record.baseline.references,working={...stored},derived=[];
    const originalTargets=MVStoryboard.targets(record.board);
    const currentTargets=MVStoryboard.targets(board);
    // Recover only original references from the archived analysis, never from current data.
    const identityMatches=MVReferences.stableId('identity',record.baseline.analysis)===MVReferences.stableId('identity',MVStoryboard.identity(record.analysis));
    if(identityMatches)for(const id of originalTargets)if(!Object.prototype.hasOwnProperty.call(working,id)){
      const value=MVStoryboard.snapshot(record.analysis,id);if(value){working[id]=value;derived.push(id);}
    }
    const report=MVStoryboard.validate({...board,baseline:{...record.baseline,references:working},analysis:record.baseline.analysis},analysis);
    const compared=[...currentTargets].filter(id=>working[id]&&MVStoryboard.snapshot(analysis,id));
    const old=record.board.cuts,now=board.cuts,changes=[];
    const key=(c,i)=>c.id??c.cut??`position:${i+1}`;
    const before=new Map(old.map((c,i)=>[key(c,i),c]));
    const after=new Map(now.map((c,i)=>[key(c,i),c]));
    for(const [id,c] of after){if(!before.has(id))changes.push({cut_id:id,change:'added'});else if(MVReferences.stableId('cut',c)!==MVReferences.stableId('cut',before.get(id)))changes.push({cut_id:id,change:'changed'});}
    for(const id of before.keys())if(!after.has(id))changes.push({cut_id:id,change:'removed'});
    return {saved_at:record.saved_at,compared_reference_count:compared.length,stored_reference_count:Object.keys(stored).length,derived_reference_count:derived.length,derived_reference_ids:derived,baseline_derivation:derived.length?'保存時の解析JSONから一時取得。永続保存した基準は未変更。':'保存済み参照値を使用。取得できない参照はmissing_baselineで報告。',cut_changes:changes,analysis_comparison:report,note:'指摘0件は解析精度や永続保存の証明ではありません。参照0件の場合、解析イベントの値比較はできません。CUT IDがない場合はcutまたは位置で比較します。'};
  }
  globalThis.MVStoryboardBaseline={check,create,compare,load:()=>access(),save:record=>access(check(record))};
})();
