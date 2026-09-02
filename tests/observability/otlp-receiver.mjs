// In-process OTLP/HTTP receiver used by the focused preload/bootstrap tests.
//
// The shared Node observability runtime exports traces through
// @opentelemetry/exporter-trace-otlp-http, which in the installed version
// serializes OTLP/HTTP JSON (Content-Type: application/json). This receiver
// accepts those payloads, flattens them into a simple span/resource model the
// tests can assert on, and records every request (including non-trace probe
// requests) for debugging.
//
// The server deliberately answers 200 with an empty body for every request so
// the OpenTelemetry exporters never treat the test as a failure or a retry.

import { createServer } from 'node:http';

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function scalarFromValue(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of ['stringValue', 'boolValue', 'intValue', 'doubleValue']) {
      if (key in value) {
        return value[key];
      }
    }
    return JSON.stringify(value);
  }
  return String(value ?? '');
}

function attributesToRecord(attributes = []) {
  const record = {};
  for (const attribute of attributes) {
    record[attribute.key] = scalarFromValue(attribute.value);
  }
  return record;
}

function decodeTracePayload(payload) {
  const spans = [];
  let resource = null;
  for (const resourceSpans of payload.resourceSpans ?? []) {
    if (resource === null) {
      resource = {
        attributes: attributesToRecord(resourceSpans.resource?.attributes),
      };
    }
    for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
      for (const span of scopeSpans.spans ?? []) {
        spans.push({
          name: span.name,
          kind: span.kind,
          attributes: attributesToRecord(span.attributes),
        });
      }
    }
  }
  return { resource, spans };
}

export async function startOtlpReceiver() {
  const state = {
    requests: [],
    spans: [],
    resource: null,
    errors: [],
  };
  const sockets = new Set();

  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    if (req.method === 'POST' && req.url.endsWith('/v1/traces')) {
      if (req.headers['content-type'] !== 'application/json') {
        state.errors.push({
          url: req.url,
          contentType: req.headers['content-type'],
          bodyLength: body.length,
          error:
            'unexpected trace content type (shared runtime exports OTLP/HTTP JSON)',
        });
      } else if (body.length > 0) {
        try {
          const decoded = decodeTracePayload(JSON.parse(body.toString('utf8')));
          state.resource ??= decoded.resource;
          state.spans.push(...decoded.spans);
        } catch (error) {
          state.errors.push({
            url: req.url,
            contentType: req.headers['content-type'],
            bodyLength: body.length,
            error: String(error && error.stack ? error.stack : error),
          });
        }
      }
      state.requests.push({
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        contentEncoding: req.headers['content-encoding'],
        bodyLength: body.length,
      });
    } else {
      state.requests.push({ method: req.method, url: req.url });
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  const port = await listen(server, 0);

  return {
    url: `http://127.0.0.1:${port}`,

    async waitFor(predicate, { message, timeoutMs = 30_000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (predicate(state)) {
          return;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
      const names = state.spans.map((span) => span.name).join(', ');
      throw new Error(
        `Timed out waiting for ${message}. Captured span names: ${names || '(none)'}`,
      );
    },

    get requests() {
      return state.requests;
    },
    get spans() {
      return state.spans;
    },
    get resource() {
      return state.resource;
    },
    get errors() {
      return state.errors;
    },

    close() {
      return new Promise((resolveClose) => {
        server.close(() => resolveClose());
        for (const socket of sockets) {
          socket.destroy();
        }
      });
    },
  };
}
