/**
 * Request-scoped context via AsyncLocalStorage.
 * Carries instanceID (set at start) and user identity (set later by resolveAccess).
 * Every betterstack log automatically includes whatever is in the store.
 */
const { AsyncLocalStorage } = require('node:async_hooks');

const asyncLocal = new AsyncLocalStorage();

/**
 * Start a new request scope. Call from first middleware.
 */
function runWith(req, next) {
  const store = { instanceID: req.instanceID };
  asyncLocal.run(store, () => next());
}

/**
 * Enrich the current request's store with user identity (called from resolveAccess).
 */
function setUser({ userId, email, firstName, lastName, role, accessLevel }) {
  const store = asyncLocal.getStore();
  if (!store) return;
  store.userId = userId;
  store.userEmail = email || undefined;
  store.userName = [firstName, lastName].filter(Boolean).join(' ') || undefined;
  store.userRole = role || undefined;
  store.accessLevel = accessLevel || undefined;
}

/**
 * Get the full store (instanceID + user fields if set).
 */
function getContext() {
  return asyncLocal.getStore();
}

module.exports = { runWith, getContext, setUser };
