# Chrome Debugger Nginx Reverse Proxy

A production-ready nginx reverse proxy configuration for Chrome remote debugging with full WebSocket support on AWS EC2 Amazon Linux 2023.

## Overview

This solution provides external access to Chrome's remote debugging interface through nginx, enabling secure and stable connections to Chrome DevTools from anywhere on the internet. The proxy automatically handles WebSocket upgrades, connection management, and provides proper error handling.

**Key Features:**
- ✅ Full WebSocket support for Chrome DevTools Protocol
- ✅ Dynamic port configuration (Chrome port + 1)
- ✅ AWS EC2 Amazon Linux 2023 optimized
- ✅ Comprehensive error handling
- ✅ Security headers and access controls
- ✅ Automatic installation and service management
- ✅ Detailed logging and monitoring

## Quick Start

### 1. Installation

Clone this repository and run the installation script:

```bash
git clone <repository-url>
cd aws-ec2-nginx-reverse-proxy
sudo ./install.sh
```

### 2. Start Chrome Debugging

```bash
# Start Chrome debugger service
sudo systemctl start chrome-debug

# Or use the standalone script
./start-chrome.sh
```

### 3. Access Chrome DevTools

- **Local access:** `http://localhost:9223`
- **External access:** `http://YOUR_EC2_PUBLIC_IP:9223`
- **DevTools UI:** `http://YOUR_EC2_PUBLIC_IP:9223/devtools/inspector.html`

## Architecture

```
Internet → EC2 Security Group → Nginx (:9223) → Chrome Debugger (:9222)
                                   ↓
                              WebSocket Upgrade
                              Connection Management
                              Error Handling
```

## Configuration Files

| File | Purpose |
|------|---------|
| `nginx.conf` | Main nginx configuration with WebSocket optimizations |
| `chrome-debugger.conf` | Chrome debugger proxy server block |
| `install.sh` | Automated installation script for Amazon Linux 2023 |
| `start-chrome.sh` | Chrome startup script with debugging enabled |

## Default Port Configuration

- **Chrome Debugger:** Port 9222
- **Nginx Proxy:** Port 9223 (Chrome port + 1)

To use different ports, set the `CHROME_PORT` environment variable:

```bash
export CHROME_PORT=9333
sudo ./install.sh  # Nginx will listen on port 9334
```

## Advanced Usage

### Custom Port Configuration

```bash
# Start Chrome on port 9333 (nginx will proxy on 9334)
./start-chrome.sh --port 9333

# Run with GUI (non-headless)
./start-chrome.sh --gui

# Check status
./start-chrome.sh --status

# Kill Chrome processes
./start-chrome.sh --kill
```

### Service Management

```bash
# Chrome debugging service
sudo systemctl start chrome-debug    # Start
sudo systemctl stop chrome-debug     # Stop  
sudo systemctl status chrome-debug   # Status
sudo systemctl enable chrome-debug   # Enable on boot

# Nginx service
sudo systemctl restart nginx
sudo systemctl status nginx
```

### Monitoring and Logs

```bash
# Chrome debugger logs
sudo journalctl -u chrome-debug -f

# Nginx access logs
sudo tail -f /var/log/nginx/chrome_debugger_access.log

# Nginx error logs  
sudo tail -f /var/log/nginx/chrome_debugger_error.log

# WebSocket connection logs
sudo tail -f /var/log/nginx/chrome_ws_access.log
```

## Security Configuration

### EC2 Security Group

Ensure your EC2 security group allows inbound traffic on the nginx port:

```bash
# For default configuration (port 9223)
aws ec2 authorize-security-group-ingress \
    --group-id sg-xxxxxxxxx \
    --protocol tcp \
    --port 9223 \
    --cidr 0.0.0.0/0
```

### Nginx Security Features

The configuration includes several security measures:
- Custom error pages to prevent information disclosure
- Security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection)
- Connection limits and timeouts
- Access logging for monitoring

## Troubleshooting

### Common Issues

**Chrome won't start:**
```bash
# Check if Chrome is already running
./start-chrome.sh --status

# Kill existing processes
./start-chrome.sh --kill

# Check system resources
free -h
df -h
```

**Nginx connection errors:**
```bash
# Test nginx configuration
sudo nginx -t

# Check if Chrome debugger is accessible
curl http://localhost:9222/json

# Verify ports are not in use
sudo netstat -tlnp | grep 9222
sudo netstat -tlnp | grep 9223
```

**WebSocket connection failures:**
```bash
# Check nginx error logs
sudo tail -f /var/log/nginx/error.log

# Test WebSocket connection
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: test" \
     http://localhost:9223/ws
```

### Firewall Issues

**Amazon Linux 2023 Firewall:**
```bash
# Check firewall status
sudo systemctl status firewalld

# Open nginx port
sudo firewall-cmd --permanent --add-port=9223/tcp
sudo firewall-cmd --reload
```

**SELinux Issues:**
```bash
# Check SELinux status
getenforce

# Allow nginx network connections
sudo setsebool -P httpd_can_network_connect 1
sudo setsebool -P httpd_can_network_relay 1
```

