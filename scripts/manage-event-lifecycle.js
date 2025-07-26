#!/usr/bin/env node

/**
 * Script to manage event lifecycle transitions
 * Handles transitions: upcoming → current → past → archived
 * Usage: node scripts/manage-event-lifecycle.js <action> <event-id> [options]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Event lifecycle states
const LIFECYCLE_STATES = {
  UPCOMING: 'upcoming',
  CURRENT: 'current', 
  PAST: 'past',
  ARCHIVED: 'archived'
};

// Event lifecycle configuration file
const LIFECYCLE_CONFIG_PATH = path.join(projectRoot, 'config', 'event-lifecycle.json');

/**
 * Load or create event lifecycle configuration
 */
function loadLifecycleConfig() {
  if (!fs.existsSync(LIFECYCLE_CONFIG_PATH)) {
    // Create default configuration
    const defaultConfig = {
      events: {},
      transitions: {
        lastUpdated: new Date().toISOString()
      },
      settings: {
        autoArchive: false,
        archiveDelayDays: 365,
        currentEventLimit: 1
      }
    };
    
    // Ensure config directory exists
    const configDir = path.dirname(LIFECYCLE_CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(LIFECYCLE_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  
  return JSON.parse(fs.readFileSync(LIFECYCLE_CONFIG_PATH, 'utf8'));
}

/**
 * Save event lifecycle configuration
 */
function saveLifecycleConfig(config) {
  config.transitions.lastUpdated = new Date().toISOString();
  fs.writeFileSync(LIFECYCLE_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Discover events from existing pages
 */
function discoverEvents() {
  const pagesDir = path.join(projectRoot, 'pages');
  const events = new Set();
  
  fs.readdirSync(pagesDir)
    .filter(file => file.endsWith('.html') && file.includes('-'))
    .forEach(file => {
      const match = file.match(/^([a-z0-9-]+)-[a-z]+\.html$/);
      if (match && !['gallery-2025'].includes(match[1])) {
        events.add(match[1]);
      }
    });
  
  return Array.from(events).sort();
}

/**
 * Initialize event in lifecycle if not already tracked
 */
function initializeEvent(config, eventId, initialState = LIFECYCLE_STATES.UPCOMING) {
  if (!config.events[eventId]) {
    config.events[eventId] = {
      state: initialState,
      createdAt: new Date().toISOString(),
      transitions: [],
      metadata: {}
    };
    console.log(`📋 Initialized ${eventId} as ${initialState}`);
  }
  return config.events[eventId];
}

/**
 * Transition event to new state
 */
function transitionEvent(eventId, newState, options = {}) {
  console.log(`🔄 Transitioning ${eventId} to ${newState}...`);
  
  const config = loadLifecycleConfig();
  const event = initializeEvent(config, eventId);
  const oldState = event.state;
  
  // Validate transition
  if (!Object.values(LIFECYCLE_STATES).includes(newState)) {
    throw new Error(`Invalid state: ${newState}`);
  }
  
  if (oldState === newState) {
    console.log(`✅ Event ${eventId} is already in state: ${newState}`);
    return;
  }
  
  // Special handling for CURRENT state limit
  if (newState === LIFECYCLE_STATES.CURRENT) {
    const currentEvents = Object.entries(config.events)
      .filter(([id, evt]) => evt.state === LIFECYCLE_STATES.CURRENT && id !== eventId);
    
    if (currentEvents.length >= config.settings.currentEventLimit) {
      if (options.force) {
        console.log(`⚠️  Forcing transition - ${currentEvents.length} current events already exist`);
      } else {
        throw new Error(`Cannot set ${eventId} as current - limit of ${config.settings.currentEventLimit} current events reached. Use --force to override.`);
      }
    }
  }
  
  // Record transition
  event.state = newState;
  event.transitions.push({
    from: oldState,
    to: newState,
    timestamp: new Date().toISOString(),
    reason: options.reason || 'Manual transition'
  });
  
  // Update metadata based on state
  switch (newState) {
    case LIFECYCLE_STATES.CURRENT:
      event.metadata.activatedAt = new Date().toISOString();
      break;
    case LIFECYCLE_STATES.PAST:
      event.metadata.completedAt = new Date().toISOString();
      break;
    case LIFECYCLE_STATES.ARCHIVED:
      event.metadata.archivedAt = new Date().toISOString();
      break;
  }
  
  // Update page visibility if needed
  if (!options.skipPageUpdate) {
    updatePageVisibility(eventId, newState, options.dryRun);
  }
  
  // Save configuration
  if (!options.dryRun) {
    saveLifecycleConfig(config);
    console.log(`✅ ${eventId} transitioned from ${oldState} to ${newState}`);
  } else {
    console.log(`🔍 [DRY RUN] Would transition ${eventId} from ${oldState} to ${newState}`);
  }
}

/**
 * Update page visibility based on lifecycle state
 */
function updatePageVisibility(eventId, state, dryRun = false) {
  const pagesDir = path.join(projectRoot, 'pages');
  const eventPages = fs.readdirSync(pagesDir)
    .filter(file => file.startsWith(`${eventId}-`) && file.endsWith('.html'));
  
  console.log(`📄 Updating page visibility for ${eventId} (${state})...`);
  
  eventPages.forEach(filename => {
    const filePath = path.join(pagesDir, filename);
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let updatedContent = content;
      
      // Update meta description and title based on state
      switch (state) {
        case LIFECYCLE_STATES.UPCOMING:
          updatedContent = updatedContent.replace(
            /(meta name="description" content=")([^"]*)/,
            '$1Coming Soon! $2'
          );
          break;
        case LIFECYCLE_STATES.CURRENT:
          updatedContent = updatedContent.replace(
            /(meta name="description" content=")Coming Soon! ([^"]*)/,
            '$1$2'
          );
          break;
        case LIFECYCLE_STATES.PAST:
          updatedContent = updatedContent.replace(
            /(meta name="description" content=")([^"]*)/,
            '$1Recap: $2'
          );
          break;
        case LIFECYCLE_STATES.ARCHIVED:
          updatedContent = updatedContent.replace(
            /(meta name="description" content=")([^"]*)/,
            '$1[Archived] $2'
          );
          break;
      }
      
      // Add lifecycle state as CSS class to body
      const bodyClassRegex = /<body([^>]*)>/;
      const bodyMatch = updatedContent.match(bodyClassRegex);
      if (bodyMatch) {
        const existingClass = bodyMatch[1].includes('class=') ? 
          bodyMatch[1].match(/class="([^"]*)"/)?.[1] || '' : '';
        
        // Remove existing lifecycle classes
        const cleanClass = existingClass
          .split(' ')
          .filter(cls => !cls.startsWith('event-'))
          .join(' ');
        
        const newClass = `${cleanClass} event-${state}`.trim();
        updatedContent = updatedContent.replace(
          bodyClassRegex,
          `<body class="${newClass}">`
        );
      }
      
      if (!dryRun && content !== updatedContent) {
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log(`  ✅ Updated ${filename}`);
      } else if (dryRun && content !== updatedContent) {
        console.log(`  🔍 [DRY RUN] Would update ${filename}`);
      } else {
        console.log(`  ✅ ${filename} already up to date`);
      }
      
    } catch (error) {
      console.log(`  ❌ Error updating ${filename}: ${error.message}`);
    }
  });
}

