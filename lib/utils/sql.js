'use strict';

const isPlainObject = require('lodash/isPlainObject');
const SqlString = require('../sql-string');

/**
 * Internal helper used to inline replacements in SQL while avoiding strings, comments, and identifiers.
 *
 * @param {string} sqlString SQL text possibly containing replacements or bind params
 * @param {object} dialect Dialect instance (provides tick chars and name)
 * @param {object|Array} [replacements] named (:{key}) or positional (?) replacements
 * @param {Function} [onBind] optional callback invoked for each bind parameter, should return replacement text
 * @param {object} [options]
 * @param {Function} [options.onPositionalReplacement] optional hook executed when a positional replacement is consumed
 * @returns {string} rewritten SQL
 */
function mapBindParametersAndReplacements(sqlString, dialect, replacements, onBind, options) {
  const isNamedReplacements = isPlainObject(replacements);
  const isPositionalReplacements = Array.isArray(replacements);
  let lastConsumedPositionalReplacementIndex = -1;

  let output = '';

  let currentDollarStringTagName = null;
  let isString = false;
  let isColumn = false;
  let previousSliceEnd = 0;
  let isSingleLineComment = false;
  let isCommentBlock = false;

  for (let i = 0; i < sqlString.length; i++) {
    const char = sqlString[i];

    if (isColumn) {
      if (char === dialect.TICK_CHAR_RIGHT) {
        isColumn = false;
      }

      continue;
    }

    if (isString) {
      if (char === '\'' && !isBackslashEscaped(sqlString, i - 1)) {
        isString = false;
      }

      continue;
    }

    if (currentDollarStringTagName !== null) {
      if (char !== '$') {
        continue;
      }

      const remainingString = sqlString.slice(i, sqlString.length);
      const dollarStringStartMatch = remainingString.match(/^\$(?<name>[a-z_][0-9a-z_])?(\$)/i);
      const tagName = dollarStringStartMatch && dollarStringStartMatch.groups ? dollarStringStartMatch.groups.name : undefined;
      if (currentDollarStringTagName === tagName) {
        currentDollarStringTagName = null;
      }

      continue;
    }

    if (isSingleLineComment) {
      if (char === '\n') {
        isSingleLineComment = false;
      }

      continue;
    }

    if (isCommentBlock) {
      if (char === '*' && sqlString[i + 1] === '/') {
        isCommentBlock = false;
      }

      continue;
    }

    if (char === dialect.TICK_CHAR_LEFT) {
      isColumn = true;
      continue;
    }

    if (char === '\'') {
      isString = true;
      continue;
    }

    if (char === '-' && sqlString.slice(i, i + 3) === '-- ') {
      isSingleLineComment = true;
      continue;
    }

    if (char === '/' && sqlString.slice(i, i + 2) === '/*') {
      isCommentBlock = true;
      continue;
    }

    // either the start of a $bind parameter, or the start of a $tag$string$tag$
    if (char === '$') {
      const previousChar = sqlString[i - 1];

      // we are part of an identifier
      if (/[0-9a-z_]/i.test(previousChar)) {
        continue;
      }

      const remainingString = sqlString.slice(i, sqlString.length);

      const dollarStringStartMatch = remainingString.match(/^\$(?<name>[a-z_][0-9a-z_]*)?\$/i);
      if (dollarStringStartMatch) {
        currentDollarStringTagName = (dollarStringStartMatch.groups && dollarStringStartMatch.groups.name) || '';
        continue;
      }

      if (onBind) {
        // we want to be conservative with what we consider to be a bind parameter to avoid risk of conflict with potential operators
        // users need to add a space before the bind parameter (except after '(', ',', and '=')
        if (previousChar !== undefined && !/[\s(,=]/.test(previousChar)) {
          continue;
        }

        // detect the bind param if it's a valid identifier and followed by characters that end the identifier
        const match = remainingString.match(/^\$(?<name>([a-z_][0-9a-z_]*|[1-9][0-9]*))(?:\)|,|$|\s|::|;)/i);
        const bindParamName = match && match.groups ? match.groups.name : undefined;
        if (!bindParamName) {
          continue;
        }

        // we found a bind parameter
        const newName = onBind(bindParamName);

        // add everything before the bind parameter name
        output += sqlString.slice(previousSliceEnd, i);
        // continue after the bind parameter name
        previousSliceEnd = i + bindParamName.length + 1;

        output += newName;
      }

      continue;
    }

    if (isNamedReplacements && char === ':') {
      const previousChar = sqlString[i - 1];
      // we want to be conservative with what we consider to be a replacement to avoid risk of conflict with potential operators
      // users need to add a space before the bind parameter (except after '(', ',', '=', and '[' (for arrays))
      if (previousChar !== undefined && !/[\s(,=[]/.test(previousChar)) {
        continue;
      }

      const remainingString = sqlString.slice(i, sqlString.length);

      const match = remainingString.match(/^:(?<name>[a-z_][0-9a-z_]*)(?:\)|,|$|\s|::|;|])/i);
      const replacementName = match && match.groups ? match.groups.name : undefined;
      if (!replacementName) {
        continue;
      }

      const replacementValue = replacements[replacementName];
      if (!Object.prototype.hasOwnProperty.call(replacements, replacementName) || replacementValue === undefined) {
        throw new Error(`Named replacement ":${replacementName}" has no entry in the replacement map.`);
      }

      const escapedReplacement = SqlString.escape(replacementValue, undefined, dialect.name, true);

      // add everything before the bind parameter name
      output += sqlString.slice(previousSliceEnd, i);
      // continue after the bind parameter name
      previousSliceEnd = i + replacementName.length + 1;

      output += escapedReplacement;

      continue;
    }

    if (isPositionalReplacements && char === '?') {
      const previousChar = sqlString[i - 1];

      // we want to be conservative with what we consider to be a replacement to avoid risk of conflict with potential operators
      // users need to add a space before the bind parameter (except after '(', ',', '=', and '[' (for arrays))
      if (previousChar !== undefined && !/[\s(,=[]/.test(previousChar)) {
        continue;
      }

      // don't parse ?| and ?& operators as replacements
      const nextChar = sqlString[i + 1];
      if (nextChar === '|' || nextChar === '&') {
        continue;
      }

      if (options && typeof options.onPositionalReplacement === 'function') {
        options.onPositionalReplacement();
      }

      const replacementIndex = ++lastConsumedPositionalReplacementIndex;
      const replacementValue = replacements[lastConsumedPositionalReplacementIndex];

      if (replacementValue === undefined) {
        throw new Error(`Positional replacement (?) ${replacementIndex} has no entry in the replacement map (replacements[${replacementIndex}] is undefined).`);
      }

      const escapedReplacement = SqlString.escape(replacementValue, undefined, dialect.name, true);

      // add everything before the bind parameter name
      output += sqlString.slice(previousSliceEnd, i);
      // continue after the bind parameter name
      previousSliceEnd = i + 1;

      output += escapedReplacement;
    }
  }

  output += sqlString.slice(previousSliceEnd, sqlString.length);

  return output;
}

function isBackslashEscaped(string, pos) {
  let escaped = false;
  for (let i = pos; i >= 0; i--) {
    const char = string[i];
    if (char !== '\\') {
      break;
    }

    escaped = !escaped;
  }

  return escaped;
}

/**
 * Inlines replacements in places where they would be valid SQL values.
 *
 * @param {string} sqlString The SQL that contains the replacements
 * @param {object} dialect The dialect of the SQL
 * @param {object|Array} replacements if provided, this method will replace ':named' replacements & positional replacements (?)
 *
 * @returns {string} The SQL with replacements rewritten in their dialect-specific syntax.
 */
function injectReplacements(sqlString, dialect, replacements, opts) {
  if (replacements == null) {
    return sqlString;
  }

  if (!Array.isArray(replacements) && !isPlainObject(replacements)) {
    throw new TypeError(`"replacements" must be an array or a plain object, but received ${JSON.stringify(replacements)} instead.`);
  }

  return mapBindParametersAndReplacements(sqlString, dialect, replacements, undefined, opts);
}

module.exports = {
  injectReplacements
};


