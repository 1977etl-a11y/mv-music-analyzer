/* Read-only handoff: selects author decisions, never authors a revision. */
(function(root){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const statuses=['unreviewed','reviewed','needs_revision','no_change'];
  function checkReview(review){
    if(review?.schema!=='mv_impact_cut_review.v0.8.2'||!Array.isArray(review.cuts))throw Error('mv_impact_cut_review.v0.8.2のレビューJSONが必要です。');
    review.cuts.forEach((cut,i)=>{
      if(!cut||!['string','number'].includes(typeof cut.cut_id)||cut.cut_id===''||!statuses.includes(cut.status??'unreviewed')||!Array.isArray(cut.events))throw Error(`レビューCUT ${i+1}: cut_id・status・eventsを確認してください。`);
    });return review;
  }
  function build(review,board){
    checkReview(review);
    const source=Array.isArray(board)?board:board?.cuts;
    if(!Array.isArray(source))throw Error('元コンテJSONを読み込んでください。');
    const originals=new Map(),groups=new Map(),targets=[],errors=[];
    for(const cut of source){if(!cut||typeof cut!=='object'||Array.isArray(cut))continue;const id=cut.id??cut.cut;if(id===undefined)continue;if(!originals.has(id))originals.set(id,[]);originals.get(id).push(cut);}
    for(const cut of review.cuts){if(!groups.has(cut.cut_id))groups.set(cut.cut_id,[]);groups.get(cut.cut_id).push(cut);}
    for(const [id,entries] of groups){
      if(!entries.some(entry=>entry.status==='needs_revision'))continue;
      if(entries.some(entry=>entry.status!=='needs_revision')){errors.push({cut_id:id,code:'conflicting_review_status',reason:'同じCUTに異なるレビュー判断があります。代用・自動選択はしません。'});continue;}
      const matches=originals.get(id)||[];
      if(matches.length!==1){errors.push({cut_id:id,code:matches.length?'ambiguous_cut_id':'missing_cut',reason:matches.length?'元コンテ内のCUT IDが重複しています。':'元コンテに一致するCUT IDがありません。CUT番号や位置で代用しません。'});continue;}
      targets.push({cut_id:id,cut_number:matches[0].cut_number??matches[0].cut??entries[0].cut_number??null,original_cut:clone(matches[0]),review_status:'needs_revision',review_entries:clone(entries)});
    }
    return {schema:'mv_storyboard_revision_handoff.v0.8.3',version:'0.8.3',source_review:{schema:review.schema,review_id:review.review_id??null},baseline_saved_at:review.baseline_saved_at??null,source_storyboard:{id:board?.id??null,title:board?.title??null,version:board?.version??null,cut_count:source.length},comparison:clone(review.comparison??{}),target_count:targets.length,targets,errors,policy:'要修正と判断されたCUTと根拠のみ。original_cutは元データの複製であり、改稿案や修正後の時刻ではありません。'};
  }
  const api={checkReview,build};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  root.MVRevisionExport=api;
  const $=id=>document.getElementById(id),summary=$('revisionSummary'),issues=$('revisionErrors'),exportButton=$('revisionExport');
  let board=null,review=null,currentReview=null,origin=null,output=null;
  function refresh(){
    output=null;root.MVProposalUI?.setHandoff(null);exportButton.disabled=true;issues.replaceChildren();
    if(!review){summary.textContent='画面のレビューを使用するか、v0.8.2のレビューJSONを読み込んでください。';return;}
    try{
      output=build(review,board);summary.textContent=`改稿対象 ${output.target_count} CUT / ${origin==='imported'?'読み込んだレビューJSON':'画面のレビュー'} / エラー ${output.errors.length}件`;
      for(const error of output.errors){const p=document.createElement('p');p.textContent=`${error.cut_id}: ${error.reason}`;issues.append(p);}
      exportButton.disabled=output.errors.length>0;root.MVProposalUI?.setHandoff(output.errors.length?null:output);
    }catch(e){summary.textContent=e.message;}
  }
  function setBoard(value){board=value;root.MVApplyUI?.setBoard(value);root.MVProposalUI?.setBoard(value);refresh();}
  function setCurrentReview(value){currentReview=value;if(origin!=='imported'){review=value;origin='current';refresh();}}
  $('revisionUseCurrent').addEventListener('click',()=>{review=currentReview;origin='current';refresh();});
  $('revisionReviewFile').addEventListener('change',async event=>{
    try{const file=event.target.files[0];if(!file)return;exportButton.disabled=true;const parsed=checkReview(JSON.parse(await file.text()));review=parsed;origin='imported';refresh();}
    catch(e){review=null;origin=null;output=null;issues.replaceChildren();exportButton.disabled=true;summary.textContent=`レビュー読込失敗: ${e.message}`;}finally{event.target.value='';}
  });
  exportButton.addEventListener('click',()=>{if(!output||exportButton.disabled)return;const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mv_storyboard_revision_handoff_v0_8_3.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  root.MVRevisionUI={setBoard,setCurrentReview};
})(globalThis);