/**
 * List all events and their lifecycle states
 */
function listEvents() {
  console.log('📋 Event Lifecycle Status');
  console.log('=========================\n');
  
  const config = loadLifecycleConfig();
  const discoveredEvents = discoverEvents();
  
  // Initialize any missing events
  discoveredEvents.forEach(eventId => {
    initializeEvent(config, eventId);
  });
  
  if (Object.keys(config.events).length === 0) {
    console.log('No events found.');
    return;
  }
  
  // Group events by state
  const eventsByState = {};
  Object.values(LIFECYCLE_STATES).forEach(state => {
    eventsByState[state] = [];
  });
  
  Object.entries(config.events).forEach(([eventId, event]) => {
    eventsByState[event.state].push({ eventId, ...event });
  });
  
  // Display events by state
  Object.entries(eventsByState).forEach(([state, events]) => {
    if (events.length > 0) {
      console.log(`📅 ${state.toUpperCase()} (${events.length}):`);
      events.sort((a, b) => a.eventId.localeCompare(b.eventId)).forEach(event => {
        const lastTransition = event.transitions[event.transitions.length - 1];
        const transitionInfo = lastTransition ? 
          ` (since ${new Date(lastTransition.timestamp).toLocaleDateString()})` : '';
        console.log(`  • ${event.eventId}${transitionInfo}`);
      });
      console.log('');
    }
  });
  
  // Save any newly discovered events
  saveLifecycleConfig(config);
}

