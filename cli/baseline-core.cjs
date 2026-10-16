'use strict';

const fs = require('node:fs');
const vm = require('node:vm');

// Evaluate only bundled Core code, never input JSON as JavaScript.
// No browser globals or IndexedDB are supplied; expose read-only operations only.
const context = vm.createContext({
  MVReferences: require('../references'),
  MVStoryboard: require('../storyboard')
});
const filename = require.resolve('../storyboard-baseline.js');
vm.runInContext(fs.readFileSync(filename, 'utf8'), context, {filename});
const {check, compare} = context.MVStoryboardBaseline;
module.exports = Object.freeze({check, compare});
