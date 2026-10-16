'use strict';
const P = require('../revision-proposal');
const F = require('../revision-fields');
const I = require('../cut-identity');
const A = require('../revision-apply');

function edit(value, board, request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).some(k => k !== 'edits') || !Array.isArray(request.edits)) {
    throw new Error('edits配列のみを持つ編集JSONが必要です。');
  }
  const proposal = P.restore(value);
  for (const [index, change] of request.edits.entries()) {
    if (!change || typeof change !== 'object' || Array.isArray(change) ||
        Object.keys(change).some(k => !['cut_id','path','value'].includes(k)) ||
        !['string','number'].includes(typeof change.cut_id) || !Object.hasOwn(change,'value')) {
      throw new Error(`edits[${index}]: cut_id・path・valueのみを指定してください。`);
    }
    const token = I.token(change.cut_id);
    const targets = proposal.targets.filter(t => token && (I.token(t.cut_id) === token || I.tokens(t.original_cut).includes(token)));
    if (targets.length !== 1) throw new Error(`edits[${index}]: 改稿対象CUTを一意に特定できません。`);
    const context = I.matchContext(targets[0], board);
    if (!context.context_matches) {
      const error = new Error(`edits[${index}]: 元CUT・前後CUTが一致しません。編集を停止しました。`);
      error.details = context.diagnostics;
      throw error;
    }
    F.promote(proposal, change.cut_id, change.path, change.value);
  }
  return proposal;
}
// Technical inspection only. Never supplies approvals or calls apply().
function preflight(proposal, board, analysis = null) {
  return A.inspect(proposal, board, {}, analysis);
}
module.exports = {edit, preflight};
