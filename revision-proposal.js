/* Author-edited proposals. Never applies audio deltas or writes source documents. */
(function(root){
  'use strict';
  const R=typeof module==='object'&&module.exports?require('./references.js'):root.MVReferences;
  const I=typeof module==='object'&&module.exports?require('./cut-identity'):root.MVCutIdentity;
  const clone=x=>JSON.parse(JSON.stringify(x));
  const decisions={unreviewed:'未判断',keep_original:'元コンテを維持',adopt_proposal:'改稿案を採用',reconsider:'再検討'};
  const topics={timing:'時刻・CUT境界',actions:'動作の連続性',subjects:'人物・被写体',props:'小道具',wardrobe:'衣装',camera:'カメラ方向'};
  const key=c=>c?.id??c?.cut;
  function check(h){
    if(h?.schema!=='mv_storyboard_revision_handoff.v0.8.3'||!Array.isArray(h.targets)||h.target_count!==h.targets.length)throw Error('v0.8.3改稿用JSONのschema・targets・target_countを確認してください。');
    if(h.errors?.length)throw Error('改稿用JSONに未解決のエラーがあります。元データを確認してください。');
    const ids=new Set();
    for(const t of h.targets){if(!t||!['string','number'].includes(typeof t.cut_id)||ids.has(t.cut_id)||!t.original_cut||typeof t.original_cut!=='object'||Array.isArray(t.original_cut)||!Array.isArray(t.review_entries))throw Error('改稿対象のID・original_cut・review_entriesが不正または重複しています。');ids.add(t.cut_id);}
    return h;
  }
  function neighbors(item,board){return I.neighbors(item,board);}
  function timing(item){
    const values=c=>({start:c?.start_sec??c?.start,end:c?.end_sec??c?.end});
    const draft=values(item.draft_cut),findings=[];
    if(typeof draft.start!=='number'||typeof draft.end!=='number'||!Number.isFinite(draft.start)||!Number.isFinite(draft.end))findings.push({status:'unconfirmed',reason:'開始・終了が数値として取得できません。'});
    else if(draft.start<0||draft.end<=draft.start)findings.push({status:'inconsistent',reason:'開始・終了時刻が不正です。',start_sec:draft.start,end_sec:draft.end});
    for(const side of ['previous','next']){
      const neighbor=values(item.continuity.neighbors[side].original_cut),a=side==='previous'?neighbor.end:draft.end,b=side==='previous'?draft.start:neighbor.start;
      if(typeof a!=='number'||typeof b!=='number')findings.push({side,status:'unconfirmed',reason:'境界の時刻情報が不足しています。'});
      else {const delta=Math.round((b-a)*1e6)/1e6;findings.push({side,status:delta===0?'observed_equal':'needs_check',gap_sec:delta,reason:delta===0?'境界時刻のみ一致。動作等の整合は未確認です。':delta>0?'空白があります。意図的か確認してください。':'重複があります。意図的か確認してください。'});}
    }
    return findings;
  }
  function create(h,board){
    check(h);
    const result={schema:'mv_storyboard_revision_proposal.v0.8.4',version:'0.8.4',source_handoff:{schema:h.schema,version:h.version??null,id:h.id??null,content_fingerprint:R.stableId('handoff',h),source_review:clone(h.source_review??{}),source_storyboard:clone(h.source_storyboard??{})},baseline_saved_at:h.baseline_saved_at??null,target_count:h.targets.length,targets:h.targets.map(t=>({cut_id:t.cut_id,cut_number:t.cut_number??null,original_cut:clone(t.original_cut),draft_cut:clone(t.original_cut),review_entries:clone(t.review_entries),draft_changes:[],decision:'unreviewed',revision_summary:'',reason:'',unconfirmed_notes:'',continuity:{neighbors:null,timing_findings:[],author_checks:Object.fromEntries(Object.keys(topics).map(topic=>[topic,{status:'unconfirmed',note:''}]))}})),policy:'original_cutは入力の未改変コピー。draft_cutは制作者の編集用。解析差分を自動適用せず、採用判断でも元コンテを上書きしません。'};
    for(const item of result.targets){item.continuity.neighbors=neighbors(item,board);item.continuity.timing_findings=timing(item);}return result;
  }
  function changes(before,after,path=[]){
    if(JSON.stringify(before)===JSON.stringify(after))return [];
    if(before&&after&&typeof before==='object'&&typeof after==='object')return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>changes(before[key],after[key],path.concat(key)));
    return [{path,before:before??null,after:after??null}];
  }
  function restore(value){
    if(value?.schema!=='mv_storyboard_revision_proposal.v0.8.4'||!Array.isArray(value.targets)||value.target_count!==value.targets.length)throw Error('v0.8.4改稿案JSONのschema・targets・target_countを確認してください。');
    const result=clone(value),ids=new Set();
    for(const item of result.targets){
      if(!item||!['string','number'].includes(typeof item.cut_id)||item.cut_id===''||ids.has(String(item.cut_id))||!item.original_cut||typeof item.original_cut!=='object'||Array.isArray(item.original_cut)||!item.draft_cut||typeof item.draft_cut!=='object'||Array.isArray(item.draft_cut)||!Array.isArray(item.review_entries)||!Array.isArray(item.draft_changes))throw Error('対象CUTの識別子・元CUT・改稿案・根拠・変更一覧が不正または重複しています。');
      ids.add(String(item.cut_id));
      if(!Object.hasOwn(decisions,item.decision??'unreviewed'))throw Error('改稿案の判断が不正です。');item.decision??='unreviewed';
      for(const name of ['revision_summary','reason','unconfirmed_notes'])if(typeof item[name]!=='string'){if(item[name]!=null)throw Error(name+'は文字列である必要があります。');item[name]='';}
      const c=item.continuity&&typeof item.continuity==='object'&&!Array.isArray(item.continuity)?item.continuity:{};
      const saved=c.author_checks&&typeof c.author_checks==='object'&&!Array.isArray(c.author_checks)?c.author_checks:{};
      c.author_checks={...saved};const missing=[];
      for(const topic of Object.keys(topics)){const v=saved[topic];const valid=v&&['unconfirmed','consistent','inconsistent'].includes(v.status);c.author_checks[topic]={...(v&&typeof v==='object'?v:{}),status:valid?v.status:'unconfirmed',note:typeof v?.note==='string'?v.note:''};if(!valid)missing.push(topics[topic]);}
      const fallback=neighbors(item,null);c.neighbors=c.neighbors&&typeof c.neighbors==='object'&&!Array.isArray(c.neighbors)?c.neighbors:{};
      for(const side of ['previous','next'])if(!c.neighbors[side]||typeof c.neighbors[side]!=='object'||Array.isArray(c.neighbors[side])||!Object.hasOwn(c.neighbors[side],'original_cut')){c.neighbors[side]=fallback[side];for(const entry of Object.values(c.author_checks))entry.status='unconfirmed';missing.push(side==='previous'?'前CUT情報':'後CUT情報');}
      item.continuity=c;c.timing_findings=timing(item);
      if(missing.length)item.restoration_notice='復元できない項目は未確認です: '+missing.join('、');
    }
    return result;
  }
  function edit(item,path,value){
    if(!Array.isArray(path)||!path.length)throw Error('編集項目が不正です。');
    let parent=item.draft_cut;
    for(const part of path.slice(0,-1)){if(!parent||!Object.prototype.hasOwnProperty.call(parent,part))throw Error('編集項目がありません。');parent=parent[part];}
    const field=path[path.length-1];if(!parent||!Object.prototype.hasOwnProperty.call(parent,field)||['__proto__','constructor','prototype'].includes(String(field)))throw Error('編集項目が不正です。');
    if(JSON.stringify(parent[field])===JSON.stringify(value))return;
    item.confirmation_notice='改稿案の値を変更したため、整合確認を未確認へ戻しました。確認メモは保持しています。';
    parent[field]=value;item.draft_changes=changes(item.original_cut,item.draft_cut);item.continuity.timing_findings=timing(item);for(const check of Object.values(item.continuity.author_checks))check.status='unconfirmed';
  }
  const api={create,restore,edit,check,neighbors,timing,changes,decisions,topics};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  root.MVRevisionProposal=api;
  const $=id=>document.getElementById(id),content=$('proposalEditor'),status=$('proposalStatus'),picker=$('proposalCut'),exportButton=$('proposalExport');
  let proposal=null,board=null,handoff=null,available=null,selected=0;
  const labels={start_sec:'開始時刻（秒）',end_sec:'終了時刻（秒）',start:'開始',end:'終了',cut_number:'CUT番号',shot:'ショット',composition:'構図',subjects:'被写体',actions:'動作',action:'動作',camera:'カメラ',camera_direction:'カメラ方向',initial_state:'開始状態',final_state:'終了状態',props:'小道具',wardrobe:'衣装'};
  const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  function leaves(value,path=[],out=[]){
    if(value!==null&&typeof value==='object'){for(const [key,v] of Object.entries(value))leaves(v,path.concat(key),out);}
    else out.push({path,value});return out;
  }
  function view(value){const dl=node('dl','');for(const leaf of leaves(value)){dl.append(node('dt',leaf.path.map(k=>labels[k]||k).join(' / ')),node('dd',leaf.value===null?'未記載':String(leaf.value)));}if(!dl.childNodes.length)dl.append(node('dd','未記載'));return dl;}
  function field(label,value,onChange){const wrap=node('label',label),input=node('textarea','');input.value=value;input.rows=2;input.addEventListener('input',()=>onChange(input.value));wrap.append(input);return wrap;}
  function continuity(item,container){
    container.replaceChildren();
    for(const side of ['previous','next']){const n=item.continuity.neighbors[side],d=node('details','');d.append(node('summary',(side==='previous'?'前CUT':'後CUT')+'：'+(n.original_cut?.cut_number??n.original_cut?.cut??'未取得')),node('p',`${n.basis==='source_storyboard_order'?'元コンテの配列順（接続意図は未確認）。':''}${n.reason}`));if(n.original_cut){d.append(view(n.original_cut));const pending=proposal?.targets.find(t=>I.tokens(t.original_cut).some(id=>I.tokens(n.original_cut).includes(id)));if(pending?.draft_changes.length)d.append(node('h4','隣接CUTの登録済み改稿案（未適用）'),view(pending.draft_cut));}container.append(d);}
    for(const f of item.continuity.timing_findings)container.append(node('p',`${f.status==='inconsistent'?'不整合':f.status==='unconfirmed'?'未確認':'確認情報'}：${f.reason}${f.gap_sec===undefined?'':` (${f.gap_sec}秒)`}`));
  }
  function promotionPanel(item){
    const F=root.MVRevisionFields,panel=node('section','');panel.id='proposalPromotions';panel.append(node('h3','コンテ本体へ反映する変更'),node('p','補足・確認メモは判断記録です。ここでフィールドと改訂値を選び、登録した値だけがdraft_changesへ入ります。未登録の入力は書き出されません。'));
    const sourceBoard=()=>board??root.MVApplyUI?.getBoard?.();
    function refresh(id,message){selected=proposal.targets.findIndex(t=>t.cut_id===id);picker.replaceChildren();proposal.targets.forEach((t,i)=>{const o=node('option',String(t.cut_number??t.cut_id));o.value=i;picker.append(o);});picker.value=selected;render();status.textContent=message;root.MVApplyUI?.editorChanged(proposal);}
    function controls(host,value,neighborSide=null){
      const fields=F.fields(value),select=node('select',''),label=node('label','反映するフィールド');select.dataset.promotionField=neighborSide??'current';for(const f of fields){const o=node('option',f.path.join(' / '));o.value=JSON.stringify(f.path);select.append(o);}const primary=fields.find(f=>f.path.join('.')==='action')??fields[0];if(primary)select.value=JSON.stringify(primary.path);label.append(select);host.append(label);const values=node('div','');host.append(values);
      function show(){values.replaceChildren();if(!fields.length){values.append(node('p','変更可能な既存フィールドがありません。'));return;}const f=fields.find(x=>JSON.stringify(x.path)===select.value),original=f.path.reduce((v,k)=>v?.[k],value.original_cut),input=node(typeof f.value==='boolean'?'select':typeof f.value==='number'?'input':'textarea','');if(typeof f.value==='boolean')for(const v of ['true','false']){const o=node('option',v);o.value=v;input.append(o);}if(typeof f.value==='number'){input.type='number';input.step='any';}if(input.tagName==='TEXTAREA')input.rows=4;input.value=String(f.value);input.dataset.promotionValue=neighborSide??'current';values.append(node('p','現在値（元コンテ）: '+String(original)));const wrap=node('label','改訂値（登録するまで未反映）');wrap.append(input);values.append(wrap);const button=node('button',neighborSide?'CUT '+value.cut_id+'へ反映（draft_changesへ登録）':'選択フィールドをdraft_changesへ登録');button.type='button';button.dataset.promote=neighborSide??'current';button.addEventListener('click',()=>{try{if(typeof f.value==='number'&&!input.value.trim())throw Error('数値を入力してください。');const next=typeof f.value==='number'?Number(input.value):typeof f.value==='boolean'?input.value==='true':input.value;const result=neighborSide?F.promoteNeighbor(proposal,item.cut_id,neighborSide,sourceBoard(),f.path,next):F.promote(proposal,item.cut_id,f.path,next);if(result.changed)refresh(result.cut_id,'変更を登録しました。対象CUTの採否判断と6項目の整合確認を行ってください。最終承認までは適用しません。');else status.textContent='登録済みの値と同じです。新しい変更は追加していません。';}catch(e){status.textContent=e.message;}});values.append(button);}
      select.addEventListener('change',show);show();
    }
    controls(panel,item);const adjacent=node('details','');adjacent.id='proposalNeighborPromotions';adjacent.append(node('summary','隣接CUTへの変更候補'),node('p','元の記載値を提示します。補足の自動解釈・転記はしません。別CUTへの登録後は、そのCUTも採否判断・確認が必要です。'));
    for(const side of ['previous','next']){const section=node('section','');try{const value=F.neighborCandidate(proposal,item.cut_id,side,sourceBoard());section.append(node('h4',(side==='previous'?'前CUT ':'後CUT ')+value.cut_id));controls(section,value,side);}catch(e){section.append(node('p',(side==='previous'?'前CUT: ':'後CUT: ')+e.message));}adjacent.append(section);}panel.append(adjacent);return panel;
  }
  function render(){
    content.replaceChildren();if(!proposal)return;
    status.textContent=proposal.target_count?`改稿対象 ${proposal.target_count} CUT。変更は編集用データにのみ反映します。`:'改稿対象なし';exportButton.disabled=false;picker.hidden=!proposal.target_count;
    if(!proposal.target_count)return;
    const item=proposal.targets[selected],original=node('details','');original.append(node('summary','元コンテ（変更しません）'),view(item.original_cut));content.append(node('h3',String(item.cut_number??item.cut_id)),original);for(const message of [item.restoration_notice,item.confirmation_notice].filter(Boolean))content.append(node('p',message));
    const evidence=node('details','');evidence.open=true;evidence.append(node('summary','解析イベントの変更根拠'));
    for(const entry of item.review_entries)for(const event of entry.events||[]){evidence.append(node('code',event.event_id));for(const f of event.fields||[])evidence.append(node('p',`${f.field}: ${JSON.stringify(f.before)} → ${JSON.stringify(f.after)}`));for(const shift of event.time_shifts||[])evidence.append(node('p',`移動量 ${shift.field}: ${shift.delta_sec>=0?'+':''}${shift.delta_sec}秒（自動適用しません）`));}content.append(evidence);
    const decision=node('label','制作者の判断'),select=node('select','');select.id='proposalDecision';for(const [key,label] of Object.entries(decisions)){const option=node('option',label);option.value=key;select.append(option);}select.value=item.decision;select.addEventListener('change',()=>{item.decision=select.value;});decision.append(select);content.append(decision);
    const continuityBox=node('div',''),diffBox=node('div','');const showDiff=()=>{diffBox.replaceChildren(node('h4','元コンテとの編集差分'));if(!item.draft_changes.length)diffBox.append(node('p','編集差分なし'));for(const f of item.draft_changes)diffBox.append(node('p',f.path.join(' / ')+': '+JSON.stringify(f.before)+' → '+JSON.stringify(f.after)));};showDiff();
    const editor=node('details','');editor.id='proposalDraftFields';const locked=node('details','');locked.append(node('summary','識別ID・参照情報（編集対象外）'));editor.open=true;editor.append(node('summary','既存フィールドを直接編集（入力を差分へ登録）'));
    for(const leaf of leaves(item.draft_cut)){
      const path=leaf.path,label=path.map(k=>labels[k]||k).join(' / ');
      // Identity and analysis reference identifiers remain visible but read-only.
      if(path.some(k=>['id','cut','references','lyric_refs','srt_refs','motion_refs','audio_event_refs','review_refs'].includes(k)||k.endsWith('_id')||k.endsWith('_ids'))){locked.append(node('p',label+': '+String(leaf.value)));continue;}
      const wrap=node('label',label);let input;
      if(typeof leaf.value==='boolean'){input=node('input','');input.type='checkbox';input.checked=leaf.value;}
      else {input=node(typeof leaf.value==='number'?'input':'textarea','');if(typeof leaf.value==='number'){input.type='number';input.step='any';}else input.rows=2;input.value=leaf.value??'';}
      input.dataset.path=path.join('.');input.addEventListener('input',()=>{let value=typeof leaf.value==='boolean'?input.checked:typeof leaf.value==='number'?Number(input.value):input.value;
        if(typeof leaf.value==='number'&&(input.value.trim()===''||!Number.isFinite(value))){input.setCustomValidity('数値を入力してください。');exportButton.disabled=true;return;}input.setCustomValidity('');const previous=path.reduce((v,k)=>v[k],item.draft_cut);edit(item,path,value);if(previous!==value)root.MVRevisionFields.invalidateNeighbors(proposal,item);status.textContent=item.confirmation_notice||status.textContent;showDiff();continuity(item,continuityBox);content.querySelectorAll('[data-check-topic]').forEach(el=>{el.value=item.continuity.author_checks[el.dataset.checkTopic].status;});exportButton.disabled=!!content.querySelector(':invalid');});wrap.append(input);editor.append(wrap);
    }editor.append(locked);content.append(promotionPanel(item),editor,diffBox);
    const summaryField=field('改稿内容・補足',item.revision_summary,v=>{item.revision_summary=v;});summaryField.querySelector('textarea').id='proposalSummary';content.append(summaryField);
    const reasonField=field('改稿理由／維持する理由',item.reason,v=>{item.reason=v;});reasonField.querySelector('textarea').id='proposalReason';content.append(reasonField);
    const heading=node('h3','前後CUTとの整合確認');heading.id='proposalChecksHeading';heading.tabIndex=-1;content.append(heading,continuityBox);continuity(item,continuityBox);
    for(const [topic,label] of Object.entries(topics)){const row=node('label',label+'（制作者による確認）'),sel=node('select','');for(const [value,text] of Object.entries({unconfirmed:'未確認',consistent:'整合を確認',inconsistent:'不整合'})){const opt=node('option',text);opt.value=value;sel.append(opt);}sel.dataset.checkTopic=topic;sel.value=item.continuity.author_checks[topic].status;sel.addEventListener('change',()=>{item.continuity.author_checks[topic].status=sel.value;});row.append(sel);content.append(row,field(label+'の確認メモ',item.continuity.author_checks[topic].note,v=>{item.continuity.author_checks[topic].note=v;}));}
    const pending=field('未確認事項',item.unconfirmed_notes,v=>{item.unconfirmed_notes=v;});pending.querySelector('textarea').id='proposalUnconfirmed';content.append(pending);
  }
  function install(candidate,cutId){if(proposal&&JSON.stringify(proposal)!==JSON.stringify(candidate)&&!confirm('編集中の改稿案を切り替えます。未保存の編集は失われます。続行しますか？'))return false;proposal=candidate;selected=Math.max(0,proposal.targets.findIndex(t=>t.cut_id===cutId));picker.replaceChildren();proposal.targets.forEach((item,i)=>{const option=node('option',String(item.cut_number??item.cut_id));option.value=i;picker.append(option);});picker.value=selected;render();root.MVApplyUI?.editorChanged(candidate);return true;}
  function open(value){return install(create(value,board));}
  picker.addEventListener('change',()=>{if(content.querySelector(':invalid')){picker.value=selected;status.textContent='不正な数値入力を直してからCUTを切り替えてください。';return;}selected=Number(picker.value);render();});
  $('proposalFile').addEventListener('change',async event=>{try{const file=event.target.files[0];if(file)open(JSON.parse(await file.text()));}catch(e){status.textContent=`読込失敗: ${e.message}`;}finally{event.target.value='';}});
  $('proposalUseCurrent').addEventListener('click',()=>{try{if(!available)throw Error('先に改稿用JSONを作成するか、ファイルを読み込んでください。');open(available);}catch(e){status.textContent=e.message;}});
  $('proposalContext').addEventListener('click',()=>{if(!proposal)return;let changed=false;for(const item of proposal.targets){const next=neighbors(item,board);if(JSON.stringify(item.continuity.neighbors)!==JSON.stringify(next)){changed=true;item.continuity.neighbors=next;item.continuity.timing_findings=timing(item);for(const c of Object.values(item.continuity.author_checks))c.status='unconfirmed';item.confirmation_notice='前後CUTの情報が変わったため、整合確認を未確認へ戻しました。確認メモは保持しています。';}}render();status.textContent=changed?'前後情報を更新しました。情報が変わったCUTは再確認してください。':'前後情報は同じです。確認状態・メモを保持しました。';if(changed)root.MVApplyUI?.editorChanged();});
  exportButton.addEventListener('click',()=>{if(!proposal||exportButton.disabled)return;const url=URL.createObjectURL(new Blob([JSON.stringify(proposal,null,2)],{type:'application/json'}));const a=node('a','');a.href=url;a.download='mv_storyboard_revision_proposal_v0_8_4.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('proposalSavedFile').addEventListener('change',async e=>{try{if(e.target.files[0])install(restore(JSON.parse(await e.target.files[0].text())));}catch(err){status.textContent='改稿案読込失敗: '+err.message;}finally{e.target.value='';}});
  $('proposalToApply').addEventListener('click',()=>{try{const value=root.MVProposalUI.getProposal();if(!value)throw Error('改稿案を読み込んでください。');root.MVApplyUI.acceptProposal(value);$('applyPanel').scrollIntoView({block:'start'});}catch(e){status.textContent=e.message;}});
  content.addEventListener('input',()=>root.MVApplyUI?.editorChanged());
  content.addEventListener('change',()=>root.MVApplyUI?.editorChanged());
  root.MVProposalUI={editProposal(value,cutId,topic,sourceBoard){if(!install(restore(value),cutId))return;if(sourceBoard)board=clone(sourceBoard);const focus=topic?content.querySelector('[data-check-topic="'+topic+'"]'):$('proposalDraftFields');focus?.scrollIntoView({block:'center'});if(focus){focus.tabIndex=focus.tabIndex<0?-1:focus.tabIndex;focus.focus();}},getProposal:()=>{if(content.querySelector(':invalid'))throw Error('改稿案の不正な入力を修正してください。');return proposal?clone(proposal):null;},setBoard:value=>{board=value;},setHandoff:value=>{available=value;}};
})(globalThis);
