'use strict';
const S = require('../storyboard');
const E = require('../revision-export');
const P = require('../revision-proposal');
const I = require('../cut-identity');

function fail(errors) {
  const error = new Error('改稿生成を停止しました。入力の矛盾・不足を確認してください。');
  error.details = errors;
  throw error;
}
function handoff(review, board) {
  const result = E.build(E.checkReview(review), board);
  if (result.errors.length) fail(result.errors);
  return result;
}
function proposal(h, board) {
  P.check(h);
  const cuts = Array.isArray(board) ? board : board.cuts;
  // Reuse review Core to reject contradictory decisions and ambiguous/missing originals.
  const checked = handoff({schema:'mv_impact_cut_review.v0.8.2',cuts:h.targets.flatMap(t=>t.review_entries)}, board);
  const errors = [];
  for (const target of h.targets) {
    if (!checked.targets.some(t=>t.cut_id===target.cut_id)) {
      errors.push({cut_id:target.cut_id,code:'missing_revision_decision',reason:'対象CUTのneeds_revision判断を確認できません。'});
      continue;
    }
    const found = I.resolve(cuts, target.cut_id, target.original_cut);
    const comparison = I.compare(target.original_cut, found.cut);
    if (!found.cut || !comparison.matches) errors.push({cut_id:target.cut_id,code:'original_cut_mismatch',reason:found.reason, differences:comparison.differences});
  }
  if (errors.length) fail(errors);
  return P.create(h, board);
}
function readBoard(text) {
  // Validate with Core, but keep the exact source fields rather than import aliases.
  S.importJSON(text);
  return JSON.parse(text);
}
module.exports = {handoff, proposal, readBoard};
