#!/usr/bin/env node
'use strict';

/*
 * MV Music Analyzer CLI - Phase 1
 * Browser-free entry point for agent/Codex use.
 *
 * Current command:
 *   validate --analysis <analysis.json> --storyboard <storyboard.json>
 *
 * Policy:
 * - Read-only. Never writes baseline, storyboard, or analysis.
 * - Uses the same MVStoryboard.importJSON / validate core as the PWA.
 * - Validation issues are returned as data; they do not make the command fail.
 * - Process exits non-zero only for CLI/file/JSON/runtime failures.
 */

const fs = require('node:fs');
const path = require('node:path');

function usage() {
  return [
    'MV Music Analyzer CLI',
    '',
    'Usage:',
    '  node cli/mv-analyzer.cjs validate --analysis <analysis.json> --storyboard <storyboard.json>',
    '',
    'Options:',
    '  --analysis     MV Music Analyzer analysis JSON',
    '  --storyboard   Storyboard JSON (top-level CUT array or object with cuts)',
    '  --output       New output JSON path (must not exist). Stdout on success.',
    '  --pretty       Pretty-print JSON (default)',
    '  --compact      Compact JSON',
    '  -h, --help     Show this help',
    '',
    'Phase 1 is read-only and does not create or replace a saved baseline.'
  ].join('\n');
}

function parseArgs(argv) {
  const out = { _: [], pretty: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('-')) {
      out._.push(arg);
      continue;
    }
    if (arg === '-h' || arg === '--help') out.help = true;
    else if (arg === '--pretty') out.pretty = true;
    else if (arg === '--compact') out.pretty = false;
    else if (['--analysis', '--storyboard', '--output'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new Error(`${arg} にファイルパスが必要です。`);
      if (Object.hasOwn(out, arg.slice(2))) throw new Error(`重複したオプションです: ${arg}`);
      out[arg.slice(2)] = value;
    } else {
      throw new Error(`未対応のオプションです: ${arg}`);
    }
  }
  return out;
}

function readJson(file, label) {
  const full = path.resolve(file);
  let text;
  try {
    text = fs.readFileSync(full, 'utf8');
  } catch (error) {
    throw new Error(`${label}を読めません: ${full} (${error.message})`);
  }
  try {
    return { full, text, json: JSON.parse(text) };
  } catch (error) {
    throw new Error(`${label}がJSONとして不正です: ${full} (${error.message})`);
  }
}

function countBy(items, keyFn) {
  const result = {};
  for (const item of items) {
    const key = keyFn(item) ?? 'unknown';
    result[key] = (result[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function storyboardInputKind(parsed) {
  if (Array.isArray(parsed)) return 'cut_array';
  if (parsed && Array.isArray(parsed.cuts)) return 'storyboard_object';
  return 'unknown';
}

function runValidate(args) {
  const MVStoryboard = require('../storyboard');
  if (!args.analysis) throw new Error('--analysis が必要です。');
  if (!args.storyboard) throw new Error('--storyboard が必要です。');

  const analysisFile = readJson(args.analysis, '解析JSON');
  const boardFile = readJson(args.storyboard, 'コンテJSON');

  const board = MVStoryboard.importJSON(boardFile.text);
  const report = MVStoryboard.validate(board, analysisFile.json);
  const issues = Array.isArray(report.issues) ? report.issues : [];

  return {
    schema: 'mv_analyzer_cli.validate.v1',
    command: 'validate',
    read_only: true,
    inputs: {
      analysis: analysisFile.full,
      storyboard: boardFile.full,
      storyboard_input_kind: storyboardInputKind(boardFile.json)
    },
    summary: {
      cut_count: board.cuts.length,
      reference_count: report.reference_count ?? null,
      affected_cut_count: Array.isArray(report.affected_cut_ids) ? report.affected_cut_ids.length : 0,
      issue_count: issues.length,
      issue_count_by_severity: countBy(issues, i => i.severity),
      issue_count_by_code: countBy(issues, i => i.code)
    },
    affected_cut_ids: report.affected_cut_ids || [],
    issues,
    policy: report.policy || 'Validation never changes author decisions or baseline.'
  };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || process.argv.length === 2) {
      process.stdout.write(usage() + '\n');
      return;
    }

    if (args._.length !== 1) throw new Error('コマンドを1つ指定してください。余分な位置引数は受け付けません。');
    const command = args._[0];
    let result;
    if (command === 'validate') result = runValidate(args);
    else throw new Error(`未対応のコマンドです: ${command}`);

    const text = JSON.stringify(result, null, args.pretty ? 2 : 0) + '\n';
    // Exclusive creation protects inputs, baselines and existing files.
    if (args.output) fs.writeFileSync(path.resolve(args.output), text, {encoding: 'utf8', flag: 'wx'});
    process.stdout.write(text);
  } catch (error) {
    const payload = {
      schema: 'mv_analyzer_cli.error.v1',
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
    process.stderr.write(JSON.stringify(payload, null, 2) + '\n');
    process.exitCode = 1;
  }
}

main();
