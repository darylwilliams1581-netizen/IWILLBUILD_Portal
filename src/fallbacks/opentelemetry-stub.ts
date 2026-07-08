/**
 * opentelemetry-stub.ts
 *
 * Stub for @opentelemetry/* packages during SSR build.
 * better-auth imports named constants from @opentelemetry/semantic-conventions
 * for its optional instrumentation layer. These are string constants used only
 * when an OpenTelemetry SDK is configured — we never configure one, so returning
 * empty strings is safe and keeps Rollup's named-export resolution happy.
 *
 * Add any additional named exports here if the build reports new missing exports.
 */

// @opentelemetry/semantic-conventions — string attribute keys
export const ATTR_DB_COLLECTION_NAME = 'db.collection.name';
export const ATTR_DB_OPERATION_NAME = 'db.operation.name';
export const ATTR_HTTP_RESPONSE_STATUS_CODE = 'http.response.status_code';
export const ATTR_HTTP_ROUTE = 'http.route';
export const ATTR_DB_SYSTEM = 'db.system';
export const ATTR_DB_STATEMENT = 'db.statement';
export const ATTR_DB_NAME = 'db.name';
export const ATTR_NET_PEER_NAME = 'net.peer.name';
export const ATTR_NET_PEER_PORT = 'net.peer.port';
export const ATTR_HTTP_METHOD = 'http.method';
export const ATTR_HTTP_URL = 'http.url';
export const ATTR_HTTP_STATUS_CODE = 'http.status_code';
export const ATTR_HTTP_TARGET = 'http.target';
export const ATTR_HTTP_HOST = 'http.host';
export const ATTR_HTTP_SCHEME = 'http.scheme';
export const ATTR_HTTP_FLAVOR = 'http.flavor';
export const ATTR_HTTP_USER_AGENT = 'http.user_agent';
export const ATTR_HTTP_REQUEST_CONTENT_LENGTH = 'http.request_content_length';
export const ATTR_HTTP_RESPONSE_CONTENT_LENGTH = 'http.response_content_length';
export const ATTR_RPC_SYSTEM = 'rpc.system';
export const ATTR_RPC_SERVICE = 'rpc.service';
export const ATTR_RPC_METHOD = 'rpc.method';
export const SEMATTRS_DB_SYSTEM = 'db.system';
export const SEMATTRS_DB_STATEMENT = 'db.statement';
export const SEMATTRS_DB_NAME = 'db.name';
export const SEMATTRS_NET_PEER_NAME = 'net.peer.name';
export const SEMATTRS_NET_PEER_PORT = 'net.peer.port';
export const SEMATTRS_HTTP_METHOD = 'http.method';
export const SEMATTRS_HTTP_URL = 'http.url';
export const SEMATTRS_HTTP_STATUS_CODE = 'http.status_code';
export const SEMATTRS_HTTP_TARGET = 'http.target';
export const SEMATTRS_HTTP_HOST = 'http.host';
export const SEMATTRS_HTTP_SCHEME = 'http.scheme';
export const SEMATTRS_HTTP_FLAVOR = 'http.flavor';
export const SEMATTRS_HTTP_USER_AGENT = 'http.user_agent';
export const SEMATTRS_RPC_SYSTEM = 'rpc.system';
export const SEMATTRS_RPC_SERVICE = 'rpc.service';
export const SEMATTRS_RPC_METHOD = 'rpc.method';
export const DBSYSTEMVALUES_MYSQL = 'mysql';
export const DBSYSTEMVALUES_POSTGRESQL = 'postgresql';
export const DBSYSTEMVALUES_SQLITE = 'sqlite';

// @opentelemetry/api — no-op tracer/context/propagation
const NOOP_SPAN = { end: () => {}, setAttribute: () => {}, setStatus: () => {}, recordException: () => {}, isRecording: () => false };

export const trace = {
  getTracer: () => ({
    startSpan: () => NOOP_SPAN,
    // better-auth calls startActiveSpan with 2 or 3 args:
    //   startActiveSpan(name, fn)
    //   startActiveSpan(name, options, fn)
    startActiveSpan: (_name: string, optionsOrFn: unknown, maybeFn?: unknown) => {
      const fn = typeof maybeFn === 'function' ? maybeFn : optionsOrFn;
      if (typeof fn === 'function') return (fn as (span: unknown) => unknown)(NOOP_SPAN);
    },
  }),
  getActiveSpan: () => null,
  setSpan: (_ctx: unknown, _span: unknown) => ({}),
  getSpan: () => null,
};
export const context = {
  active: () => ({}),
  // better-auth calls context.with(ctx, fn, thisArg?, ...args)
  with: (_ctx: unknown, fn: (...a: unknown[]) => unknown, thisArg?: unknown, ...args: unknown[]) => {
    return fn.apply(thisArg, args);
  },
  bind: (_ctx: unknown, fn: unknown) => fn,
  disable: () => {},
};
export const propagation = {
  inject: () => {},
  extract: (_ctx: unknown) => _ctx,
};
export const SpanStatusCode = { OK: 1, ERROR: 2, UNSET: 0 };
export const SpanKind = { INTERNAL: 0, SERVER: 1, CLIENT: 2, PRODUCER: 3, CONSUMER: 4 };
export const diag = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, verbose: () => {} };
export const metrics = { getMeter: () => ({ createCounter: () => ({ add: () => {} }), createHistogram: () => ({ record: () => {} }) }) };

// Default export for any wildcard imports
export default {};
