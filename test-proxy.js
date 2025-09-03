#!/usr/bin/env node

/**
 * Test Proxy Server for Chrome Debugger
 * 
 * This proxy server simulates the nginx behavior but runs in Node.js
 * to test if our header buffer configuration fixes the 400 error.
 * 
 * It proxies requests from port 9223 to the mock Chrome debugger on port 9222
 */

const http = require('http');
const httpProxy = require('http-proxy');
const url = require('url');

const PROXY_PORT = 9223;
const TARGET_PORT = 9222;

console.log('Creating proxy server...');

// Create a proxy server
const proxy = httpProxy.createProxyServer({
    target: `http://localhost:${TARGET_PORT}`,
    ws: true, // Enable WebSocket proxying
    changeOrigin: true,
    timeout: 300000, // 5 minutes timeout
    proxyTimeout: 300000,
    headers: {
        // Add custom headers if needed
    }
});

// Create HTTP server
const server = http.createServer((req, res) => {
    const startTime = Date.now();
    
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log(`Headers: ${JSON.stringify(req.headers, null, 2)}`);
    
    // Check if this would trigger the nginx "Request Header Or Cookie Too Large" error
    const headerSize = JSON.stringify(req.headers).length;
    console.log(`Request header size: ${headerSize} bytes`);
    
    // Simulate nginx buffer limits (without our fix)
    // Default nginx: client_header_buffer_size 1k, large_client_header_buffers 4 8k
    const defaultHeaderBufferSize = 1024; // 1k
    const defaultLargeBuffers = 4 * 8 * 1024; // 4 * 8k = 32k
    
    if (headerSize > defaultHeaderBufferSize && headerSize > defaultLargeBuffers) {
        console.log(`❌ Would fail with default nginx settings (header size ${headerSize} > ${defaultLargeBuffers})`);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<html>
<head><title>400 Request Header Or Cookie Too Large</title></head>
<body>
<center><h1>400 Bad Request</h1></center>
<center>Request Header Or Cookie Too Large</center>
<hr><center>nginx/1.28.0</center>
</body>
</html>`);
        return;
    }
    
    // Simulate our fixed nginx settings
    const fixedHeaderBufferSize = 16 * 1024; // 16k
    const fixedLargeBuffers = 16 * 32 * 1024; // 16 * 32k = 512k
    
    if (headerSize > fixedLargeBuffers) {
        console.log(`❌ Would still fail with our fixed nginx settings (header size ${headerSize} > ${fixedLargeBuffers})`);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<html>
<head><title>400 Request Header Or Cookie Too Large</title></head>
<body>
<center><h1>400 Bad Request</h1></center>
<center>Request Header Or Cookie Too Large (even with increased buffers)</center>
<hr><center>nginx/1.28.0</center>
</body>
</html>`);
        return;
    }
    
    console.log(`✅ Headers acceptable with our nginx fix (${headerSize} bytes < ${fixedLargeBuffers} bytes)`);
    
    // Proxy the request
    proxy.web(req, res, {}, (err) => {
        console.error('Proxy error:', err);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway: Could not proxy request');
    });
});

// Handle WebSocket upgrades
server.on('upgrade', (req, socket, head) => {
    console.log(`${new Date().toISOString()} - WebSocket upgrade: ${req.url}`);
    
    proxy.ws(req, socket, head, {}, (err) => {
        console.error('WebSocket proxy error:', err);
        socket.end();
    });
});

// Handle proxy errors
proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err);
    if (res && !res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error: Proxy failed');
    }
});

// Start server
server.listen(PROXY_PORT, 'localhost', () => {
    console.log(`Test proxy server running on http://localhost:${PROXY_PORT}`);
    console.log(`Proxying to mock Chrome debugger on http://localhost:${TARGET_PORT}`);
    console.log(`\nThis proxy simulates nginx with our header buffer fixes:`);
    console.log(`- client_header_buffer_size: 16k`);
    console.log(`- large_client_header_buffers: 16 32k`);
    console.log(`\nTest endpoints:`);
    console.log(`- http://localhost:${PROXY_PORT}/json`);
    console.log(`- http://localhost:${PROXY_PORT}/health`);
    console.log(`\nPress Ctrl+C to stop`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down test proxy server...');
    server.close(() => {
        console.log('Proxy server closed');
        process.exit(0);
    });
});