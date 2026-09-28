const test=require('node:test'),assert=require('node:assert/strict'),P=require('../revision-proposal'),fixture=require('../sample_revision_handoff_v0_8_3.synthetic.json');
const copy=x=>JSON.parse(JSON.stringify(x));
test('A/C/D: one independent CUT 02 draft retains evidence and never applies +0.3 seconds',()=>{
 const handoff=copy(fixture);handoff.targets[0].original_cut.actions.push({subject:'右ヒール（合成テスト）',action:'踏む',start_sec:2.3917});const before=JSON.stringify(handoff),p=P.create(handoff),t=p.targets[0];
 assert.equal(p.target_count,1);assert.equal(t.cut_number,'CUT 02');assert.deepEqual(t.original_cut,t.draft_cut);assert.notEqual(t.original_cut,t.draft_cut);
 const event=t.review_entries[0].events[0];for(const name of ['start_sec','end_sec']){const field=event.fields.find(f=>f.field===name);assert.equal(field.before,2.3917);assert.equal(field.after,2.6917);}assert.equal(t.draft_cut.actions.at(-1).start_sec,2.3917);
 P.edit(t,['start_sec'],1.2);P.edit(t,['actions','0','action'],'制作者が変更');assert.equal(t.original_cut.start_sec,1);assert.equal(t.original_cut.actions[0].action,'turn');assert.equal(JSON.stringify(handoff),before);assert.equal(t.draft_changes.length,2);
});
test('B: zero targets is valid and produces no invented drafts',()=>{const h=copy(fixture);h.targets=[];h.target_count=0;const p=P.create(h);assert.equal(p.target_count,0);assert.deepEqual(p.targets,[]);});
test('E/F: author decision reason pending notes survive export; missing neighbors remain unconfirmed',()=>{
 const p=P.create(fixture),t=p.targets[0];t.decision='keep_original';t.reason='意図的な遅延を維持';t.unconfirmed_notes='前後の衣装は未確認';
 assert.equal(t.continuity.neighbors.previous.status,'unconfirmed');assert.equal(t.continuity.neighbors.previous.original_cut,null);assert.ok(Object.values(t.continuity.author_checks).every(c=>c.status==='unconfirmed'));
 const saved=JSON.parse(JSON.stringify(p));assert.equal(saved.targets[0].decision,'keep_original');assert.equal(saved.targets[0].reason,t.reason);assert.equal(saved.targets[0].unconfirmed_notes,t.unconfirmed_notes);
});
test('explicit neighbor facts, gaps and invalid time are distinct from human continuity judgment',()=>{
 const h=copy(fixture),t=h.targets[0];t.original_cut.previous_cut_id='prev';t.original_cut.next_cut_id='next';const board={cuts:[{id:'prev',cut_number:'CUT 01',start_sec:0,end_sec:1,wardrobe:'記載の衣装'},t.original_cut,{id:'next',cut_number:'CUT 03',start_sec:2.5,end_sec:4}]};
 const before=JSON.stringify(board),p=P.create(h,board),item=p.targets[0];assert.equal(item.continuity.neighbors.previous.basis,'explicit_cut_id');assert.equal(item.continuity.neighbors.previous.original_cut.wardrobe,'記載の衣装');assert.ok(item.continuity.timing_findings.some(f=>f.status==='observed_equal'));assert.ok(item.continuity.timing_findings.some(f=>f.status==='needs_check'));assert.equal(item.continuity.author_checks.actions.status,'unconfirmed');
 item.continuity.author_checks.actions.status='consistent';P.edit(item,['end_sec'],0);assert.ok(item.continuity.timing_findings.some(f=>f.status==='inconsistent'));assert.equal(item.continuity.author_checks.actions.status,'unconfirmed');assert.equal(JSON.stringify(board),before);
});
test('invalid handoff and duplicate targets are rejected',()=>{const h=copy(fixture);h.target_count=0;assert.throws(()=>P.create(h));h.target_count=2;h.targets.push(h.targets[0]);assert.throws(()=>P.create(h));});
