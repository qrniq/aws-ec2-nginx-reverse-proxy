#!/usr/bin/env node

/**
 * Chrome Remote Debugger Connection Test
 * 
 * This Node.js application tests remote connectivity to Chrome debugger
 * through the nginx reverse proxy using chrome-remote-interface.
 * 
 * Usage:
 *   node test-connection.js [options]
 * 
 * Author: Terragon Labs
 */

const CDP = require('chrome-remote-interface');
const { program } = require('commander');
const chalk = require('chalk');

// Default configuration
const DEFAULT_CONFIG = {
    host: 'localhost',
    port: 9223,
    timeout: 10000,
    verbose: false
};

class ChromeDebuggerTester {
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.client = null;
        this.startTime = null;
    }

    /**
     * Log messages with colors and timestamps
     */
    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        
        switch (level) {
            case 'info':
                console.log(chalk.blue(prefix), message);
                break;
            case 'success':
                console.log(chalk.green(prefix), message);
                break;
            case 'warn':
                console.log(chalk.yellow(prefix), message);
                break;
            case 'error':
                console.log(chalk.red(prefix), message);
                break;
            case 'debug':
                if (this.config.verbose) {
                    console.log(chalk.gray(prefix), message);
                }
                break;
        }

        if (data && this.config.verbose) {
            console.log(chalk.gray('  Data:'), JSON.stringify(data, null, 2));
        }
    }

    /**
     * Test basic connectivity to Chrome debugger
     */
    async testConnectivity() {
        this.log('info', `Testing connectivity to ${this.config.host}:${this.config.port}`);
        
        try {
            // List available targets
            const targets = await CDP.List({
                host: this.config.host,
                port: this.config.port,
                timeout: this.config.timeout
            });

            this.log('success', `✓ Successfully connected to Chrome debugger`);
            this.log('info', `Found ${targets.length} available targets`);
            
            if (this.config.verbose) {
                targets.forEach((target, index) => {
                    this.log('debug', `Target ${index + 1}:`, {
                        id: target.id,
                        title: target.title,
                        url: target.url,
                        type: target.type,
                        webSocketDebuggerUrl: target.webSocketDebuggerUrl
                    });
                });
            }

            return { success: true, targets };
        } catch (error) {
            this.log('error', `✗ Failed to connect to Chrome debugger: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test WebSocket connection to a specific target
     */
    async testWebSocketConnection(targetId = null) {
        this.log('info', 'Testing WebSocket connection...');
        
        try {
            // Get available targets if no specific target provided
            let target = null;
            if (!targetId) {
                const targets = await CDP.List({
                    host: this.config.host,
                    port: this.config.port,
                    timeout: this.config.timeout
                });
                
                target = targets.find(t => t.type === 'page') || targets[0];
                if (!target) {
                    throw new Error('No suitable target found for WebSocket connection');
                }
            } else {
                target = { id: targetId };
            }

            this.log('info', `Connecting to target: ${target.id}`);

            // Establish WebSocket connection
            this.client = await CDP({
                host: this.config.host,
                port: this.config.port,
                target: target.id,
                timeout: this.config.timeout
            });

            this.log('success', '✓ WebSocket connection established');

            // Enable runtime domain for testing
            await this.client.Runtime.enable();
            this.log('success', '✓ Runtime domain enabled');

            return { success: true, client: this.client, target };
        } catch (error) {
            this.log('error', `✗ WebSocket connection failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test JavaScript execution through debugger
     */
    async testJavaScriptExecution() {
        if (!this.client) {
            this.log('error', 'No active WebSocket connection for JavaScript execution test');
            return { success: false, error: 'No active connection' };
        }

        this.log('info', 'Testing JavaScript execution...');
        
        try {
            const expression = '2 + 2';
            const result = await this.client.Runtime.evaluate({
                expression: expression,
                returnByValue: true
            });

            if (result.result.value === 4) {
                this.log('success', `✓ JavaScript execution successful: ${expression} = ${result.result.value}`);
                return { success: true, result: result.result.value };
            } else {
                throw new Error(`Unexpected result: ${result.result.value}`);
            }
        } catch (error) {
            this.log('error', `✗ JavaScript execution failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test navigation functionality
     */
    async testNavigation() {
        if (!this.client) {
            this.log('error', 'No active WebSocket connection for navigation test');
            return { success: false, error: 'No active connection' };
        }

        this.log('info', 'Testing page navigation...');
        
        try {
            // Enable Page domain
            await this.client.Page.enable();
            this.log('debug', 'Page domain enabled');

            // Navigate to a test page
            const testUrl = 'data:text/html,<html><head><title>Chrome Debugger Test</title></head><body><h1>Test Page</h1><script>window.testValue = 42;</script></body></html>';
            
            await this.client.Page.navigate({ url: testUrl });
            this.log('debug', `Navigation initiated to: ${testUrl.substring(0, 50)}...`);

            // Wait for page load
            await new Promise((resolve) => {
                this.client.Page.loadEventFired(resolve);
            });

            // Verify navigation by checking the test value
            const result = await this.client.Runtime.evaluate({
                expression: 'window.testValue',
                returnByValue: true
            });

            if (result.result.value === 42) {
                this.log('success', '✓ Page navigation and script execution successful');
                return { success: true };
            } else {
                throw new Error('Navigation test failed - test value not found');
            }
        } catch (error) {
            this.log('error', `✗ Navigation test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Run comprehensive test suite
     */
    async runFullTest() {
        this.startTime = Date.now();
        this.log('info', '=== Chrome Remote Debugger Connection Test Suite ===');
        this.log('info', `Target: ${this.config.host}:${this.config.port}`);
        this.log('info', `Timeout: ${this.config.timeout}ms`);
        console.log('');

        const results = {
            connectivity: { success: false },
            websocket: { success: false },
            javascript: { success: false },
            navigation: { success: false }
        };

        try {
            // Test 1: Basic connectivity
            results.connectivity = await this.testConnectivity();
            if (!results.connectivity.success) {
                return this.generateReport(results);
            }

            // Test 2: WebSocket connection
            results.websocket = await this.testWebSocketConnection();
            if (!results.websocket.success) {
                return this.generateReport(results);
            }

            // Test 3: JavaScript execution
            results.javascript = await this.testJavaScriptExecution();

            // Test 4: Page navigation
            results.navigation = await this.testNavigation();

            return this.generateReport(results);

        } catch (error) {
            this.log('error', `Test suite failed unexpectedly: ${error.message}`);
            return this.generateReport(results);
        } finally {
            // Cleanup
            if (this.client) {
                try {
                    await this.client.close();
                    this.log('debug', 'WebSocket connection closed');
                } catch (error) {
                    this.log('warn', `Failed to close connection cleanly: ${error.message}`);
                }
            }
        }
    }

    /**
     * Generate and display test report
     */
    generateReport(results) {
        const duration = Date.now() - this.startTime;
        const totalTests = Object.keys(results).length;
        const passedTests = Object.values(results).filter(r => r.success).length;
        
        console.log('');
        this.log('info', '=== Test Report ===');
        console.log(chalk.cyan(`Duration: ${duration}ms`));
        console.log(chalk.cyan(`Tests: ${passedTests}/${totalTests} passed`));
        console.log('');

        // Individual test results
        console.log(chalk.bold('Test Results:'));
        Object.entries(results).forEach(([test, result]) => {
            const status = result.success ? chalk.green('✓ PASS') : chalk.red('✗ FAIL');
            const testName = test.charAt(0).toUpperCase() + test.slice(1).replace(/([A-Z])/g, ' $1');
            console.log(`  ${status} ${testName}`);
            
            if (!result.success && result.error) {
                console.log(chalk.red(`    Error: ${result.error}`));
            }
        });

        console.log('');

        // Overall result
        const allPassed = passedTests === totalTests;
        if (allPassed) {
            this.log('success', '🎉 All tests passed! Chrome debugger is working correctly through nginx proxy.');
        } else {
            this.log('error', `❌ ${totalTests - passedTests} test(s) failed. Please check the nginx and Chrome configuration.`);
        }

        return {
            success: allPassed,
            results,
            duration,
            passedTests,
            totalTests
        };
    }

    /**
     * Test specific functionality
     */
    async testSpecific(testType) {
        this.log('info', `Running specific test: ${testType}`);
        
        switch (testType) {
            case 'connectivity':
                return await this.testConnectivity();
            case 'websocket':
                return await this.testWebSocketConnection();
            case 'javascript':
                const wsResult = await this.testWebSocketConnection();
                if (wsResult.success) {
                    return await this.testJavaScriptExecution();
                }
                return wsResult;
            case 'navigation':
                const navWsResult = await this.testWebSocketConnection();
                if (navWsResult.success) {
                    return await this.testNavigation();
                }
                return navWsResult;
            default:
                this.log('error', `Unknown test type: ${testType}`);
                return { success: false, error: 'Unknown test type' };
        }
    }
}

// CLI Configuration
program
    .name('test-connection')
    .description('Test Chrome remote debugger connection through nginx proxy')
    .version('1.0.0')
    .option('-h, --host <host>', 'Chrome debugger host (nginx proxy)', DEFAULT_CONFIG.host)
    .option('-p, --port <port>', 'Chrome debugger port (nginx proxy)', (val) => parseInt(val), DEFAULT_CONFIG.port)
    .option('-t, --timeout <ms>', 'Connection timeout in milliseconds', (val) => parseInt(val), DEFAULT_CONFIG.timeout)
    .option('-v, --verbose', 'Enable verbose logging', DEFAULT_CONFIG.verbose)
    .option('--test <type>', 'Run specific test (connectivity|websocket|javascript|navigation)')
    .option('--list-targets', 'List available debugging targets')
    .option('--target <id>', 'Connect to specific target ID');

program.parse();

const options = program.opts();

// Main execution
async function main() {
    const tester = new ChromeDebuggerTester({
        host: options.host,
        port: options.port,
        timeout: options.timeout,
        verbose: options.verbose
    });

    try {
        if (options.listTargets) {
            const result = await tester.testConnectivity();
            if (result.success && result.targets) {
                console.log('\nAvailable targets:');
                result.targets.forEach((target, index) => {
                    console.log(`${index + 1}. ${target.title} (${target.type})`);
                    console.log(`   ID: ${target.id}`);
                    console.log(`   URL: ${target.url}`);
                    console.log(`   WebSocket: ${target.webSocketDebuggerUrl || 'N/A'}`);
                    console.log('');
                });
            }
            return;
        }

        if (options.test) {
            const result = await tester.testSpecific(options.test);
            process.exit(result.success ? 0 : 1);
        } else {
            const report = await tester.runFullTest();
            process.exit(report.success ? 0 : 1);
        }
    } catch (error) {
        console.error(chalk.red('Fatal error:'), error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
    process.exit(1);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
    console.log(chalk.yellow('\nReceived SIGINT. Exiting gracefully...'));
    process.exit(0);
});

if (require.main === module) {
    main();
}

module.exports = ChromeDebuggerTester;