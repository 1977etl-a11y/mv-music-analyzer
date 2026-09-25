/* Saved analyses and storyboards stay separate from the analyzer result. */
(()=>{
  const $=id=>document.getElementById(id);let board=null,analysis=null;
  const status=$('storyboardStatus'),output=$('storyboardOutput');
  function show(){
    output.replaceChildren();if(!board)return;
    const report=MVStoryboard.validate(board,analysis);
    status.textContent=`${board.title} / ${board.cuts.length} CUT / 要確認 ${report.affected_cut_ids.length} CUT / 指摘 ${report.issues.length}件`;
    const summary=document.createElement('pre');summary.style.whiteSpace='pre-wrap';summary.textContent=JSON.stringify({...report,issues:report.issues.slice(0,100),display_note:'指摘は先頭100件を表示。全件は検証結果JSONへ書き出せます。'},null,2);output.append(summary);
    const motifs=document.createElement('details'),label=document.createElement('summary'),body=document.createElement('pre');label.textContent='モチーフ連鎖・境界の意図・コンテ情報';body.style.whiteSpace='pre-wrap';motifs.addEventListener('toggle',()=>{if(motifs.open)body.textContent=JSON.stringify({id:board.id,version:board.version,analysis:board.analysis,motifs:board.motifs,transitions:board.transitions},null,2);});motifs.append(label,body);output.append(motifs);
    // Collapsed text safely displays author data without interpreting HTML.
    for(const cut of board.cuts){const d=document.createElement('details'),s=document.createElement('summary'),p=document.createElement('pre');s.textContent=`${cut.cut_number} (${cut.id}) ${cut.start_sec}–${cut.end_sec}s`;p.style.whiteSpace='pre-wrap';d.addEventListener('toggle',()=>{if(d.open&&!p.textContent)p.textContent=JSON.stringify({cut,current_analysis_references:(cut.references||[]).map(r=>({id:r.target_id,value:MVStoryboard.snapshot(analysis,r.target_id)}))},null,2);});d.append(s,p);output.append(d);}
  }
  async function load(event,type){try{const file=event.target.files[0];if(!file)return;const text=await file.text();if(type==='board')board=MVStoryboard.importJSON(text);else {const candidate=JSON.parse(text);if(!candidate.unified_timeline?.references)throw Error('v0.7参照索引がありません。');analysis=candidate;}show();if(!board)status.textContent='解析JSONを読み込みました。';}catch(e){status.textContent=`読込失敗: ${e.message}`;}finally{event.target.value='';}}
  $('storyboardFile').addEventListener('change',e=>load(e,'board'));
  $('storyboardAnalysisFile').addEventListener('change',e=>load(e,'analysis'));
  $('storyboardCurrent').addEventListener('click',()=>{if(!analysisResult){status.textContent='先に解析を実行してください。';return;}analysis=analysisResult;show();});
  $('storyboardValidate').addEventListener('click',()=>{try{show();}catch(e){status.textContent=`検証失敗: ${e.message}`;}});
  $('storyboardBaseline').addEventListener('click',()=>{try{if(!board)throw Error('コンテを読み込んでください。');if(board.baseline)throw Error('既存の比較基準は保持します。基準の更新はコンテJSONを別名保存して明示的に行ってください。');board=MVStoryboard.captureBaseline(board,analysis);show();}catch(e){status.textContent=e.message;}});
  $('storyboardExport').addEventListener('click',()=>{if(!board)return;show();const url=URL.createObjectURL(new Blob([JSON.stringify(board,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mv_storyboard_v0_7_1.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('storyboardReport').addEventListener('click',()=>{if(!board)return;const url=URL.createObjectURL(new Blob([JSON.stringify(MVStoryboard.validate(board,analysis),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mv_storyboard_validation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
})();
