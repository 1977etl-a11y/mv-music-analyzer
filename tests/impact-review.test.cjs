const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../references'),S=require('../storyboard'),Review=require('../impact-review'),fixture=require('./impact-review-fixture.cjs');
const h=vm.createContext({MVReferences:R,MVStoryboard:S});vm.runInContext(fs.readFileSync(require.resolve('../storyboard-baseline.js'),'utf8'),h);const B=h.MVStoryboardBaseline;
test('211 values still compare; specified +0.3 second event becomes CUT 02 review',()=>{
 const f=fixture(),before=JSON.stringify(f),comparison=B.compare(f.baseline,f.board,f.updated),review=Review.build(comparison,f.board);
 assert.equal(comparison.value_compared_reference_count,211);assert.equal(comparison.compared_reference_count,211);assert.equal(comparison.storyboard_metadata_issues.length,3);assert.ok(!comparison.analysis_comparison.issues.some(i=>i.code==='storyboard_metadata'));
 assert.equal(review.cuts.length,1);assert.equal(review.cuts[0].cut_number,'CUT 02');assert.equal(review.cuts[0].events[0].event_id,f.eventId);assert.equal(review.cuts[0].events[0].time_shifts[0].delta_sec,.3);assert.equal(review.cuts[0].status,'unreviewed');assert.ok(review.cuts[0].events[0].review_candidates.includes('動作開始のタイミング'));assert.equal(JSON.stringify(f),before);
});
test('multiple changed events aggregate once per CUT and unaffected CUTs are excluded',()=>{
 const f=fixture();S.resolve(f.updated,f.secondId).value.confidence=.123;
 const review=Review.build(B.compare(f.baseline,f.board,f.updated),f.board);assert.equal(review.cuts.length,1);assert.equal(review.cuts[0].events.length,2);
 const unchanged=Review.build(B.compare(f.baseline,f.board,f.analysis),f.board);assert.equal(unchanged.cuts.length,0);
});
test('review decisions and JSON round trip are independent of original objects',()=>{
 const f=fixture(),comparison=B.compare(f.baseline,f.board,f.updated),original=JSON.stringify([f,comparison]);const review=Review.build(comparison,f.board);
 for(const status of Object.keys(Review.statuses)){Review.setStatus(review,review.cuts[0].cut_id,status);assert.equal(JSON.parse(JSON.stringify(review)).cuts[0].status,status);}
 assert.throws(()=>Review.setStatus(review,review.cuts[0].cut_id,'automatic_fix'));assert.equal(JSON.stringify([f,comparison]),original);
 assert.equal(Review.build(comparison,f.board).review_id,review.review_id);
});
test('review remains honest when values cannot be compared or source conditions differ',()=>{
 const f=fixture();f.updated.source.id='other_source';const comparison=B.compare(f.baseline,f.board,f.updated),review=Review.build(comparison,f.board);
 assert.equal(review.cuts.length,0);assert.match(review.comparison.analysis_status,/比較不可/);assert.equal(review.comparison.value_compared_reference_count,0);
});
