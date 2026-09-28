const test=require('node:test'),assert=require('node:assert/strict');
const Revision=require('../revision-export'),Review=require('../impact-review'),fixture=require('./impact-review-fixture.cjs');
const sample=require('../sample_impact_review_v0_8_2.synthetic.json');
function inputs(){const f=fixture(),review=structuredClone(sample);review.cuts[0].status='needs_revision';return {f,review};}
test('A/E: needs_revision CUT 02 retains all original fields and all review evidence unchanged',()=>{
 const {f,review}=inputs();f.board.cuts[1].unknown_author_data={wardrobe:['original'],nested:{enabled:false}};
 const before=JSON.stringify({f,review}),out=Revision.build(review,f.board);
 assert.equal(out.targets.length,1);assert.equal(out.targets[0].cut_number,'CUT 02');assert.deepEqual(out.targets[0].original_cut,f.board.cuts[1]);assert.deepEqual(out.targets[0].review_entries,[review.cuts[0]]);
 assert.equal(out.targets[0].review_entries[0].events[0].time_shifts[0].delta_sec,.3);assert.equal(out.targets[0].review_entries[0].events[0].fields[0].before,2.3917);assert.equal(out.targets[0].review_entries[0].events[0].fields[0].after,2.6917);
 assert.equal(out.baseline_saved_at,review.baseline_saved_at);assert.equal(JSON.stringify({f,review}),before);assert.deepEqual(JSON.parse(JSON.stringify(out)),out);
});
test('B: no_change, reviewed, unreviewed, and omitted decision produce valid empty outputs',()=>{
 const {f,review}=inputs();for(const status of ['no_change','reviewed','unreviewed',undefined]){review.cuts[0].status=status;const out=Revision.build(review,f.board);assert.equal(out.targets.length,0);assert.equal(out.errors.length,0);}
});
test('C: multiple events and duplicate needs_revision rows form one target without losing evidence',()=>{
 const {f,review}=inputs();review.cuts[0].events.push({...structuredClone(review.cuts[0].events[0]),event_id:'another_event'});review.cuts.push(structuredClone(review.cuts[0]));
 const out=Revision.build(review,f.board);assert.equal(out.targets.length,1);assert.deepEqual(out.targets[0].review_entries,review.cuts);
});
test('D: unknown CUT or duplicate original IDs is explicit; display CUT number is never substituted',()=>{
 const {f,review}=inputs();review.cuts[0].cut_id='missing';let out=Revision.build(review,f.board);assert.equal(out.targets.length,0);assert.equal(out.errors[0].cut_id,'missing');assert.equal(out.errors[0].code,'missing_cut');
 review.cuts[0].cut_id=f.board.cuts[1].id;f.board.cuts.push(structuredClone(f.board.cuts[1]));out=Revision.build(review,f.board);assert.equal(out.errors[0].code,'ambiguous_cut_id');
});
test('conflicting decisions and invalid input are rejected without invented status or metadata',()=>{
 const {f,review}=inputs();review.cuts.push({...review.cuts[0],status:'no_change'});assert.equal(Revision.build(review,f.board).errors[0].code,'conflicting_review_status');
 assert.throws(()=>Revision.checkReview({schema:'wrong',cuts:[]}));assert.throws(()=>Revision.build(review,null));
});
test('raw top-level cut arrays and legacy cut IDs preserve exact original CUT',()=>{
 const {review}=inputs(),original={cut:review.cuts[0].cut_id,start:2,end:3,block:'A',camera:{direction:'front'},custom:['keep']};const out=Revision.build(review,[original]);assert.deepEqual(out.targets[0].original_cut,original);assert.equal(out.source_storyboard.id,null);
});
