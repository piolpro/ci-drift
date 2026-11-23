#!/usr/bin/env node
import { relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { lint } from './lint.js';

const help = 'Usage: ci-drift [--format text|json] [--eol] [path]\n'
  + 'Lint a repository (default: current directory). --eol enables Node EOL warnings.';

try {
  const { values, positionals } = parseArgs({
    options: {
      format: { type: 'string', default: 'text' },
      eol: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(help);
  } else {
    if (positionals.length > 1 || !['text', 'json'].includes(values.format)) throw new Error(help);
    const target = positionals[0] ?? '.';
    const results = lint(target, { eol: values.eol });
    if (values.format === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else if (!results.length) {
      console.log('ci-drift: no findings');
    } else {
      for (const { file, line, severity, id, message, hint } of results) {
        console.log(singleLine(file) + ':' + line + ' ' + severity + ' [' + id + '] ' + singleLine(message)
          + '\n  Fix: ' + hint);
      }
    }
    if (process.env.GITHUB_ACTIONS === 'true') {
      for (const { file, line, severity, id, message, hint } of results) {
        const annotationFile = process.env.GITHUB_WORKSPACE
          ? relative(process.env.GITHUB_WORKSPACE, resolve(target, file)).split(sep).join('/') : file;
        console.error('::' + severity + ' file=' + escapeProperty(annotationFile) + ',line=' + line
          + ',title=' + escapeProperty(id) + '::' + escapeData(message + ' Fix: ' + hint));
      }
    }
    if (results.some(({ severity }) => severity === 'error')) process.exitCode = 1;
  }
} catch (error) {
  console.error('ci-drift: ' + singleLine(error.message));
  process.exitCode = 2;
}

function escapeData(text) {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function singleLine(text) {
  return text.replaceAll('\r', '\\r').replaceAll('\n', '\\n');
}

function escapeProperty(text) {
  return escapeData(text).replaceAll(':', '%3A').replaceAll(',', '%2C');
}
