# Fix for Nginx "400 Request Header Or Cookie Too Large" Error

## Problem
Getting a "400 Request Header Or Cookie Too Large" error from nginx when accessing Chrome debugger endpoints.

## Root Cause
Nginx's default client header buffer sizes are too small to handle the request headers being sent by the Chrome Remote Interface client.

## Solution

### Step 1: Edit Nginx Configuration
Add or modify these directives in your nginx configuration file (usually `/etc/nginx/nginx.conf`) within the `http` block:

```nginx
http {
    # Increase client header buffer size from default 1k to 8k
    client_header_buffer_size 8k;
    
    # Increase large client header buffers from default 4 8k to 8 16k
    large_client_header_buffers 8 16k;
    
    # Optional: Also increase body buffer sizes if needed
    client_body_buffer_size 128k;
    client_max_body_size 10m;
    
    # ... rest of your configuration
}
```

### Step 2: Test Configuration
```bash
# Test nginx configuration
sudo nginx -t

# If test passes, reload nginx
sudo nginx -s reload
# OR restart nginx service
sudo systemctl reload nginx
```

### Step 3: Verify Fix
```bash
# Test the endpoint that was failing
curl -v http://YOUR_SERVER_IP:9222/json

# Or run your test suite
node test-connection.js --host YOUR_SERVER_IP --port 9222
```

## Alternative Values to Try

If the above settings don't work, try progressively larger values:

```nginx
# More conservative increase
client_header_buffer_size 4k;
large_client_header_buffers 4 16k;

# More aggressive increase  
client_header_buffer_size 16k;
large_client_header_buffers 16 32k;

# Maximum increase (use only if absolutely necessary)
client_header_buffer_size 32k;
large_client_header_buffers 32 64k;
```

## Explanation

- `client_header_buffer_size`: Size of buffer used for reading client request header
- `large_client_header_buffers`: Maximum number and size of buffers used for large client headers
- The format is: `large_client_header_buffers <number> <size>;`

## Common Causes
1. Large cookies being sent with requests
2. Many custom headers
3. Long URLs or query parameters  
4. Chrome DevTools Protocol sending extensive debugging headers

## Testing
After applying the fix, the nginx error logs (`/var/log/nginx/error.log`) should no longer show "400 Request Header Or Cookie Too Large" errors.