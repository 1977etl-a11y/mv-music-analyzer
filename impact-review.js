/* Presentation of existing comparison findings only. No baseline or analyzer writes. */
(function(root){
  'use strict';
  const R=typeof module==='object'&&module.exports?require('./references.js'):root.MVReferences;
  const S=typeof module==='object'&&module.exports?require('./storyboard.js'):root.MVStoryboard;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const statuses={unreviewed:'未判断',reviewed:'確認済み',needs_revision:'要修正',no_change:'変更不要'};
  function build(comparison,board){
    const cuts=new Map(),authored=new Map((board?.cuts||[]).map((c,i)=>[c.id??c.cut??'position:'+(i+1),c]));
    for(const event of comparison.event_changes||[]){
      for(const affected of event.affected_cuts||[]){
        const key=affected.cut_id;
        if(!cuts.has(key))cuts.set(key,{cut_id:key,cut_number:affected.cut_number,status:'unreviewed',events:[]});
        const group=cuts.get(key),cut=authored.get(key);
        const fields=event.fields||[];
        const shifts=fields.filter(f=>/(^|\.)(start_sec|end_sec)$/.test(f.field)&&typeof f.before==='number'&&typeof f.after==='number').map(f=>({field:f.field,delta_sec:Math.round((f.after-f.before)*1e6)/1e6}));
        const item={event_id:event.reference_id,change:event.change,fields:copy(fields),time_shifts:shifts,
          review_candidates:shifts.length?['動作開始のタイミング','カメラ切り替えのタイミング','音響との同期・意図的な時間差']:['参照イベントと演出意図の対応','動作の強度・継続やカット切り替え'],
          authored_items:cut?copy({references:S.extractReferences(cut).references.filter(r=>r.target_id===event.reference_id),relations:(cut.relations||[]).filter(r=>(r.targets||[]).some(t=>t.type==='analysis'&&t.id===event.reference_id)),mappings:(cut.mappings||[]).filter(m=>(m.analysis_ids||[]).includes(event.reference_id)),actions:cut.actions||[],shot:cut.shot||{}}):null};
        if(!group.events.some(existing=>R.stableId('change',existing)===R.stableId('change',item)))group.events.push(item);
      }
    }
    const result={schema:'mv_impact_cut_review.v0.8.2',baseline_saved_at:comparison.saved_at,
      comparison:{analysis_status:comparison.analysis_status,compared_reference_count:comparison.compared_reference_count,value_compared_reference_count:comparison.value_compared_reference_count,identity_changes:copy(comparison.identity_changes||[]),unavailable_reference_count:(comparison.unavailable_references||[]).length,storyboard_metadata_issues:copy(comparison.storyboard_metadata_issues||[])},
      cuts:[...cuts.values()],policy:'確認候補は修正指示ではありません。statusは制作者の判断です。元コンテ・解析・比較基準は変更しません。'};
    result.review_id=R.stableId('review',result);return result;
  }
  function setStatus(review,cutId,status){
    if(!Object.prototype.hasOwnProperty.call(statuses,status))throw Error('未対応のレビュー状態です。');
    const cut=review.cuts.find(c=>c.cut_id===cutId);if(!cut)throw Error('レビュー対象CUTがありません。');cut.status=status;
  }
  const api={build,setStatus,statuses};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  root.MVImpactReview=api;
  const $=id=>document.getElementById(id),panel=$('impactReview'),summary=$('impactReviewSummary'),list=$('impactReviewList'),exportButton=$('impactReviewExport');
  let review=null;
  function invalidate(){panel.hidden=true;exportButton.disabled=true;root.MVRevisionUI?.setCurrentReview(null);}
  function node(tag,text){const el=document.createElement(tag);el.textContent=text;return el;}
  const changeNames={event_changed:'イベント値の変更',event_deleted:'参照イベントの消失',unresolved_reference:'参照先不明',reference_added:'参照の追加',reference_removed:'参照の解除'};
  function render(comparison,board){
    const next=build(comparison,board);
    if(review?.review_id===next.review_id)for(const c of next.cuts)c.status=review.cuts.find(old=>old.cut_id===c.cut_id)?.status||'unreviewed';
    review=next;list.replaceChildren();panel.hidden=false;exportButton.disabled=false;
    summary.textContent=`影響 ${review.cuts.length} CUT / 参照ID照合 ${comparison.compared_reference_count}件 / 値比較 ${comparison.value_compared_reference_count}件 — ${comparison.analysis_status}。候補は修正必須を意味しません。`;
    if(!review.cuts.length)list.append(node('p','変更イベントに紐づくCUTはありません。比較不可の情報は比較結果JSONで確認してください。'));
    for(const cut of review.cuts){
      const card=node('article','');card.className='impact-cut';card.append(node('h3',String(cut.cut_number)),node('small',String(cut.cut_id)));
      const label=node('label','レビュー判断 '),select=node('select','');select.setAttribute('aria-label',`${cut.cut_number} レビュー判断`);
      for(const [value,text] of Object.entries(statuses)){const option=node('option',text);option.value=value;select.append(option);}select.value=cut.status;select.addEventListener('change',()=>{setStatus(review,cut.cut_id,select.value);root.MVRevisionUI?.setCurrentReview(review);});label.append(select);card.append(label);
      for(const event of cut.events){
        const detail=node('div','');detail.className='impact-event';detail.append(node('h4',changeNames[event.change]||event.change),node('code',event.event_id));
        for(const field of event.fields){const before=field.before_present===false?'未取得':JSON.stringify(field.before),after=field.after_present===false?'未取得':JSON.stringify(field.after);detail.append(node('p',`${field.field}: ${before} → ${after}`));}
        for(const shift of event.time_shifts)detail.append(node('p',`${shift.field}の移動量: ${shift.delta_sec>=0?'+':''}${shift.delta_sec.toFixed(4)}秒`));
        detail.append(node('p','確認候補（任意）：'+event.review_candidates.join('／')));
        const authored=node('details','');authored.append(node('summary','参照している演出項目'),node('pre',JSON.stringify(event.authored_items,null,2)));detail.append(authored);card.append(detail);
      }
      list.append(card);
    }
    root.MVRevisionUI?.setCurrentReview(review);
  }
  exportButton.addEventListener('click',()=>{if(!review||exportButton.disabled)return;const url=URL.createObjectURL(new Blob([JSON.stringify(review,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mv_impact_cut_review_v0_8_2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  root.MVImpactReviewUI={render,invalidate};
})(globalThis);