## Performance Tuning

### For High Traffic

Edit `/etc/nginx/nginx.conf`:
```nginx
worker_processes auto;
worker_connections 2048;
```

### For Long Debugging Sessions

Edit `chrome-debugger.conf`:
```nginx
proxy_send_timeout 1800s;    # 30 minutes
proxy_read_timeout 1800s;    # 30 minutes
```

## API Endpoints

The proxy exposes all Chrome DevTools Protocol endpoints:

| Endpoint | Purpose |
|----------|---------|
| `/json` | List of inspectable targets |
| `/json/version` | Chrome version information |
| `/json/protocol` | DevTools protocol specification |
| `/devtools/` | DevTools frontend interface |
| `/ws/*` | WebSocket debugging connections |

## Development and Testing

### Node.js Remote Connection Testing

This repository includes a comprehensive Node.js test application that verifies Chrome debugger connectivity through the nginx reverse proxy using the `chrome-remote-interface` library.

#### Installation

```bash
# Install Node.js dependencies
npm install

# Make test script executable
chmod +x test-connection.js
```

#### Basic Usage

```bash
# Run full test suite (default: localhost:9223)
npm test

# Run with verbose output
npm run test:verbose

# Test specific functionality
npm run test:connectivity    # Basic connectivity test
npm run test:websocket      # WebSocket connection test  
npm run test:javascript     # JavaScript execution test
npm run test:navigation     # Page navigation test

# List available Chrome debugging targets
npm run list-targets
```

#### Advanced Usage

```bash
# Test remote Chrome debugger
node test-connection.js --host YOUR_EC2_IP --port 9223

# Test with custom timeout
node test-connection.js --timeout 15000 --verbose

# Test specific target ID
node test-connection.js --target "page_id_here"

# Quick connectivity check
node test-connection.js --test connectivity --host remote-server.com
```

#### Test Application Features

The Node.js test application (`test-connection.js`) provides:

- **Connectivity Testing**: Verifies basic HTTP connection to Chrome debugger
- **WebSocket Testing**: Tests WebSocket upgrade and bidirectional communication
- **JavaScript Execution**: Validates remote JavaScript execution capabilities
- **Page Navigation**: Tests page loading and DOM manipulation
- **Target Management**: Lists and connects to specific Chrome debugging targets
- **Comprehensive Reporting**: Detailed test results with timing and error information
- **Remote Testing**: Full support for testing external Chrome debugger instances

#### Example Output

```
[2024-01-01T12:00:00.000Z] [INFO] === Chrome Remote Debugger Connection Test Suite ===
[2024-01-01T12:00:00.001Z] [INFO] Target: your-ec2-server.com:9223  
[2024-01-01T12:00:00.002Z] [INFO] Timeout: 10000ms

[2024-01-01T12:00:00.100Z] [INFO] Testing connectivity to your-ec2-server.com:9223
[2024-01-01T12:00:00.250Z] [SUCCESS] ✓ Successfully connected to Chrome debugger
[2024-01-01T12:00:00.251Z] [INFO] Found 2 available targets

[2024-01-01T12:00:00.300Z] [INFO] Testing WebSocket connection...
[2024-01-01T12:00:00.450Z] [SUCCESS] ✓ WebSocket connection established
[2024-01-01T12:00:00.500Z] [SUCCESS] ✓ Runtime domain enabled

[2024-01-01T12:00:00.600Z] [INFO] Testing JavaScript execution...
[2024-01-01T12:00:00.700Z] [SUCCESS] ✓ JavaScript execution successful: 2 + 2 = 4

[2024-01-01T12:00:00.800Z] [INFO] Testing page navigation...
[2024-01-01T12:00:01.000Z] [SUCCESS] ✓ Page navigation and script execution successful

=== Test Report ===
Duration: 1000ms
Tests: 4/4 passed

Test Results:
  ✓ PASS Connectivity
  ✓ PASS Websocket  
  ✓ PASS Javascript
  ✓ PASS Navigation

🎉 All tests passed! Chrome debugger is working correctly through nginx proxy.
```

### Local Testing

```bash
# Test local connectivity
curl http://localhost:9223/health
curl http://localhost:9223/json | python3 -m json.tool

# Test WebSocket upgrade
websocat ws://localhost:9223/ws/path/to/target

# Node.js comprehensive test
npm test
```

### External Testing

```bash
# Test from external machine
curl http://YOUR_EC2_IP:9223/health
curl http://YOUR_EC2_IP:9223/json

# Node.js remote connectivity test
node test-connection.js --host YOUR_EC2_IP --port 9223 --verbose
```

## Contributing

This project was created by Terragon Labs. For issues and improvements:

1. Check existing configurations work with your setup
2. Test changes with both local and remote connections  
3. Verify WebSocket functionality with actual Chrome DevTools
4. Update documentation for any configuration changes

## License

Copyright © 2024 Terragon Labs. All rights reserved.