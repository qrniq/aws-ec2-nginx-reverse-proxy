#!/usr/bin/env node

/**
 * Mock Chrome Remote Debugger Service
 * 
 * This simulates Chrome's remote debugging protocol endpoints
 * for testing the nginx reverse proxy functionality.
 * 
 * Author: Terragon Labs
 */

const http = require('http');
const WebSocket = require('ws');
const url = require('url');

const PORT = process.env.PORT || 9222;
const HOST = process.env.HOST || '127.0.0.1';
const PROXY_PORT = process.env.PROXY_PORT || 9223;

// Mock Chrome debugger data
const mockTargets = [
    {
        description: "",
        devtoolsFrontendUrl: `/devtools/inspector.html?ws=${HOST}:${PROXY_PORT}/devtools/page/mock-page-1`,
        id: "mock-page-1",
        title: "Mock Test Page",
        type: "page",
        url: "about:blank",
        webSocketDebuggerUrl: `ws://${HOST}:${PROXY_PORT}/devtools/page/mock-page-1`
    },
    {
        description: "",
        devtoolsFrontendUrl: `/devtools/inspector.html?ws=${HOST}:${PROXY_PORT}/devtools/page/mock-page-2`,
        id: "mock-page-2", 
        title: "Another Mock Page",
        type: "page",
        url: "data:text/html,<h1>Test</h1>",
        webSocketDebuggerUrl: `ws://${HOST}:${PROXY_PORT}/devtools/page/mock-page-2`
    }
];

const mockVersion = {
    "Browser": "HeadlessChrome/91.0.4472.77",
    "Protocol-Version": "1.3",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/91.0.4472.77 Safari/537.36",
    "V8-Version": "9.1.269.36",
    "WebKit-Version": "537.36 (@cfede9db1d154de0468cb0538479f34c0755a0f4)",
    "webSocketDebuggerUrl": `ws://${HOST}:${PROXY_PORT}/devtools/browser/mock-browser`
};

// Create HTTP server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - ${req.headers['user-agent'] || 'Unknown'}`);
    
    // Route handling
    switch (parsedUrl.pathname) {
        case '/json':
        case '/json/list':
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(mockTargets, null, 2));
            break;
            
        case '/json/version':
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(mockVersion, null, 2));
            break;
            
        case '/json/protocol':
            // Return a minimal Chrome DevTools Protocol definition
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                version: { major: "1", minor: "3" },
                domains: [
                    {
                        domain: "Runtime",
                        experimental: false,
                        description: "Runtime domain exposes JavaScript runtime by means of remote evaluation and mirror objects. Evaluation results are returned as mirror object that expose object type, string representation and unique identifier that can be used for further object reference."
                    },
                    {
                        domain: "Page", 
                        experimental: false,
                        description: "Actions and events related to the inspected page belong to the page domain."
                    }
                ]
            }, null, 2));
            break;
            
        case '/json/new':
            // Create a new mock target
            const newTarget = {
                description: "",
                devtoolsFrontendUrl: `/devtools/inspector.html?ws=${HOST}:${PROXY_PORT}/devtools/page/mock-page-new`,
                id: `mock-page-${Date.now()}`,
                title: parsedUrl.query.url || "New Tab",
                type: "page", 
                url: parsedUrl.query.url || "about:blank",
                webSocketDebuggerUrl: `ws://${HOST}:${PROXY_PORT}/devtools/page/mock-page-new`
            };
            mockTargets.push(newTarget);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(newTarget, null, 2));
            break;
            
        case '/health':
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Mock Chrome Debugger OK\n');
            break;
            
        default:
            if (parsedUrl.pathname.startsWith('/devtools/')) {
                // Serve a simple DevTools frontend page
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Mock DevTools</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 800px; }
        .status { background: #e8f5e8; padding: 10px; border-radius: 4px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Mock Chrome DevTools</h1>
        <div class="status">
            <strong>Status:</strong> Mock debugger service is running
        </div>
        <p><strong>Endpoint:</strong> ${req.url}</p>
        <p><strong>Available endpoints:</strong></p>
        <ul>
            <li><a href="/json">/json</a> - List debugging targets</li>
            <li><a href="/json/version">/json/version</a> - Browser version info</li>
            <li><a href="/health">/health</a> - Health check</li>
        </ul>
    </div>
</body>
</html>
                `);
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            }
    }
});

// Create WebSocket server for DevTools Protocol
const wss = new WebSocket.Server({ 
    server: server
});

wss.on('connection', (ws, req) => {
    const pathname = url.parse(req.url).pathname;
    console.log(`${new Date().toISOString()} - WebSocket connection: ${pathname}`);
    
    // Mock DevTools Protocol responses
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log(`${new Date().toISOString()} - WebSocket message:`, message);
            
            // Mock response based on method
            let response = {
                id: message.id,
                result: {}
            };
            
            switch (message.method) {
                case 'Runtime.enable':
                    response.result = {};
                    break;
                    
                case 'Runtime.evaluate':
                    if (message.params && message.params.expression === '2 + 2') {
                        response.result = {
                            result: { type: 'number', value: 4 }
                        };
                    } else if (message.params && message.params.expression === 'window.testValue') {
                        response.result = {
                            result: { type: 'number', value: 42 }
                        };
                    } else {
                        response.result = {
                            result: { type: 'string', value: 'Mock result' }
                        };
                    }
                    break;
                    
                case 'Page.enable':
                    response.result = {};
                    // Simulate page load event after a delay
                    setTimeout(() => {
                        ws.send(JSON.stringify({
                            method: 'Page.loadEventFired',
                            params: { timestamp: Date.now() / 1000 }
                        }));
                    }, 100);
                    break;
                    
                case 'Page.navigate':
                    response.result = { frameId: 'mock-frame-id' };
                    break;
                    
                default:
                    response.result = { message: `Mock response for ${message.method}` };
            }
            
            ws.send(JSON.stringify(response));
        } catch (error) {
            console.error('WebSocket message error:', error);
            ws.send(JSON.stringify({
                id: 1,
                error: { code: -32700, message: 'Parse error' }
            }));
        }
    });
    
    ws.on('close', () => {
        console.log(`${new Date().toISOString()} - WebSocket connection closed`);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Start server
server.listen(PORT, HOST, () => {
    console.log(`Mock Chrome Remote Debugger running at http://${HOST}:${PORT}`);
    console.log(`Available endpoints:`);
    console.log(`  http://${HOST}:${PORT}/json - List targets`);
    console.log(`  http://${HOST}:${PORT}/json/version - Version info`);
    console.log(`  http://${HOST}:${PORT}/health - Health check`);
    console.log(`WebSocket endpoints available at ws://${HOST}:${PORT}/devtools/`);
    console.log('\nPress Ctrl+C to stop');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down mock Chrome debugger...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});