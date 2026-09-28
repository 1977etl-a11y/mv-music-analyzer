const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../revision-apply'),P=require('../revision-proposal'),fixture=require('../sample_revision_handoff_v0_8_3.synthetic.json'),S=require('../storyboard');
const analysis=require('./application-fixture.cjs').analysis();
const A={inspect:(p,b,c)=>Core.inspect(p,b,c,analysis),apply:(p,b,c,o)=>Core.apply(p,b,c,{...o,analysis})};
const copy=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const h=copy(fixture),original=h.targets[0].original_cut;
 const board={cuts:Array.from({length:44},(_,i)=>i===1?copy(original):{id:'synthetic_'+i,cut_number:'CUT '+String(i+1).padStart(2,'0'),start_sec:i,end_sec:i+1,action:'synthetic unchanged',audio_event_refs:['preserved_'+i]})};
 h.source_storyboard={id:null,title:null,version:null,cut_count:44};
 const p=P.create(h,board),t=p.targets[0];t.decision='adopt_proposal';P.edit(t,['actions','0','action'],'右踵二打のタイミングを再検討');
 const checks={[t.cut_id]:{related_confirmed:true,content_confirmed:true,source_confirmed:true,...Object.fromEntries(Object.keys(P.topics).map(k=>[k,true]))}};
 return {p,t,board,checks};
}
test('A/F: adoption is not application permission; content, continuity and final approval required',()=>{
 const {p,board,checks,t}=setup();let r=A.inspect(p,board);assert.equal(r.eligible_count,0);assert.ok(r.rows[0].warnings.some(x=>x.includes('未確定')));assert.ok(r.rows[0].warnings.some(x=>x.includes('unconfirmed')));
 assert.throws(()=>A.apply(p,board,checks,{mode:'all'}),/最終確認/);
 delete checks[t.cut_id].content_confirmed;assert.throws(()=>A.apply(p,board,checks,{mode:'all',final_confirmed:true}),/全件保留/);
 checks[t.cut_id].content_confirmed=true;delete checks[t.cut_id].actions;assert.equal(A.inspect(p,board,checks).eligible_count,0);
});
test('B: mismatched original fields, duplicate/missing IDs and wrong source metadata block application',()=>{
 const {p,board,checks}=setup();board.cuts[1].actions[0].action='other';let r=A.inspect(p,board,checks);assert.equal(r.eligible_count,0);assert.deepEqual(r.rows[0].original_differences[0].path,['actions','0','action']);
 board.cuts[1]=copy(p.targets[0].original_cut);board.cuts.push(copy(board.cuts[1]));assert.equal(A.inspect(p,board,checks).eligible_count,0);
 board.cuts.pop();board.cuts[1].id='wrong';assert.equal(A.inspect(p,board,checks).eligible_count,0);
 board.cuts[1]=copy(p.targets[0].original_cut);p.source_handoff.source_storyboard.id='other';assert.equal(A.inspect(p,board,checks).eligible_count,0);
});
test('C/D: applies only confirmed fields to a copy; other 43 CUTs, order, references, sources preserved',()=>{
 const {p,board,checks,t}=setup(),before=copy({p,board}),out=A.apply(p,board,checks,{mode:'all',final_confirmed:true});
 assert.equal(out.storyboard.cuts.length,44);for(let i=0;i<44;i++)if(i!==1)assert.deepEqual(out.storyboard.cuts[i],board.cuts[i]);
 const expected=copy(board);expected.cuts[1].actions[0].action=t.draft_cut.actions[0].action;assert.deepEqual(out.storyboard,expected);assert.deepEqual({p,board},before);
 assert.equal(out.storyboard.cuts[1].start_sec,1);assert.equal(out.history.applied.length,1);assert.deepEqual(out.history.applied[0].changes,t.draft_changes);
 assert.equal(out.history.final_confirmation.confirmed,true);assert.equal(S.importJSON(JSON.stringify(out.storyboard)).cuts.length,44);
 const array=A.apply(p,board.cuts,checks,{mode:'all',final_confirmed:true});assert.ok(Array.isArray(array.storyboard));assert.equal(array.storyboard.length,44);
});
test('E: zero targets and non-adopted decisions yield no targets without generation',()=>{
 const {p,board,checks}=setup();for(const decision of ['unreviewed','keep_original','reconsider']){p.targets[0].decision=decision;assert.equal(A.apply(p,board,checks).status,'no_targets');}p.targets=[];p.target_count=0;assert.equal(A.apply(p,null,{}).status,'no_targets');
});
test('tampered change list, reference editing, missing fields, empty structural edits and invalid times block',()=>{
 for(const mutation of [t=>t.draft_changes=[],t=>P.edit(t,['id'],'new-id'),t=>{delete t.draft_cut.actions;t.draft_changes=P.changes(t.original_cut,t.draft_cut);},t=>{t.draft_cut.empty={};t.draft_changes=P.changes(t.original_cut,t.draft_cut);},t=>P.edit(t,['end_sec'],-1)]){
  const {p,t,board,checks}=setup();mutation(t);assert.equal(A.inspect(p,board,checks).eligible_count,0);
 }
});
test('partial application requires explicit policy; held CUT has reasons in separate history',()=>{
 const {p,board,checks}=setup(),extra=copy(p.targets[0]);extra.cut_id='missing';extra.original_cut.id='missing';extra.draft_cut.id='missing';p.targets.push(extra);p.target_count++;
 assert.throws(()=>A.apply(p,board,checks,{mode:'all',final_confirmed:true}),/全件保留/);
 const out=A.apply(p,board,checks,{mode:'eligible_only',final_confirmed:true});assert.equal(out.history.applied.length,1);assert.equal(out.history.held[0].cut_id,'missing');assert.ok(out.history.held[0].blockers.length);
});
test('object key order does not cause a false mismatch; duplicate proposal targets block',()=>{
 const {p,board,checks}=setup();board.cuts[1]=Object.fromEntries(Object.entries(board.cuts[1]).reverse());assert.equal(A.inspect(p,board,checks).eligible_count,1);
 p.targets.push(copy(p.targets[0]));p.target_count++;assert.equal(A.inspect(p,board,checks).eligible_count,0);
});