/**
 * Archive old events automatically
 */
function autoArchive(options = {}) {
  console.log('🗄️  Auto-archiving old events...');
  
  const config = loadLifecycleConfig();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (config.settings.archiveDelayDays || 365));
  
  let archivedCount = 0;
  
  Object.entries(config.events).forEach(([eventId, event]) => {
    if (event.state === LIFECYCLE_STATES.PAST && event.metadata.completedAt) {
      const completedDate = new Date(event.metadata.completedAt);
      if (completedDate < cutoffDate) {
        if (!options.dryRun) {
          transitionEvent(eventId, LIFECYCLE_STATES.ARCHIVED, { 
            reason: 'Auto-archived due to age',
            skipPageUpdate: options.skipPageUpdate 
          });
        } else {
          console.log(`🔍 [DRY RUN] Would archive ${eventId} (completed ${completedDate.toLocaleDateString()})`);
        }
        archivedCount++;
      }
    }
  });
  
  if (archivedCount === 0) {
    console.log('  ✅ No events need archiving');
  } else {
    console.log(`  ✅ ${options.dryRun ? 'Would archive' : 'Archived'} ${archivedCount} events`);
  }
}

/**
 * Main function to handle command line interface
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('Event Lifecycle Management Script');
    console.log('=================================\n');
    console.log('Usage: node scripts/manage-event-lifecycle.js <action> [event-id] [options]\n');
    console.log('Actions:');
    console.log('  list                          List all events and their states');
    console.log('  transition <event-id> <state> Transition event to new state');
    console.log('  promote <event-id>            Promote event to current');
    console.log('  complete <event-id>           Mark event as past');
    console.log('  archive <event-id>            Archive event');
    console.log('  auto-archive                  Auto-archive old events');
    console.log('');
    console.log('States: upcoming, current, past, archived');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run                     Show what would be changed');
    console.log('  --force                       Force transition (bypass limits)');
    console.log('  --reason="text"               Add reason for transition');
    console.log('  --skip-page-update            Don\'t update page content');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/manage-event-lifecycle.js list');
    console.log('  node scripts/manage-event-lifecycle.js promote boulder-fest-2026');
    console.log('  node scripts/manage-event-lifecycle.js transition weekender-2026-09 past');
    console.log('  node scripts/manage-event-lifecycle.js auto-archive --dry-run');
    process.exit(0);
  }
  
  const action = args[0];
  const eventId = args[1];
  
  // Parse options
  const options = {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    skipPageUpdate: args.includes('--skip-page-update'),
    reason: null
  };
  
  const reasonArg = args.find(arg => arg.startsWith('--reason='));
  if (reasonArg) {
    options.reason = reasonArg.split('=')[1];
  }
  
  try {
    switch (action) {
      case 'list':
        listEvents();
        break;
        
      case 'transition': {
        const newState = args[2];
        if (!eventId || !newState) {
          console.error('❌ Usage: transition <event-id> <state>');
          process.exit(1);
        }
        transitionEvent(eventId, newState, options);
        break;
      }
        
      case 'promote':
        if (!eventId) {
          console.error('❌ Usage: promote <event-id>');
          process.exit(1);
        }
        transitionEvent(eventId, LIFECYCLE_STATES.CURRENT, options);
        break;
        
      case 'complete':
        if (!eventId) {
          console.error('❌ Usage: complete <event-id>');
          process.exit(1);
        }
        transitionEvent(eventId, LIFECYCLE_STATES.PAST, options);
        break;
        
      case 'archive':
        if (!eventId) {
          console.error('❌ Usage: archive <event-id>');
          process.exit(1);
        }
        transitionEvent(eventId, LIFECYCLE_STATES.ARCHIVED, options);
        break;
        
      case 'auto-archive':
        autoArchive(options);
        break;
        
      default:
        console.error(`❌ Unknown action: ${action}`);
        console.error('Run with --help for usage information');
        process.exit(1);
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { 
  transitionEvent, 
  listEvents, 
  autoArchive, 
  loadLifecycleConfig,
  LIFECYCLE_STATES 
};