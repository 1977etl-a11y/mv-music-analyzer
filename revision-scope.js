/* Read-only before/after validation. Categories do not change the validator. */
(function(root){
'use strict';
const S=typeof module==='object'&&module.exports?require('./storyboard'):root.MVStoryboard;
const clone=x=>JSON.parse(JSON.stringify(x)),key=c=>c?.id??c?.cut;
const signature=i=>JSON.stringify([i.code,i.cut_id,i.reference_id,i.severity,i.reason]);
function compare(proposal,board,rows,analysis){
 const cuts=Array.isArray(board)?board:board.cuts, preview=clone(board),out=Array.isArray(preview)?preview:preview.cuts;
 const scopes=rows.map(row=>{
   const target=proposal.targets.find(t=>t.cut_id===row.cut_id),fields=row.changes.map(d=>d.path.join('.'));
   const timing=fields.some(f=>/(^|\.)(start|end|start_sec|end_sec|cut_time_sec|timing)(\.|$)/.test(f));
   const semantic=fields.some(f=>/action|subject|prop|wardrobe|camera|shot|composition|state|motion|動作|人物|小道具|衣装|カメラ|構図|被写体/i.test(f));
   const refs=fields.some(f=>/reference|_refs|mapping|relation/i.test(f));
   const relatedIds=new Set([row.cut_id]);
   for(const n of Object.values(row.neighbors))if(n.original_cut)relatedIds.add(key(n.original_cut));
   if(row.preview_safe&&row.index!==null)for(const d of row.changes){let v=out[row.index];for(const p of d.path.slice(0,-1))v=v[p];let value=target.draft_cut;for(const p of d.path)value=value[p];v[d.path.at(-1)]=clone(value);}
   return {cut_id:row.cut_id,fields,timing,semantic,refs,dependent_cut_ids:[...relatedIds],has_references:S.extractReferences(target.original_cut).references.length>0,reference_dependency:timing||refs||(semantic&&S.extractReferences(target.original_cut).references.some(r=>/action|camera|sync|動作|同期|カメラ/.test(r.purpose)))};
 });
 const run=value=>S.validate(S.importJSON(JSON.stringify(value)),analysis);
 let before,after;
 try{before=run(board);after=run(preview);}catch(e){return {existing_issues:[],related_existing_issues:[],new_issues:[],scopes,unavailable_reason:e.message};}
 const counts=new Map();for(const i of before.issues)counts.set(signature(i),(counts.get(signature(i))||0)+1);
 const newIssues=[],retained=[];for(const i of after.issues){const sig=signature(i),n=counts.get(sig)||0;if(n){counts.set(sig,n-1);retained.push(i);}else newIssues.push(i);}
 function relevant(i,s){
   if(i.code==='invalid_storyboard')return true;
   if(i.code==='storyboard_metadata')return false;
   if(i.code==='missing_analysis')return s.reference_dependency&&s.has_references;
   const own=i.cut_id===s.cut_id,near=s.dependent_cut_ids.includes(i.cut_id),boundary=['cut_gap','cut_overlap'].includes(i.code);
   if(boundary)return (s.timing||s.semantic)&&(i.cut_id===s.cut_id||i.reference_id===s.cut_id);
   if(['cut_time','cut_id'].includes(i.code))return near;
   if(i.code==='outside_audio')return own&&s.timing;
   if(['missing_reference','reference_kind','invalid_reference','missing_baseline','analysis_changed','analysis_identity_changed','stale_manual_time','stale_reference_time','uncertain_confirmed','time_offset','offset_mismatch','usage_time'].includes(i.code))return own&&s.reference_dependency;
   if(['relation_type','author_decision','relation_target'].includes(i.code))return own&&s.fields.some(f=>f.startsWith('relations.'));
   if(i.code==='mapping_author')return own&&s.fields.some(f=>f.startsWith('mappings.'));
   // Unknown rules cannot silently certify a changed CUT.
   return own;
 }
 const tag=i=>({...i,affected_application_cut_ids:scopes.filter(s=>relevant(i,s)).map(s=>s.cut_id)});
 return {existing_issues:before.issues,related_existing_issues:retained.map(tag).filter(i=>i.affected_application_cut_ids.length),new_issues:newIssues.map(tag),scopes,unavailable_reason:null};
}
const api={compare};if(typeof module==='object'&&module.exports)module.exports=api;else root.MVRevisionScope=api;
})(globalThis);
