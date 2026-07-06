// Root-level launcher required by the publish platform's fast-path deploy.
// The platform detects "pre-built artifacts" by looking for server.bundle.mjs
// at the app root (/app/server.bundle.mjs) and starts it with:
//   node ./server.bundle.mjs
//
// The actual bundle lives in dist/ alongside its bin/ chunk directory.
// This file simply imports it — Node resolves the relative path correctly
// so all dist/bin/*.js chunks load from dist/bin/ as expected.
import './dist/server.bundle.mjs';
