#!/usr/bin/env node

/**
 * Fallback Notification System
 * 
 * Provides visibility into fallback usage and system health:
 * - Logs fallback events with detailed context
 * - Generates GitHub PR comments for transparency
 * - Creates metrics for tracking fallback frequency
 * - Alerts on critical fallback patterns
 * - Provides recommendations for reliability improvements
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';

class FallbackNotifier {
  constructor() {
    this.notifications = [];
    this.metrics = {
      fallbacksUsed: 0,
      criticalFallbacks: 0,
      serviceOutages: [],
      timeToRecover: null,
      impactLevel: 'LOW'
    };
    
    this.githubToken = process.env.GITHUB_TOKEN;
    this.repoOwner = process.env.GITHUB_REPOSITORY?.split('/')[0];
    this.repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
    this.prNumber = process.env.GITHUB_PR_NUMBER || process.env.PR_NUMBER;
    
    console.log('📢 Fallback Notifier initialized');
  }

  /**
   * Process fallback events and generate notifications
   */
  async processAndNotify(fallbackData) {
    console.log('\n📢 Processing fallback events...');
    
    try {
      // Parse fallback data
      const events = this.parseFallbackData(fallbackData);
      
      // Generate notifications
      await this.generateNotifications(events);
      
      // Calculate metrics
      this.calculateMetrics(events);
      
      // Send notifications
      await this.sendNotifications();
      
      // Generate report
      return this.generateReport();
      
    } catch (error) {
      console.error(`Notification processing failed: ${error.message}`);
      return this.generateErrorReport(error);
    }
  }

  /**
   * Parse fallback data from various sources
   */
  parseFallbackData(data) {
    const events = [];
    
    try {
      // Handle different input formats
      let parsedData;
      if (typeof data === 'string') {
        // Check if it's a file path
        if (existsSync(data)) {
          parsedData = JSON.parse(readFileSync(data, 'utf8'));
        } else {
          // Try to parse as JSON string
          parsedData = JSON.parse(data);
        }
      } else {
        parsedData = data;
      }

      // Extract events from service health check
      if (parsedData.services) {
        Object.entries(parsedData.services).forEach(([service, status]) => {
          if (!status.healthy && status.fallbackAvailable) {
            events.push({
              type: 'SERVICE_FALLBACK',
              service: service,
              fallbackStrategy: status.fallback || 'Unknown',
              severity: status.required ? 'CRITICAL' : 'WARNING',
              timestamp: new Date().toISOString(),
              details: status
            });
          }
        });
      }

      // Extract events from URL extraction
      if (parsedData.fallbackUsed && parsedData.fallbackUsed !== 'Environment Variables') {
        events.push({
          type: 'URL_FALLBACK',
          service: 'preview-url-extraction',
          fallbackStrategy: parsedData.fallbackUsed,
          severity: parsedData.fallbackUsed === 'Production URL' ? 'HIGH' : 'MEDIUM',
          timestamp: new Date().toISOString(),
          details: parsedData
        });
      }

      // Extract events from E2E orchestration
      if (parsedData.results?.warnings) {
        parsedData.results.warnings.forEach(warning => {
          events.push({
            type: 'E2E_FALLBACK',
            service: 'e2e-testing',
            fallbackStrategy: warning.type,
            severity: 'MEDIUM',
            timestamp: warning.timestamp || new Date().toISOString(),
            details: warning
          });
        });
      }

      // Extract skip events
      if (parsedData.skipped) {
        events.push({
          type: 'TEST_SKIP',
          service: 'e2e-testing',
          fallbackStrategy: `Skip due to ${parsedData.skipType}`,
          severity: 'HIGH',
          timestamp: new Date().toISOString(),
          details: parsedData
        });
      }

    } catch (error) {
      console.warn(`Failed to parse fallback data: ${error.message}`);
      // Generate a generic fallback event
      events.push({
        type: 'PARSE_ERROR',
        service: 'fallback-notifier',
        fallbackStrategy: 'Error handling',
        severity: 'LOW',
        timestamp: new Date().toISOString(),
        details: { error: error.message, originalData: data }
      });
    }

    console.log(`   📊 Parsed ${events.length} fallback events`);
    return events;
  }

  /**
   * Generate appropriate notifications based on events
   */
  async generateNotifications(events) {
    console.log('📝 Generating notifications...');

    for (const event of events) {
      // Create notification based on event type and severity
      const notification = this.createNotification(event);
      
      if (notification) {
        this.notifications.push(notification);
        console.log(`   ➕ Added ${event.severity} notification for ${event.type}`);
      }
    }

    // Generate summary notification if multiple fallbacks occurred
    if (events.length > 1) {
      this.notifications.push(this.createSummaryNotification(events));
    }
  }

  /**
   * Create individual notification
   */
  createNotification(event) {
    const templates = {
      SERVICE_FALLBACK: {
        title: `🔄 Service Fallback: ${event.service}`,
        message: `Service **${event.service}** is unavailable, using fallback: **${event.fallbackStrategy}**`,
        action: this.getServiceFallbackAction(event),
        priority: event.severity
      },
      
      URL_FALLBACK: {
        title: `🔗 Preview URL Fallback`,
        message: `Preview URL extraction used fallback method: **${event.fallbackStrategy}**`,
        action: this.getURLFallbackAction(event),
        priority: event.severity
      },
      
      E2E_FALLBACK: {
        title: `🎭 E2E Testing Fallback`,
        message: `E2E tests encountered issues, using fallback strategy: **${event.fallbackStrategy}**`,
        action: this.getE2EFallbackAction(event),
        priority: event.severity
      },
      
      TEST_SKIP: {
        title: `⏭️ Tests Skipped`,
        message: `E2E tests were skipped: **${event.fallbackStrategy}**`,
        action: this.getSkipAction(event),
        priority: event.severity
      }
    };

    const template = templates[event.type];
    if (!template) {
      console.warn(`No template found for event type: ${event.type}`);
      return null;
    }

    return {
      ...template,
      event: event,
      timestamp: event.timestamp
    };
  }

  /**
   * Get action recommendations for service fallbacks
   */
  getServiceFallbackAction(event) {
    const actions = {
      turso: '💡 **Recommendation**: Verify Turso credentials and connectivity. Tests will use SQLite fallback.',
      vercel: '💡 **Recommendation**: Check Vercel API status and token validity. Preview deployment features may be limited.',
      github: '🚨 **Action Required**: GitHub API is critical for CI/CD. Verify token and API status immediately.',
      npm: '💡 **Recommendation**: NPM Registry issues detected. Consider using cache or alternative registry.'
    };

    return actions[event.service] || '💡 **Recommendation**: Monitor service status and consider manual verification.';
  }

  /**
   * Get action recommendations for URL fallbacks
   */
  getURLFallbackAction(event) {
    const actions = {
      'Production URL': '⚠️ **Impact**: Testing against production instead of PR preview. Results may not reflect current changes.',
      'Vercel CLI': '💡 **Info**: Using Vercel CLI for URL extraction. Consider verifying preview deployment status.',
      'GitHub Deployments API': '💡 **Info**: Using GitHub API for deployment status. This is a reliable fallback method.',
      'Vercel API': '💡 **Info**: Using direct Vercel API access. Ensure project configuration is correct.'
    };

    return actions[event.fallbackStrategy] || '💡 **Info**: Alternative URL extraction method used successfully.';
  }

  /**
   * Get action recommendations for E2E fallbacks
   */
  getE2EFallbackAction(event) {
    return '💡 **Recommendation**: Review E2E test logs for specific issues. Consider running tests locally for debugging.';
  }

  /**
   * Get action recommendations for test skips
   */
  getSkipAction(event) {
    return '🔍 **Next Steps**: \n- Review service health status\n- Check preview deployment\n- Consider manual testing\n- Monitor for recurring patterns';
  }

  /**
   * Create summary notification for multiple fallbacks
   */
  createSummaryNotification(events) {
    const criticalCount = events.filter(e => e.severity === 'CRITICAL').length;
    const highCount = events.filter(e => e.severity === 'HIGH').length;
    const mediumCount = events.filter(e => e.severity === 'MEDIUM').length;

    let impactLevel = 'LOW';
    if (criticalCount > 0) impactLevel = 'CRITICAL';
    else if (highCount > 0) impactLevel = 'HIGH';
    else if (mediumCount > 1) impactLevel = 'MEDIUM';

    const title = `📊 Fallback Summary: ${events.length} fallbacks used`;
    const message = this.generateSummaryMessage(events, impactLevel);
    const action = this.generateSummaryAction(events, impactLevel);

    return {
      title,
      message,
      action,
      priority: impactLevel,
      event: { type: 'SUMMARY', events: events },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate summary message
   */
  generateSummaryMessage(events, impactLevel) {
    const serviceTypes = [...new Set(events.map(e => e.service))];
    const fallbackTypes = [...new Set(events.map(e => e.type))];

    let message = `**${impactLevel} Impact**: CI pipeline used ${events.length} fallback mechanism(s)\n\n`;
    message += `**Services Affected**: ${serviceTypes.join(', ')}\n`;
    message += `**Fallback Types**: ${fallbackTypes.join(', ')}\n\n`;
    
    if (impactLevel === 'CRITICAL') {
      message += '🚨 **Critical fallbacks detected** - immediate attention required\n';
    } else if (impactLevel === 'HIGH') {
      message += '⚠️ **Significant fallbacks used** - monitoring recommended\n';
    } else {
      message += '📈 **Standard fallbacks working as designed**\n';
    }

    return message;
  }

  /**
   * Generate summary action recommendations
   */
  generateSummaryAction(events, impactLevel) {
    let action = '📋 **Recommended Actions**:\n';

    if (impactLevel === 'CRITICAL') {
      action += '1. 🚨 Investigate critical service failures immediately\n';
      action += '2. 🔍 Verify all service credentials and connectivity\n';
      action += '3. 📞 Consider alerting on-call team if issues persist\n';
    } else if (impactLevel === 'HIGH') {
      action += '1. 🔍 Review service health status\n';
      action += '2. 📊 Monitor fallback frequency trends\n';
      action += '3. 🔧 Consider preemptive maintenance\n';
    } else {
      action += '1. 📈 Monitor for patterns in fallback usage\n';
      action += '2. 🔧 Consider optimizing primary service paths\n';
      action += '3. ✅ Continue normal operations\n';
    }

    action += '\n💡 **Automation**: Fallback mechanisms prevented CI failures and maintained pipeline reliability.';
    
    return action;
  }

  /**
   * Send notifications via available channels
   */
  async sendNotifications() {
    console.log(`📤 Sending ${this.notifications.length} notifications...`);

    // Send to console (always available)
    this.sendConsoleNotifications();

    // Send to GitHub PR (if available)
    if (this.githubToken && this.prNumber) {
      await this.sendGitHubNotifications();
    } else {
      console.log('   ℹ️ GitHub notifications skipped (token or PR number not available)');
    }

    // Write to file for external processing
    this.writeNotificationFile();
  }

  /**
   * Send console notifications
   */
  sendConsoleNotifications() {
    console.log('\n📢 ═══ FALLBACK NOTIFICATIONS ═══');
    
    for (const notification of this.notifications) {
      console.log(`\n${notification.title}`);
      console.log(notification.message);
      if (notification.action) {
        console.log(notification.action);
      }
      console.log(`   Priority: ${notification.priority} | Time: ${notification.timestamp}`);
    }
    
    console.log('\n═══ END NOTIFICATIONS ═══\n');
  }

  /**
   * Send GitHub PR notifications
   */
  async sendGitHubNotifications() {
    try {
      // Combine notifications into a single comment for better UX
      const comment = this.formatGitHubComment();
      
      const url = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/issues/${this.prNumber}/comments`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body: comment })
      });

      if (response.ok) {
        console.log('   ✅ GitHub PR comment posted successfully');
      } else {
        console.log(`   ⚠️ GitHub comment failed: ${response.status} ${response.statusText}`);
      }

    } catch (error) {
      console.log(`   ❌ GitHub notification error: ${error.message}`);
    }
  }

  /**
   * Format GitHub comment
   */
  formatGitHubComment() {
    const highPriorityNotifications = this.notifications.filter(n => 
      ['CRITICAL', 'HIGH'].includes(n.priority)
    );
    
    let comment = '## 🛡️ CI Pipeline Fallback Report\n\n';
    
    if (highPriorityNotifications.length > 0) {
      comment += '### ⚠️ High Priority Fallbacks\n\n';
      
      for (const notification of highPriorityNotifications) {
        comment += `#### ${notification.title}\n`;
        comment += `${notification.message}\n\n`;
        if (notification.action) {
          comment += `${notification.action}\n\n`;
        }
      }
    }

    // Add summary
    const totalFallbacks = this.metrics.fallbacksUsed;
    const criticalFallbacks = this.metrics.criticalFallbacks;
    
    comment += '### 📊 Summary\n\n';
    comment += `- **Total Fallbacks**: ${totalFallbacks}\n`;
    comment += `- **Critical Fallbacks**: ${criticalFallbacks}\n`;
    comment += `- **Impact Level**: ${this.metrics.impactLevel}\n`;
    comment += `- **Pipeline Status**: ${criticalFallbacks > 0 ? '⚠️ Degraded but functional' : '✅ Operating normally'}\n\n`;
    
    comment += '### 💡 What This Means\n\n';
    comment += 'Fallback mechanisms have activated to maintain CI/CD pipeline reliability. ';
    
    if (criticalFallbacks > 0) {
      comment += 'Critical services experienced issues but the pipeline continued with degraded functionality. ';
      comment += 'Please review the fallback events above and address any critical issues.';
    } else {
      comment += 'The pipeline is operating normally using backup systems where needed. ';
      comment += 'This is expected behavior designed to maintain high availability.';
    }
    
    comment += '\n\n---\n';
    comment += '*This report was automatically generated by the Fallback Notification System*';
    
    return comment;
  }

  /**
   * Write notification file
   */
  writeNotificationFile() {
    const report = {
      timestamp: new Date().toISOString(),
      notifications: this.notifications,
      metrics: this.metrics,
      summary: {
        totalNotifications: this.notifications.length,
        highPriorityCount: this.notifications.filter(n => ['CRITICAL', 'HIGH'].includes(n.priority)).length,
        impactLevel: this.metrics.impactLevel
      }
    };

    const filename = 'fallback-notifications.json';
    writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`   📄 Notification report written to ${filename}`);
  }

  /**
   * Calculate metrics from events
   */
  calculateMetrics(events) {
    this.metrics.fallbacksUsed = events.length;
    this.metrics.criticalFallbacks = events.filter(e => e.severity === 'CRITICAL').length;
    this.metrics.serviceOutages = [...new Set(events.map(e => e.service))];
    
    // Determine impact level
    if (this.metrics.criticalFallbacks > 0) {
      this.metrics.impactLevel = 'CRITICAL';
    } else if (events.filter(e => e.severity === 'HIGH').length > 0) {
      this.metrics.impactLevel = 'HIGH';
    } else if (events.length > 2) {
      this.metrics.impactLevel = 'MEDIUM';
    } else {
      this.metrics.impactLevel = 'LOW';
    }

    console.log(`   📊 Metrics calculated: ${this.metrics.fallbacksUsed} fallbacks, ${this.metrics.impactLevel} impact`);
  }

  /**
   * Generate success report
   */
  generateReport() {
    return {
      success: true,
      notificationsSent: this.notifications.length,
      metrics: this.metrics,
      impactLevel: this.metrics.impactLevel,
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Generate error report
   */
  generateErrorReport(error) {
    return {
      success: false,
      error: error.message,
      notificationsSent: 0,
      metrics: this.metrics,
      impactLevel: 'UNKNOWN'
    };
  }

  /**
   * Generate recommendations based on fallback patterns
   */
  generateRecommendations() {
    const recommendations = [];

    if (this.metrics.criticalFallbacks > 0) {
      recommendations.push('IMMEDIATE: Address critical service failures to restore full functionality');
    }

    if (this.metrics.fallbacksUsed > 3) {
      recommendations.push('INVESTIGATE: High fallback usage may indicate systemic issues');
    }

    if (this.metrics.serviceOutages.includes('github')) {
      recommendations.push('CRITICAL: GitHub API issues affect core CI/CD functionality');
    }

    if (this.metrics.serviceOutages.includes('vercel')) {
      recommendations.push('MONITOR: Vercel issues may affect deployment testing accuracy');
    }

    if (recommendations.length === 0) {
      recommendations.push('CONTINUE: Fallback mechanisms working as designed, no action required');
    }

    return recommendations;
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const notifier = new FallbackNotifier();
  
  // Get fallback data from command line arguments or stdin
  let fallbackData = {};
  
  if (process.argv.includes('--data-file')) {
    const dataFile = process.argv[process.argv.indexOf('--data-file') + 1];
    fallbackData = dataFile;
  } else if (process.argv.includes('--data')) {
    const dataJson = process.argv[process.argv.indexOf('--data') + 1];
    fallbackData = dataJson;
  } else {
    // Default empty data - will generate minimal report
    fallbackData = { fallbacksUsed: 0, services: {} };
  }

  notifier.processAndNotify(fallbackData)
    .then(result => {
      if (result.success) {
        console.log(`\n✅ Fallback notifications processed successfully`);
        console.log(`   Notifications sent: ${result.notificationsSent}`);
        console.log(`   Impact level: ${result.impactLevel}`);
        
        if (result.recommendations.length > 0) {
          console.log('\n💡 Recommendations:');
          result.recommendations.forEach(rec => console.log(`   - ${rec}`));
        }
      } else {
        console.log(`\n❌ Notification processing failed: ${result.error}`);
      }
      
      process.exit(0);
    })
    .catch(error => {
      console.error(`\n💥 Critical notification error: ${error.message}`);
      console.error(error.stack);
      process.exit(1);
    });
}

export default FallbackNotifier;