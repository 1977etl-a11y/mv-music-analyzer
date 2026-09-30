/* Read-only source identity. Never normalizes the user's stored objects in place. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x||{},k);
const stable=x=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(stable(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(stable(x[k]))])):x);
const equal=(a,b)=>stable(a)===stable(b);
const identityFields=['id','cut_id','cut','cut_number'];
const ignoredFields=['references','review_refs','audio_evidence','audio evidence','audio_context','ui','ui_state','_ui','_ui_state','derived_info','_derived'];
function token(v){if(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)return '#'+v;if(typeof v!=='string'||!v.trim())return null;const s=v.trim(),m=s.match(/^(?:CUT\s*)?(\d+)$/i);if(m){const digits=m[1].replace(/^0+(?=\d)/,'');return '#'+digits;}return 'id:'+s;}
function tokens(c){return [...new Set(identityFields.map(k=>token(c?.[k])).filter(Boolean))];}
function id(c){return c?.id??c?.cut_id??c?.cut??c?.cut_number;}
function ambiguous(c){const labels=['cut','cut_number'].filter(k=>own(c,k)).map(k=>token(c[k])),ids=['id','cut_id'].filter(k=>own(c,k)).map(k=>token(c[k]));return new Set(labels).size>1||new Set(ids).size>1;}
function resolve(cuts,requested,saved){
 const wanted=new Set([token(requested),...tokens(saved)].filter(Boolean));
 const indices=(cuts||[]).map((c,i)=>tokens(c).some(t=>wanted.has(t))?i:-1).filter(i=>i>=0);
 if(indices.length!==1)return {index:null,cut:null,reason:indices.length?'CUT識別子が複数CUTに一致します。':'CUT識別子に一致するCUTがありません。',candidate_indices:indices};
 const index=indices[0],cut=cuts[index];if(ambiguous(cut)||ambiguous(saved))return {index:null,cut:null,reason:'同一CUT内の識別フィールドが矛盾しています。',candidate_indices:indices};
 return {index,cut,reason:null,candidate_indices:indices};
}
function link(c,side){return c?.[side+'_cut']??c?.[side+'_cut_id']??c?.connections?.[side+'_cut_id'];}
function normalize(c){
 const out=Object.create(null);for(const [k,v] of Object.entries(c||{}))if(!identityFields.includes(k)&&!ignoredFields.includes(k)&&!['start_sec','end_sec','previous_cut_id','next_cut_id','previous_cut','next_cut'].includes(k))out[k]=clone(v);
 for(const k of ['start','end'])if(own(c,k)||own(c,k+'_sec'))out[k]=clone(c[k]??c[k+'_sec']);
 for(const side of ['previous','next'])if(link(c,side)!==undefined)out[side+'_cut']=token(link(c,side));
 if(out.connections&&typeof out.connections==='object'){delete out.connections.previous_cut_id;delete out.connections.next_cut_id;if(!Object.keys(out.connections).length)delete out.connections;}
 return out;
}
function differences(a,b,path=[],out=[]){
 if(equal(a,b))return out;
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){for(const k of new Set([...Object.keys(a),...Object.keys(b)])){if(!own(a,k)||!own(b,k))out.push({field:[...path,k].join('.'),saved:own(a,k)?a[k]:null,current:own(b,k)?b[k]:null,saved_present:own(a,k),current_present:own(b,k)});else differences(a[k],b[k],[...path,k],out);}return out;}
 out.push({field:path.join('.'),saved:a??null,current:b??null});return out;
}
function compare(saved,current){
 if(!saved||!current)return {matches:false,differences:[{field:'CUT',saved:saved??null,current:current??null}],ignored_fields:ignoredFields};
 const diffs=differences(normalize(saved),normalize(current));
 if(!tokens(saved).some(t=>tokens(current).includes(t)))diffs.push({field:'cut',saved:id(saved),current:id(current)});
 for(const fields of [['cut','cut_number'],['id','cut_id']]){const a=fields.map(k=>saved[k]).find(v=>v!==undefined),b=fields.map(k=>current[k]).find(v=>v!==undefined);if(a!==undefined&&b!==undefined&&token(a)!==token(b))diffs.push({field:fields[0],saved:a,current:b});}
 for(const [name,c] of [['saved',saved],['current',current]]){if(ambiguous(c))diffs.push({field:'identity',saved:name==='saved'?tokens(c):null,current:name==='current'?tokens(c):null});for(const k of ['start','end'])if(own(c,k)&&own(c,k+'_sec')&&!equal(c[k],c[k+'_sec']))diffs.push({field:k+' alias conflict ('+name+')',saved:c[k],current:c[k+'_sec']});}
 for(const [name,c] of [['saved',saved],['current',current]])for(const side of ['previous','next']){const values=[c[side+'_cut'],c[side+'_cut_id'],c.connections?.[side+'_cut_id']].filter(v=>v!==undefined);if(new Set(values.map(token)).size>1)diffs.push({field:side+' link alias conflict ('+name+')',saved:name==='saved'?values:null,current:name==='current'?values:null});}
 return {matches:diffs.length===0,differences:diffs,ignored_fields:ignoredFields.filter(k=>own(saved,k)||own(current,k))};
}
function neighbors(item,board){
 const cuts=Array.isArray(board)?board:board?.cuts||[],target=resolve(cuts,item.cut_id,item.original_cut),result={};
 for(const side of ['previous','next']){
   let basis=null,found=null,reason='前後CUTの元データがありません。';const declared=link(item.original_cut,side),saved=item.continuity?.neighbors?.[side]?.original_cut;
   if(declared!==undefined){basis='explicit_cut_id';found=resolve(cuts,declared);}
   else if(target.cut){const reverse=cuts.filter(c=>token(link(c,side==='previous'?'next':'previous'))&&tokens(target.cut).includes(token(link(c,side==='previous'?'next':'previous'))));
     if(reverse.length){basis='reverse_explicit_cut_id';found=reverse.length===1?resolve(cuts,id(reverse[0]),reverse[0]):{cut:null,reason:'前後関係を宣言するCUTが複数あります。'};}
     else if(saved){basis='saved_neighbor_identity';found=resolve(cuts,id(saved),saved);}
     else {basis='source_storyboard_order';const cut=cuts[target.index+(side==='previous'?-1:1)]||null;found={cut,reason:cut?null:'元コンテ配列の端です。接続意図は未確認です。'};}
   }else reason=target.reason||reason;
   if(found)reason=found.reason||'元コンテの接続情報。演出上の整合は制作者が確認してください。';
   result[side]={basis,declared_id:declared??null,status:'unconfirmed',reason,original_cut:found?.cut?clone(found.cut):null};
 }
 return result;
}
function matchContext(item,board){
 const cuts=Array.isArray(board)?board:board?.cuts||[],target=resolve(cuts,item.cut_id,item.original_cut),currentNeighbors=neighbors(item,board),details=[];
 const push=(role,saved,current,reason)=>{const comparison=compare(saved,current);details.push({role,cut_id:id(saved)??id(current)??item.cut_id,reason:reason??null,...comparison});};
 push('target',item.original_cut,target.cut,target.reason);
 for(const side of ['previous','next']){const record=item.continuity?.neighbors?.[side],saved=record?.original_cut,current=currentNeighbors[side].original_cut;
   const boundary=!!record&&saved===null&&current===null&&target.index===(side==='previous'?0:cuts.length-1)&&currentNeighbors[side].declared_id===null;
   if(boundary)details.push({role:side,cut_id:null,matches:true,differences:[],ignored_fields:[],reason:'元コンテの端（前後CUTなし）'});else push(side,saved,current,current?null:currentNeighbors[side].reason);
 }
 return {target,neighbors:currentNeighbors,details,source_matches:details[0].matches,context_matches:details.every(d=>d.matches),diagnostics:details.filter(d=>!d.matches)};
}
const api={token,tokens,id,resolve,normalize,compare,neighbors,matchContext,ignoredFields};if(typeof module==='object'&&module.exports)module.exports=api;else root.MVCutIdentity=api;
})(globalThis);
