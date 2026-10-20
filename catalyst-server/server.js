// Speed-test origin for Zoho Catalyst AppSail. The user's browser (speed-test.js)
// times these transfers, so results reflect the *user's* connection:
//   GET  /__down?bytes=N  -> N bytes of zeros (capped)
//   POST /__up            -> drains the body, returns {bytes}
//   GET  /ping            -> {t} for latency
//   GET  /info            -> caller's IP + ISP/geo
// Every request logs one JSON line to stdout, which AppSail shows under Logs.
const http = require('http');

const MAX_BYTES = 100 * 1024 * 1024; // ponytail: per-request cap only, add rate limiting if egress bills hurt
const CHUNK = Buffer.alloc(64 * 1024);
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Timing-Allow-Origin': '*', // lets the extension read DNS/connect timings for these requests
};

const log = (level, fields) => console[level === 'error' ? 'error' : 'log'](JSON.stringify({ ts: new Date().toISOString(), level, ...fields }));

const clientIp = req => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress)
    .split(',')[0].trim().replace(/^::ffff:/, '');

function sendZeros(res, bytes) {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/octet-stream', 'Content-Length': bytes });
    let left = bytes;
    const pump = () => {
        while (left > 0) {
            const n = Math.min(left, CHUNK.length);
            left -= n;
            res.bytesOut = (res.bytesOut || 0) + n;
            if (!res.write(n === CHUNK.length ? CHUNK : CHUNK.subarray(0, n))) return res.once('drain', pump);
        }
        res.end();
    };
    pump();
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const start = Date.now();
    // 'close' also fires when the client aborts mid-download (the extension does this
    // at the end of each test window), so `complete: false` there is normal.
    res.on('close', () => log(res.statusCode >= 500 ? 'error' : 'info', {
        method: req.method, path: url.pathname, status: res.statusCode, ms: Date.now() - start,
        bytesOut: res.bytesOut || 0, bytesIn: req.bytesIn || 0, complete: res.writableFinished,
        ip: clientIp(req), ua: req.headers['user-agent'],
    }));
    if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end();

    if (req.method === 'GET' && url.pathname === '/__down') {
        const bytes = Math.min(Math.max(parseInt(url.searchParams.get('bytes'), 10) || 0, 0), MAX_BYTES);
        return sendZeros(res, bytes);
    }

    if (req.method === 'POST' && url.pathname === '/__up') {
        let bytes = 0;
        req.on('data', c => { bytes += c.length; req.bytesIn = bytes; if (bytes > MAX_BYTES) req.destroy(); });
        req.on('end', () => res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' }).end(JSON.stringify({ bytes })));
        return;
    }

    if (url.pathname === '/info') {
        const ip = clientIp(req);
        const json = body => res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' }).end(JSON.stringify(body));
        return fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(3000) })
            .then(r => r.json())
            .then(g => { if (g.success === false) throw new Error(g.message || 'ipwho.is lookup failed'); return g; })
            .then(g => json({
                ip,
                isp: g.connection?.isp, org: g.connection?.org, asn: g.connection?.asn,
                city: g.city, region: g.region, country: g.country,
                timezone: g.timezone?.id, lat: g.latitude, lon: g.longitude,
                userAgent: req.headers['user-agent'],
            }))
            .catch(e => {
                log('warn', { msg: 'ISP lookup failed', ip, error: e.message });
                json({ ip, userAgent: req.headers['user-agent'] }); // lookup down: still return the IP
            });
    }

    if (url.pathname === '/ping') {
        return res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' }).end(JSON.stringify({ t: Date.now() }));
    }

    res.writeHead(404, CORS).end();
});

// AppSail injects the port via X_ZOHO_CATALYST_LISTEN_PORT.
const port = process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 9000;
if (require.main === module) server.listen(port, () => log('info', { msg: `speed origin on :${port}` }));
module.exports = server;
