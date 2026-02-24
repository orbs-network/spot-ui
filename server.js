const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const GAMMA_API = 'gamma-api.polymarket.com';

const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
};

const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url);

    // Proxy /api/* -> gamma-api.polymarket.com/*
    if (parsed.pathname.startsWith('/api/')) {
        const apiPath = parsed.pathname.replace('/api', '') + (parsed.search || '');
        const options = {
            hostname: GAMMA_API,
            path: apiPath,
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        };

        const proxy = https.request(options, (apiRes) => {
            res.writeHead(apiRes.statusCode, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
            apiRes.pipe(res);
        });

        proxy.on('error', (err) => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        });

        proxy.end();
        return;
    }

    // Serve static files
    let filePath = parsed.pathname === '/' ? '/dashboard.html' : parsed.pathname;
    filePath = path.join(__dirname, filePath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`Dashboard: http://localhost:${PORT}`);
});
