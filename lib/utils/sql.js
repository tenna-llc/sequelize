'use strict';

const SqlString = require('../sql-string');
const { escape } = SqlString;

// CVE-2023-25813: prevent replacements inside string literals/comments.
// Upstream commits: ccaa399, 87a6123. We walk the SQL and only replace
// placeholders in plain code (not in quoted strings, comments, dollar-quoted
// blocks). Supports positional (?) and named (:name) replacements.
function injectReplacements(sql, dialect, values) {
  const timeZone = null;
  const isArray = Array.isArray(values);

  const getPositional = () => {
    if (!values.length) {
      return '?';
    }
    return escape(values.shift(), timeZone, dialect, true);
  };

  const getNamed = key => {
    if (values[key] !== undefined) {
      return escape(values[key], timeZone, dialect, true);
    }
    throw new Error(`Named parameter "${key}" has no value in the given object.`);
  };

  let out = '';
  let i = 0;
  let state = 'plain';
  let dollarQuote = null;

  const isIdentifierStart = ch => /[a-zA-Z_]/.test(ch);
  const isIdentifierPart = ch => /[a-zA-Z0-9_]/.test(ch);

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (state === 'line-comment') {
      out += ch;
      if (ch === '\n') state = 'plain';
      i += 1;
      continue;
    }

    if (state === 'block-comment') {
      out += ch;
      if (ch === '*' && next === '/') {
        out += '/';
        i += 2;
        state = 'plain';
        continue;
      }
      i += 1;
      continue;
    }

    if (state === 'single-quote') {
      out += ch;
      if (ch === "'" && sql[i - 1] !== '\\') state = 'plain';
      i += 1;
      continue;
    }

    if (state === 'double-quote') {
      out += ch;
      if (ch === '"' && sql[i - 1] !== '\\') state = 'plain';
      i += 1;
      continue;
    }

    if (state === 'backtick') {
      out += ch;
      if (ch === '`' && sql[i - 1] !== '\\') state = 'plain';
      i += 1;
      continue;
    }

    if (state === 'dollar-quote') {
      out += ch;
      if (sql.startsWith(dollarQuote, i)) {
        out += dollarQuote.slice(1);
        i += dollarQuote.length;
        state = 'plain';
        continue;
      }
      i += 1;
      continue;
    }

    // plain
    if (ch === '-' && next === '-') {
      out += ch + next;
      i += 2;
      state = 'line-comment';
      continue;
    }

    if (ch === '/' && next === '*') {
      out += ch + next;
      i += 2;
      state = 'block-comment';
      continue;
    }

    if (ch === "'") {
      out += ch;
      state = 'single-quote';
      i += 1;
      continue;
    }

    if (ch === '"') {
      out += ch;
      state = 'double-quote';
      i += 1;
      continue;
    }

    if (ch === '`') {
      out += ch;
      state = 'backtick';
      i += 1;
      continue;
    }

    if (ch === '$') {
      const match = sql.slice(i).match(/^\$[a-zA-Z0-9_]*\$/);
      if (match) {
        dollarQuote = match[0];
        out += dollarQuote;
        i += dollarQuote.length;
        state = 'dollar-quote';
        continue;
      }
    }

    if (isArray && ch === '?') {
      out += getPositional();
      i += 1;
      continue;
    }

    if (!isArray && ch === ':' && next && next !== ':' && isIdentifierStart(next)) {
      let j = i + 1;
      while (j < sql.length && isIdentifierPart(sql[j])) {
        j += 1;
      }
      const key = sql.slice(i + 1, j);
      out += getNamed(key);
      i = j;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

module.exports = { injectReplacements };

