'use strict';

/**
 * Log hygiene for the desktop shell.
 *
 * `logs/desktop.jsonl` is the file users are asked to send to support, and the
 * packaged server's stderr can echo an environment variable or an Authorization
 * header verbatim. Anything written there gets truncated and stripped first.
 *
 * This is the single redaction path for the shell. It lives outside main.js so
 * it is unit-testable without booting Electron (the caller injects the paths to
 * mask rather than this module importing `app`), and so the shell stays within
 * its size budget (`npm run audit:filesize`).
 */

/** Cap a log field so one runaway stack trace cannot fill the disk. */
const LOG_TEXT_LIMIT = 8000;

/** Cap for values nested inside a structured entry, which are far more numerous. */
const DIAGNOSTIC_VALUE_LIMIT = 1200;

/** Object keys whose value is never safe to log, whatever it contains. */
const SENSITIVE_KEY_PATTERN = /(api.?key|authorization|bearer|password|secret|token|prompt|image)/i;

function truncateForLog(text, limit = LOG_TEXT_LIMIT) {
  if (typeof text !== 'string') return '';
  const trimmed = text.trim();
  return trimmed.length <= limit
    ? trimmed
    : `${trimmed.slice(0, limit)}… [${trimmed.length - limit} more chars]`;
}

/**
 * Strip anything that looks like a credential.
 *
 * Deliberately pattern-based rather than key-based: server output is
 * unstructured, so the value has to be recognised in prose as well as in
 * `KEY=value` form.
 */
function redactSensitive(text) {
  if (!text) return text;
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[redacted]')
    .replace(/((?:api[-_]?key|token|secret|password|authorization)["'\s:=]+)([^\s"',}]{8,})/gi, '$1[redacted]')
    .replace(/(sk-[A-Za-z0-9]{8,})/g, '[redacted]');
}

/** Everything a raw text field needs: bounded, and safe to hand to support. */
function safeLogText(text) {
  return redactSensitive(truncateForLog(text));
}

/**
 * Build the redactor for structured log details.
 *
 * `getRoots` is a thunk returning `{ path, label }` pairs to mask — a thunk
 * because Electron's app paths are not resolvable until the app is ready, and
 * because it keeps this module free of any Electron import.
 */
function createDiagnosticRedactor(getRoots = () => []) {
  const maskRoots = (text) => {
    let masked = text;
    for (const { path: root, label } of getRoots()) {
      if (root) masked = masked.split(root).join(label);
    }
    return masked;
  };

  return function redactDiagnosticValue(value, depth = 0) {
    if (depth > 5) return '[truncated]';
    if (typeof value === 'string') {
      return redactSensitive(maskRoots(value)).slice(0, DIAGNOSTIC_VALUE_LIMIT);
    }
    if (Array.isArray(value)) {
      return value.slice(0, 50).map((entry) => redactDiagnosticValue(entry, depth + 1));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => (
        [key, SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactDiagnosticValue(entry, depth + 1)]
      )));
    }
    return value;
  };
}

module.exports = {
  LOG_TEXT_LIMIT,
  DIAGNOSTIC_VALUE_LIMIT,
  truncateForLog,
  redactSensitive,
  safeLogText,
  createDiagnosticRedactor,
};
