/* Read-only preflight, followed by explicit author approval and field-level copy. */
(function(root){
  'use strict';
  const P=typeof module==='object'&&module.exports?require('./revision-proposal'):root.MVRevisionProposal;
  const R=typeof module==='object'&&module.exports?require('./references'):root.MVReferences;
  const Scope=typeof module==='object'&&module.exports?require('./revision-scope'):root.MVRevisionScope;
  const clone=x=>JSON.parse(JSON.stringify(x)),key=c=>c?.id??c?.cut;
  const canon=x=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(canon(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canon(x[k]))])):x);
  const equal=(a,b)=>canon(a)===canon(b);
  const topics=P.topics;
  const forbidden=k=>['__proto__','prototype','constructor','id','cut','cut_number','references'].includes(k)||/_refs$|_ids?$/.test(k);
  function read(value,path){for(const k of path){if(!value||typeof value!=='object'||!Object.hasOwn(value,k))return {exists:false};value=value[k];}return {exists:true,value};}
  function validate(proposal){
    if(proposal?.schema!=='mv_storyboard_revision_proposal.v0.8.4'||!Array.isArray(proposal.targets)||proposal.target_count!==proposal.targets.length)throw Error('v0.8.4改稿案JSONのschema・targets・target_countを確認してください。');
    for(const t of proposal.targets)if(!t||!['string','number'].includes(typeof t.cut_id)||t.cut_id===''||!t.original_cut||!t.draft_cut||typeof t.original_cut!=='object'||typeof t.draft_cut!=='object'||Array.isArray(t.original_cut)||Array.isArray(t.draft_cut)||!Array.isArray(t.draft_changes)||!Object.hasOwn(P.decisions,t.decision))throw Error('対象CUTのID・元CUT・改稿案・変更一覧・判断が不正です。');
    return proposal;
  }
  function inspect(proposal,board,approvals={},analysis=null){
    validate(proposal);
    const candidates=proposal.targets.filter(t=>t.decision==='adopt_proposal');
    if(!candidates.length)return {candidate_count:0,eligible_count:0,rows:[]};
    const cuts=Array.isArray(board)?board:board?.cuts;
    if(!Array.isArray(cuts)||!cuts.length||cuts.some(c=>!c||typeof c!=='object'||Array.isArray(c)))throw Error('元コンテのカット配列を読み込んでください。');
    const source=proposal.source_handoff?.source_storyboard||{},sourceIssues=[];
    for(const f of ['id','title','version'])if(source[f]!=null&&source[f]!==board?.[f])sourceIssues.push(`元コンテの${f}が改稿案の識別情報と一致しません。`);
    if(source.cut_count!=null&&source.cut_count!==cuts.length)sourceIssues.push('元コンテのCUT数が改稿案の識別情報と一致しません。');
    const rows=candidates.map(t=>{
      const blockers=[...sourceIssues],warnings=[],diff=P.changes(t.original_cut,t.draft_cut),matches=cuts.map((c,i)=>key(c)===t.cut_id?i:-1).filter(i=>i>=0);
      if(proposal.targets.filter(x=>String(x.cut_id)===String(t.cut_id)).length!==1)blockers.push('改稿案のCUT IDが重複しています。');
      if(key(t.original_cut)!==t.cut_id)blockers.push('対象IDとoriginal_cutの識別子が一致しません。');
      if(matches.length!==1)blockers.push(matches.length?'元コンテの対象IDが重複しています。':'元コンテに対象IDがありません。番号や位置による代用はしません。');
      const originalDifferences=matches.length===1?P.changes(t.original_cut,cuts[matches[0]]):[];
      if(matches.length===1&&!equal(t.original_cut,cuts[matches[0]]))blockers.push('元CUTの内容が一致しません。異なるフィールドを確認してください。');
      if(!equal(diff,t.draft_changes))blockers.push('draft_changesと元CUT／改稿案の実際の変更が一致しません。改稿案を確認してください。');
      for(const d of diff){
        const a=read(t.original_cut,d.path),b=read(t.draft_cut,d.path);
        if(!d.path.length||d.path.some(forbidden))blockers.push(`識別子・参照または危険な変更パスは適用できません: ${d.path.join('.')}`);
        if(!a.exists||!b.exists||(a.value!==null&&typeof a.value==='object')||(b.value!==null&&typeof b.value==='object')||typeof a.value!==typeof b.value)blockers.push(`項目の追加・削除・構造／型変更は適用できません: ${d.path.join('.')}`);

      }
      // A leaf diff cannot express empty container changes. Do not silently lose them.
      if(!blockers.length){const reconstructed=clone(t.original_cut);for(const d of diff){let parent=reconstructed;for(const k of d.path.slice(0,-1))parent=parent[k];parent[d.path.at(-1)]=clone(read(t.draft_cut,d.path).value);}if(!equal(reconstructed,t.draft_cut))blockers.push('変更一覧では表現できない構造変更があります。適用を停止します。');}
      const previewSafe=!blockers.length;
      const scan=(v,path=[])=>{if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v))if(!forbidden(k))scan(x,path.concat(k));}else if(typeof v==='string'&&/再検討|未定|仮/.test(v))warnings.push(path.join('.')+': 未確定の可能性がある語句。語句だけでは判定できません。');};scan(t.draft_cut);scan(t.revision_summary,['改稿内容']);
      const temp=clone(t);temp.continuity={...temp.continuity,neighbors:P.neighbors(t,board)};
      const timing=P.timing(temp);
      for(const f of timing)if(f.status==='inconsistent')blockers.push(f.reason);else if(f.status!=='observed_equal')warnings.push(f.reason);
      // Missing or inconsistent numeric timing must not be approved as a valid range.
      const start=t.draft_cut.start_sec??t.draft_cut.start,end=t.draft_cut.end_sec??t.draft_cut.end;
      if(typeof start!=='number'||typeof end!=='number'||!Number.isFinite(start)||!Number.isFinite(end))blockers.push('CUT開始・終了の数値時刻を確認できません。');
      if(t.unconfirmed_notes)warnings.push('改稿案の未確認事項: '+t.unconfirmed_notes);
      for(const [topic,label] of Object.entries(topics))warnings.push(`${label}: 元の確認状態 ${t.continuity?.author_checks?.[topic]?.status??'unconfirmed'}。確認状態とメモを参照してください。適用側の確認状況は下のチェック欄に表示します。`);
      const approval=approvals[String(t.cut_id)]||{};
      const pending=[];
      if(approval.content_confirmed!==true)pending.push('改稿内容を具体的な制作指示として確定してください。');
      for(const [topic,label] of Object.entries(topics))if(approval[topic]!==true)pending.push(`${label}の確認が必要です（未記載・非該当の場合も確認）。`);
      if(approval.source_confirmed!==true)pending.push('改稿案作成時の元コンテであることを確認してください。');
      return {cut_id:t.cut_id,cut_number:t.cut_number,preview_safe:previewSafe,index:matches[0]??null,changes:diff,original_differences:originalDifferences,blockers:[...new Set(blockers)],warnings:[...new Set(warnings)],pending,neighbors:temp.continuity.neighbors,timing,eligible:blockers.length===0&&pending.length===0};
    });
    const validation=Scope.compare(proposal,board,rows,analysis);
    for(const row of rows){
      row.related_issues=[...validation.related_existing_issues,...validation.new_issues].filter(i=>i.affected_application_cut_ids.includes(row.cut_id));
      if(validation.unavailable_reason)row.blockers.push('変更前後の検証ができません: '+validation.unavailable_reason);
      for(const issue of row.related_issues)if(issue.severity==='error')row.blockers.push(issue.code+(issue.reference_id?' / '+issue.reference_id:'')+': '+issue.reason+' 次の確認: '+(issue.code==='missing_analysis'?'今回の元コンテに対応する解析JSONを読み込んでください。':issue.recommended_check));
      const scope=validation.scopes.find(s=>s.cut_id===row.cut_id);
      if(scope?.timing||scope?.semantic)for(const [side,n] of Object.entries(row.neighbors)){
        const boundary=row.index===(side==='previous'?0:(Array.isArray(board)?board:board.cuts).length-1)&&n.declared_id==null;
        if(!n.original_cut&&!boundary)row.blockers.push((side==='previous'?'前CUT':'後CUT')+'が特定できません。接続先の元データを確認してください。');
        if(n.original_cut){const a=n.original_cut.start_sec??n.original_cut.start,b=n.original_cut.end_sec??n.original_cut.end;if(typeof a!=='number'||typeof b!=='number'||a<0||b<=a)row.blockers.push('前後CUTの時刻を確認できません。接続先の開始・終了を確認してください。');}
      }
      if(row.related_issues.some(i=>i.severity!=='error'&&i.severity!=='intentional')&&approvals[String(row.cut_id)]?.related_confirmed!==true)row.pending.push('今回の変更に関係する指摘・新規指摘の意図と対処を確認してください。');
      row.eligible=!row.blockers.length&&!row.pending.length;
    }
    return {candidate_count:rows.length,eligible_count:rows.filter(r=>r.eligible).length,rows,validation};
  }
  function apply(proposal,board,approvals,options={}){
    const report=inspect(proposal,board,approvals,options.analysis);
    if(!report.candidate_count)return {status:'no_targets',report};
    if(options.final_confirmed!==true)throw Error('制作者の最終確認が必要です。');
    if(!['all','eligible_only'].includes(options.mode))throw Error('全件保留／適用可能なCUTのみの方針を選んでください。');
    if(options.mode==='all'&&report.eligible_count!==report.candidate_count)throw Error('適用不可または未確認のCUTがあるため全件保留します。');
    if(!report.eligible_count)throw Error('適用可能なCUTがありません。');
    if(report.eligible_count!==report.candidate_count){
      const selected=proposal.targets.filter(t=>report.rows.some(r=>r.cut_id===t.cut_id&&r.eligible));
      const finalReport=inspect({...proposal,targets:selected,target_count:selected.length},board,approvals,options.analysis);
      const issueKey=items=>JSON.stringify(items.map(i=>[i.code,i.cut_id,i.reference_id,i.severity,i.reason]).sort());
      for(const row of finalReport.rows){const prior=report.rows.find(r=>r.cut_id===row.cut_id);if(!row.eligible||issueKey(row.related_issues)!==issueKey(prior.related_issues))throw Error('部分適用により接続条件・関連指摘が変わります。対象を絞った改稿案で再確認してください。');}
    }
    const output=clone(board),cuts=Array.isArray(output)?output:output.cuts,applied=report.rows.filter(r=>r.eligible);
    for(const row of applied)for(const d of row.changes){let parent=cuts[row.index];for(const part of d.path.slice(0,-1))parent=parent[part];parent[d.path.at(-1)]=clone(read(proposal.targets.find(t=>t.cut_id===row.cut_id).draft_cut,d.path).value);}
    const history={schema:'mv_storyboard_revision_application.v0.8.5',version:'0.8.5',application_version:'0.8.6',created_at:new Date().toISOString(),source_proposal:{schema:proposal.schema,version:proposal.version,id:proposal.id??null,content_fingerprint:R.stableId('proposal',proposal),source_handoff:clone(proposal.source_handoff??{})},baseline_saved_at:proposal.baseline_saved_at??null,original_storyboard_fingerprint:R.stableId('storyboard',board),revised_storyboard_fingerprint:R.stableId('storyboard',output),validation_scope:clone(report.validation),final_confirmation:{confirmed:true,mode:options.mode},applied:applied.map(r=>({cut_id:r.cut_id,cut_number:r.cut_number,changes:clone(r.changes),author_checks:clone(approvals[String(r.cut_id)]),warnings:clone(r.warnings)})),held:report.rows.filter(r=>!r.eligible).map(r=>({cut_id:r.cut_id,blockers:r.blockers,pending:r.pending}))};
    return {status:'applied',storyboard:output,history};
  }
  function carryChecks(value,board,previous=null,prior={}){
    const approvals=Object.create(null),notices=[];const cuts=Array.isArray(board)?board:board?.cuts;
    for(const t of value.targets){const before=previous?.targets.find(x=>x.cut_id===t.cut_id),checks=before&&equal(before,t)?clone(prior[String(t.cut_id)]||{}):{};
      const matches=(cuts||[]).filter(c=>key(c)===t.cut_id),now=P.neighbors(t,board);
      const contextMatches=matches.length===1&&equal(matches[0],t.original_cut)&&['previous','next'].every(side=>t.continuity?.neighbors?.[side]&&equal(t.continuity.neighbors[side].original_cut??null,now[side].original_cut??null));
      if(before&&contextMatches&&equal(before.original_cut,t.original_cut)&&prior[String(t.cut_id)]?.source_confirmed===true)checks.source_confirmed=true;
      if(before&&!equal(before,t))notices.push((t.cut_number??t.cut_id)+': 案・確認情報が更新されたため、内容確定と関連指摘を再確認してください。最終承認は毎回必要です。');
      for(const topic of Object.keys(topics))if(t.continuity?.author_checks?.[topic]?.status==='consistent'){
        if(contextMatches)checks[topic]=true;else notices.push((t.cut_number??t.cut_id)+' / '+topics[topic]+': 作成画面の確認とメモは保持していますが、元CUT・前後CUTの一致を確認できないため適用側で再確認が必要です。');
      }
      approvals[String(t.cut_id)]=checks;
    }
    return {approvals,notices};
  }
  const api={validate,inspect,apply,carryChecks};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  root.MVRevisionApply=api;
  const $=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  let proposal=null,board=null,analysis=null,approvals=Object.create(null),result=null,boardOrigin='loaded',transferNotices=[],editorStale=false;
  const reset=()=>{transferNotices=[];approvals=Object.create(null);result=null;$('applyFinal').checked=false;$('applyBoardExport').disabled=true;$('applyHistoryExport').disabled=true;};
  function checkbox(label,checked,change){const l=el('label',label),input=el('input','');input.type='checkbox';input.checked=checked;input.addEventListener('change',()=>change(input.checked));l.prepend(input);return l;}
  function render(){
    result=null;$('applyBoardExport').disabled=true;$('applyHistoryExport').disabled=true;$('applyFinal').checked=false;$('applyFinal').disabled=true;$('applyGenerate').disabled=true;$('applyReady').textContent='必須チェックと最終確認が終わるまで生成できません。';
    const list=$('applyList');list.replaceChildren();$('applyIssueGroups').replaceChildren();$('applyBlockers').replaceChildren(el('h3','今回の適用を妨げている項目'));if(!proposal){$('applyStatus').textContent='v0.8.4改稿案JSONを読み込むか、画面の改稿案を使用してください。';return;}
    if(!proposal.targets.some(t=>t.decision==='adopt_proposal')){$('applyStatus').textContent='適用対象なし';return;}
    try{const report=inspect(proposal,board,approvals,analysis);$('applyStatus').textContent=`適用候補 ${report.candidate_count} CUT / 適用可能 ${report.eligible_count} CUT。元コンテ: ${boardOrigin==='imported'?'この欄で読み込んだファイル':'読み込み済みコンテ'}。最終確認後に別ファイルを生成します。`;
      if(report.validation)for(const [key,label] of Object.entries({existing_issues:'元コンテの既存指摘（全CUT・適用停止件数ではありません）',related_existing_issues:'今回の変更に関係する既存指摘（既存指摘の内数）',new_issues:'今回の変更で新たに生じた指摘'})){const d=el('details',''),items=report.validation[key];d.append(el('summary',label+'：'+items.length+'件'));for(const i of items)d.append(el('p',(i.cut_id??'全体')+' / '+i.code+(i.reference_id?' / '+i.reference_id:'')+': '+i.reason));$('applyIssueGroups').append(d);}
      for(const notice of transferNotices)$('applyBlockers').append(el('p',notice));
      for(const row of report.rows){
        for(const message of [...row.blockers,...row.pending]){const line=el('p',(row.cut_number??row.cut_id)+': '+message),back=el('button',(row.cut_number??row.cut_id)+'の編集・確認へ戻る');back.type='button';back.dataset.editCut=String(row.cut_id);back.addEventListener('click',()=>{try{const topic=Object.keys(topics).find(k=>message.includes(topics[k]));root.MVProposalUI.editProposal(proposal,row.cut_id,topic,board);}catch(e){$('applyStatus').textContent=e.message;}});line.append(back);$('applyBlockers').append(line);}
        if(!row.blockers.length&&!row.pending.length)$('applyBlockers').append(el('p',(row.cut_number??row.cut_id)+': 個別確認済み。最後に最終確認が必要です。'));const section=el('section','');section.append(el('h3',`${row.cut_number??row.cut_id} (${row.cut_id})`));
        for(const d of row.changes)section.append(el('p',`${d.path.join(' / ')}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`));
        for(const d of row.original_differences)section.append(el('p',`元データ不一致 ${d.path.join(' / ')}: 改稿案の元 ${JSON.stringify(d.before)} / 現在 ${JSON.stringify(d.after)}`));
        for(const b of row.blockers)section.append(el('p','適用停止: '+b));
        for(const w of row.warnings)section.append(el('p','確認候補: '+w));
        const context=el('details','');context.append(el('summary','前後CUT・明示条件・未確認事項を確認'));
        const display=(value,path=[])=>{if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))display(v,path.concat(k));else context.append(el('p',path.join(' / ')+': '+String(value)));};
        const target=proposal.targets.find(t=>t.cut_id===row.cut_id);display({draft_cut:target.draft_cut,continuity:target.continuity,unconfirmed_notes:target.unconfirmed_notes,current_neighbors:row.neighbors});section.append(context);
        const checks=approvals[String(row.cut_id)]??(approvals[String(row.cut_id)]={});
        const labels={...(row.related_issues.some(i=>i.severity!=='error'&&i.severity!=='intentional')?{related_confirmed:'今回の変更に関係する指摘・新規指摘を確認（意図・対処を判断済み）'}:{}),source_confirmed:'改稿案作成時の元コンテであることを確認',content_confirmed:'改稿内容を確定（再検討・仮の表現も含め具体的な制作指示として確認）',...Object.fromEntries(Object.entries(topics).map(([k,v])=>[k,`${v}：明示条件・未確認事項を確認し、適用を妨げる不整合なし（非該当も確認）`]))};
        for(const [k,label] of Object.entries(labels)){const field=checkbox(label,checks[k]===true,v=>{checks[k]=v;render();});field.querySelector('input').dataset.approval=k;field.querySelector('input').dataset.cut=String(row.cut_id);section.append(field);}
        for(const p of row.pending)section.append(el('p','未確認: '+p));list.append(section);
      }
      if(editorStale)$('applyBlockers').append(el('p','作成画面が変更されています。「編集した改稿案を適用前チェックへ渡す」で再確認してください。'));
      const ready=!editorStale&&report.eligible_count>0&&($('applyMode').value==='eligible_only'||report.eligible_count===report.candidate_count);$('applyFinal').disabled=!ready;
      $('applyReady').textContent=ready?'下記の最終確認を行ってください。':'生成不可：各CUTの適用停止・未確認を解消してください。一部のみ適用する場合は方針を選択してください。';
    }catch(e){$('applyStatus').textContent=e.message;$('applyBlockers').append(el('p','判定停止: '+e.message));$('applyFinal').disabled=true;}
  }
  function openProposal(p){validate(p);const transfer=carryChecks(p,board,proposal,approvals);proposal=clone(p);reset();approvals=transfer.approvals;transferNotices=transfer.notices;editorStale=false;render();}
  $('applyProposalFile').addEventListener('change',async e=>{try{if(e.target.files[0])openProposal(JSON.parse(await e.target.files[0].text()));}catch(err){proposal=null;reset();render();$('applyStatus').textContent='読込失敗: '+err.message;}finally{e.target.value='';}});
  $('applySourceFile').addEventListener('change',async e=>{try{if(!e.target.files[0])return;const text=await e.target.files[0].text();root.MVStoryboard.importJSON(text);board=JSON.parse(text);boardOrigin='imported';reset();render();}catch(err){board=null;reset();render();$('applyStatus').textContent='元コンテ読込失敗: '+err.message;}finally{e.target.value='';}});
  $('applyUseCurrent').addEventListener('click',()=>{try{const p=root.MVProposalUI.getProposal();if(!p)throw Error('画面に改稿案がありません。');openProposal(p);}catch(e){$('applyStatus').textContent=e.message;}});
  $('applyMode').addEventListener('change',render);
  $('applyFinal').addEventListener('change',()=>{result=null;$('applyBoardExport').disabled=true;$('applyHistoryExport').disabled=true;$('applyGenerate').disabled=!$('applyFinal').checked||$('applyFinal').disabled;});
  $('applyGenerate').addEventListener('click',()=>{try{if(editorStale)throw Error('編集後の改稿案を適用前チェックへ渡してください。');result=apply(proposal,board,approvals,{analysis,mode:$('applyMode').value,final_confirmed:$('applyFinal').checked});$('applyBoardExport').disabled=!result.storyboard;$('applyHistoryExport').disabled=!result.history;$('applyStatus').textContent=`改訂版を生成しました：${result.history?.applied.length??0} CUT適用。コンテ本体と適用履歴を別々に保存してください。元データは変更していません。`;}catch(e){$('applyStatus').textContent=e.message;}});
  function download(value,name){if(!value)return;const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=el('a','');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('applyBoardExport').addEventListener('click',()=>download(result?.storyboard,'mv_storyboard_revised_v0_8_6.json'));
  $('applyHistoryExport').addEventListener('click',()=>download(result?.history,'mv_storyboard_revision_application_v0_8_6.json'));
  root.MVApplyUI={acceptProposal:openProposal,editorChanged(value){if(!proposal||(value&&equal(proposal,value)))return;editorStale=true;result=null;if(!$('applyEditorStale')){const notice=el('p','作成画面が変更されています。「編集した改稿案を適用前チェックへ渡す」で再確認してください。');notice.id='applyEditorStale';$('applyBlockers').append(notice);}$('applyFinal').checked=false;$('applyFinal').disabled=true;$('applyGenerate').disabled=true;$('applyBoardExport').disabled=true;$('applyHistoryExport').disabled=true;$('applyReady').textContent='作成画面が変更されています。「編集した改稿案を適用前チェックへ渡す」で再確認してください。';},setAnalysis(value){if(!equal(analysis,value)){analysis=value?clone(value):null;reset();render();}},setBoard(value){if(boardOrigin==='imported')return;if(!equal(board,value)){board=value?clone(value):null;reset();render();}}};
})(globalThis);
