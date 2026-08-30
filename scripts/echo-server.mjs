// A deterministic target for verifying the send pipeline.
//
// Public echo services are unreliable (httpbin.org was returning 503 during
// development) and send no CORS headers, so the dev runtime cannot call them.
// This server echoes the request back and allows any origin, which turns
// "did the multipart boundary survive" into something observable rather than
// something to squint at.
//
// Development only — never shipped, never contacted by the extension.
//
//   node scripts/echo-server.mjs [port]
//
// Routes:
//   /status/:code   respond with that status
//   /slow?ms=N      respond after N ms (for cancel and timeout)
//   anything else   echo the request as JSON
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8787);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  const status = url.pathname.match(/^\/status\/(\d{3})$/);
  if (status) {
    res.writeHead(Number(status[1]), { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: Number(status[1]), path: url.pathname }));
    return;
  }

  if (url.pathname === '/slow') {
    await sleep(Number(url.searchParams.get('ms') ?? 2000));
  }

  const body = await readBody(req);
  res.writeHead(200, {
    ...cors,
    'Content-Type': 'application/json',
    'X-Echo-Server': 'localrest',
  });
  res.end(
    JSON.stringify(
      {
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: req.headers,
        body,
      },
      null,
      2,
    ),
  );
}).listen(port, () => {
  console.log(`echo server listening on http://localhost:${port}`);
});
