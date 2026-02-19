/**
 * Better Stack log helper. Sends logs to Better Stack (fire-and-forget).
 * Uses BETTERSTACK_KEY from env. Set BETTERSTACK_URL to override the ingest endpoint.
 * When running inside a request, requestContext.getContext() provides instanceID for the session.
 */
const requestContext = require('./requestContext');

const BETTERSTACK_URL =
  process.env.BETTERSTACK_URL || 'https://s1744640.eu-fsn-3.betterstackdata.com';
const BETTERSTACK_KEY = process.env.BETTERSTACK_KEY;

function utcTimestamp() {
  return new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');
}

/**
 * Send a log event to Better Stack. Non-blocking; failures are ignored.
 * @param {string} message - Log message
 * @param {Object} [options] - Optional: level, context, error
 * @param {'info'|'warn'|'error'|'debug'} [options.level] - Log level (default: 'info')
 * @param {Object} [options.context] - Extra key-value context (e.g. { route: '/api/cases', userId: '...' })
 * @param {Error|string} [options.error] - Error instance or message (for stack trace when Error)
 */
function send(message, options = {}) {
  if (!BETTERSTACK_KEY) return;

  const { level = 'info', context = {}, error } = options;
  const reqContext = requestContext.getContext() || {};
  const body = {
    dt: utcTimestamp(),
    message,
    level,
    ...reqContext, // instanceID from current request (if any)
    ...context,
  };

  if (error !== undefined) {
    if (error instanceof Error) {
      body.error_message = error.message;
      if (error.stack) body.error_stack = error.stack;
    } else {
      body.error_message = String(error);
    }
  }

  fetch(BETTERSTACK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BETTERSTACK_KEY}`,
    },
    body: JSON.stringify(body),
  }).catch(() => {
    // Fire-and-forget: do not log to console or rethrow
  });
}

/** Log levels as helpers */
function info(message, context = {}) {
  send(message, { level: 'info', context });
}

function warn(message, context = {}) {
  send(message, { level: 'warn', context });
}

function error(message, contextOrError = {}) {
  const isError = contextOrError instanceof Error;
  send(message, {
    level: 'error',
    ...(isError ? { error: contextOrError } : { context: contextOrError }),
  });
}

function debug(message, context = {}) {
  send(message, { level: 'debug', context });
}

/**
 * Log an API error with route and optional err. Still calls console.error locally.
 * @param {string} route - e.g. 'POST /api/cases'
 * @param {Error|unknown} err - Caught error
 * @param {Object} [extra] - Extra context (e.g. { caseId, userId })
 */
function logApiError(route, err, extra = {}) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(route, err);
  send(`${route} failed: ${msg}`, {
    level: 'error',
    error: err instanceof Error ? err : undefined,
    context: {
      route,
      error_message: msg,
      ...extra,
    },
  });
}

module.exports = {
  send,
  info,
  warn,
  error,
  debug,
  logApiError,
};
