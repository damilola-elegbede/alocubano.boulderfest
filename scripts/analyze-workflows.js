#!/usr/bin/env node

/**
 * GitHub Workflows Analyzer
 *
 * Analyzes all GitHub workflows in .github/workflows/ to identify:
 * - Common patterns and duplications
 * - Workflow dependencies and relationships
 * - Consolidation opportunities
 * - Performance optimization potential
 *
 * Usage: node scripts/analyze-workflows.js [--output=json|console] [--detailed]
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple YAML parser for workflow analysis (avoiding js-yaml dependency)
function parseYAMLBasic(content) {
  const lines = content.split('\n');
  const result = {};
  let currentSection = null;
  let indent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const currentIndent = line.length - line.trimStart().length;

    if (line.includes(':') && !trimmed.startsWith('-')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      if (currentIndent === 0) {
        currentSection = key.trim();
        result[currentSection] = value || {};
      }
    }
  }

  return result;
}

// Extract key workflow metadata
function extractWorkflowMetadata(content, filename) {
  const lines = content.split('\n');
  const metadata = {
    filename,
    name: '',
    triggers: [],
    jobs: [],
    steps: [],
    dependencies: [],
    environment_variables: [],
    actions_used: [],
    complexity_score: 0,
    lines_of_code: lines.length,
    has_matrix: false,
    has_caching: false,
    has_artifacts: false,
    has_conditions: false,
    permissions: [],
    concurrency: false
  };

  let currentJob = null;
  let inSteps = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Extract workflow name
    if (trimmed.startsWith('name:')) {
      metadata.name = trimmed.split('name:')[1].trim().replace(/['"]/g, '');
    }

    // Extract triggers
    if (trimmed === 'on:' || trimmed === '"on":') {
      let j = i + 1;
      while (j < lines.length && (lines[j].trim() === '' || lines[j].startsWith('  '))) {
        const triggerLine = lines[j].trim();
        if (triggerLine && !triggerLine.startsWith('#')) {
          if (triggerLine.includes(':')) {
            const trigger = triggerLine.split(':')[0].trim();
            if (trigger && !metadata.triggers.includes(trigger)) {
              metadata.triggers.push(trigger);
            }
          }
        }
        j++;
      }
    }

    // Extract jobs
    if (trimmed === 'jobs:') {
      let j = i + 1;
      while (j < lines.length) {
        const jobLine = lines[j];
        const jobIndent = jobLine.length - jobLine.trimStart().length;
        if (jobIndent === 2 && jobLine.includes(':') && !jobLine.trim().startsWith('#')) {
          const jobName = jobLine.trim().split(':')[0];
          if (jobName && !metadata.jobs.includes(jobName)) {
            metadata.jobs.push(jobName);
          }
        } else if (jobIndent <= 2 && jobLine.trim() && !jobLine.trim().startsWith('#')) {
          break;
        }
        j++;
      }
    }

    // Detect patterns
    if (trimmed.includes('matrix:')) metadata.has_matrix = true;
    if (trimmed.includes('cache:') || trimmed.includes('actions/cache')) metadata.has_caching = true;
    if (trimmed.includes('upload-artifact') || trimmed.includes('download-artifact')) metadata.has_artifacts = true;
    if (trimmed.includes('if:')) metadata.has_conditions = true;
    if (trimmed.includes('concurrency:')) metadata.concurrency = true;

    // Extract actions used
    if (trimmed.startsWith('uses:')) {
      const action = trimmed.split('uses:')[1].trim().replace(/['"]/g, '');
      if (!metadata.actions_used.includes(action)) {
        metadata.actions_used.push(action);
      }
    }

    // Extract environment variables
    if (trimmed.startsWith('env:') || (indent > 0 && trimmed.includes('_'))) {
      if (trimmed.includes('=') || (trimmed.includes(':') && trimmed.toUpperCase() === trimmed)) {
        const envVar = trimmed.split(':')[0].trim();
        if (envVar && envVar.toUpperCase() === envVar && !metadata.environment_variables.includes(envVar)) {
          metadata.environment_variables.push(envVar);
        }
      }
    }

    // Extract permissions
    if (trimmed.startsWith('permissions:')) {
      let j = i + 1;
      while (j < lines.length && (lines[j].trim() === '' || lines[j].startsWith('  '))) {
        const permLine = lines[j].trim();
        if (permLine && permLine.includes(':') && !permLine.startsWith('#')) {
          const permission = permLine.split(':')[0].trim();
          if (permission && !metadata.permissions.includes(permission)) {
            metadata.permissions.push(permission);
          }
        }
        j++;
      }
    }
  }

  // Calculate complexity score
  metadata.complexity_score =
    metadata.jobs.length * 2 +
    metadata.actions_used.length +
    (metadata.has_matrix ? 5 : 0) +
    (metadata.has_conditions ? 3 : 0) +
    (metadata.has_caching ? 2 : 0) +
    (metadata.has_artifacts ? 2 : 0) +
    Math.floor(metadata.lines_of_code / 50);

  return metadata;
}

// Categorize workflows by purpose
function categorizeWorkflow(metadata) {
  const { name, filename, triggers, jobs } = metadata;
  const nameAndFile = (name + ' ' + filename).toLowerCase();

  // Quality workflows
  if (nameAndFile.includes('quality') || nameAndFile.includes('lint') ||
      nameAndFile.includes('complexity') || nameAndFile.includes('audit')) {
    return 'quality';
  }

  // Test workflows
  if (nameAndFile.includes('test') || nameAndFile.includes('e2e') ||
      nameAndFile.includes('integration') || nameAndFile.includes('performance')) {
    return 'test';
  }

  // Deployment workflows
  if (nameAndFile.includes('deploy') || nameAndFile.includes('production') ||
      nameAndFile.includes('staging') || nameAndFile.includes('vercel')) {
    return 'deploy';
  }

  // CI/CD workflows
  if (nameAndFile.includes('ci') || nameAndFile.includes('pipeline') ||
      triggers.includes('push') || triggers.includes('pull_request')) {
    return 'ci_cd';
  }

  // Monitoring workflows
  if (nameAndFile.includes('monitor') || nameAndFile.includes('health') ||
      nameAndFile.includes('metrics')) {
    return 'monitoring';
  }

  return 'utility';
}

// Identify common patterns
function identifyPatterns(workflows) {
  const patterns = {
    common_actions: {},
    common_triggers: {},
    common_environments: {},
    common_permissions: {},
    job_patterns: {},
    complexity_distribution: {},
    duplication_candidates: []
  };

  workflows.forEach(workflow => {
    // Count common actions
    workflow.actions_used.forEach(action => {
      patterns.common_actions[action] = (patterns.common_actions[action] || 0) + 1;
    });

    // Count common triggers
    workflow.triggers.forEach(trigger => {
      patterns.common_triggers[trigger] = (patterns.common_triggers[trigger] || 0) + 1;
    });

    // Count environment variables
    workflow.environment_variables.forEach(env => {
      patterns.common_environments[env] = (patterns.common_environments[env] || 0) + 1;
    });

    // Count permissions
    workflow.permissions.forEach(perm => {
      patterns.common_permissions[perm] = (patterns.common_permissions[perm] || 0) + 1;
    });

    // Complexity distribution
    const complexityRange = Math.floor(workflow.complexity_score / 10) * 10;
    const range = `${complexityRange}-${complexityRange + 9}`;
    patterns.complexity_distribution[range] = (patterns.complexity_distribution[range] || 0) + 1;
  });

  // Find duplication candidates
  const actionSignatures = {};
  workflows.forEach(workflow => {
    const signature = workflow.actions_used.sort().join('|');
    if (!actionSignatures[signature]) {
      actionSignatures[signature] = [];
    }
    actionSignatures[signature].push(workflow.filename);
  });

  patterns.duplication_candidates = Object.entries(actionSignatures)
    .filter(([signature, files]) => files.length > 1)
    .map(([signature, files]) => ({ signature, files, count: files.length }));

  return patterns;
}

// Generate optimization recommendations
function generateRecommendations(workflows, patterns) {
  const recommendations = [];

  // Workflow consolidation opportunities
  const categories = {};
  workflows.forEach(workflow => {
    const category = categorizeWorkflow(workflow);
    if (!categories[category]) categories[category] = [];
    categories[category].push(workflow);
  });

  // Check for similar test workflows
  const testWorkflows = categories.test || [];
  if (testWorkflows.length > 5) {
    recommendations.push({
      type: 'consolidation',
      priority: 'high',
      title: 'Consolidate Test Workflows',
      description: `Found ${testWorkflows.length} test workflows. Consider consolidating E2E tests into a single parameterized workflow.`,
      affected_files: testWorkflows.map(w => w.filename),
      estimated_reduction: Math.floor(testWorkflows.length * 0.4)
    });
  }

  // Check for deployment workflow complexity
  const deployWorkflows = categories.deploy || [];
  const complexDeployWorkflows = deployWorkflows.filter(w => w.complexity_score > 20);
  if (complexDeployWorkflows.length > 0) {
    recommendations.push({
      type: 'simplification',
      priority: 'medium',
      title: 'Simplify Deployment Workflows',
      description: `Found ${complexDeployWorkflows.length} complex deployment workflows. Consider extracting common steps into reusable actions.`,
      affected_files: complexDeployWorkflows.map(w => w.filename),
      estimated_reduction: complexDeployWorkflows.reduce((sum, w) => sum + Math.floor(w.lines_of_code * 0.3), 0)
    });
  }

  // Check for common action patterns
  const topActions = Object.entries(patterns.common_actions)
    .filter(([action, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1]);

  if (topActions.length > 0) {
    recommendations.push({
      type: 'reusable_workflow',
      priority: 'medium',
      title: 'Create Reusable Workflows',
      description: `Actions used in 5+ workflows: ${topActions.slice(0, 3).map(([action]) => action).join(', ')}. Consider creating reusable workflows.`,
      affected_files: workflows.filter(w => w.actions_used.some(action => topActions.map(([a]) => a).includes(action))).map(w => w.filename),
      estimated_reduction: Math.floor(workflows.length * 0.15)
    });
  }

  // Check for duplicate patterns
  const duplicates = patterns.duplication_candidates.filter(d => d.count > 2);
  if (duplicates.length > 0) {
    recommendations.push({
      type: 'deduplication',
      priority: 'high',
      title: 'Remove Duplicate Workflow Patterns',
      description: `Found ${duplicates.length} groups of workflows with identical action patterns.`,
      affected_files: duplicates.flatMap(d => d.files),
      estimated_reduction: duplicates.reduce((sum, d) => sum + d.count - 1, 0)
    });
  }

  // Performance optimization
  const largeWorkflows = workflows.filter(w => w.lines_of_code > 500);
  if (largeWorkflows.length > 0) {
    recommendations.push({
      type: 'performance',
      priority: 'low',
      title: 'Optimize Large Workflows',
      description: `Found ${largeWorkflows.length} workflows with >500 lines. Consider breaking into smaller, focused workflows.`,
      affected_files: largeWorkflows.map(w => w.filename),
      estimated_reduction: largeWorkflows.reduce((sum, w) => sum + Math.floor(w.lines_of_code * 0.2), 0)
    });
  }

  return recommendations;
}

// Main analysis function
async function analyzeWorkflows() {
  try {
    const workflowsDir = join(__dirname, '../.github/workflows');
    const files = await readdir(workflowsDir);
    const yamlFiles = files.filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));

    const isJsonOutput = process.argv.includes('--output=json');

    if (!isJsonOutput) {
      console.log(`🔍 Analyzing ${yamlFiles.length} workflow files...`);
    }

    const workflows = [];
    let totalLines = 0;

    for (const file of yamlFiles) {
      try {
        const content = await readFile(join(workflowsDir, file), 'utf-8');
        const metadata = extractWorkflowMetadata(content, file);
        workflows.push(metadata);
        totalLines += metadata.lines_of_code;

        if (!isJsonOutput) {
          console.log(`  ✓ ${file} (${metadata.lines_of_code} lines, complexity: ${metadata.complexity_score})`);
        }
      } catch (error) {
        if (!isJsonOutput) {
          console.warn(`  ⚠️  Failed to analyze ${file}: ${error.message}`);
        }
      }
    }

    if (!isJsonOutput) {
      console.log(`\n📊 Identifying patterns and relationships...`);
    }
    const patterns = identifyPatterns(workflows);

    if (!isJsonOutput) {
      console.log(`🎯 Generating optimization recommendations...`);
    }
    const recommendations = generateRecommendations(workflows, patterns);

    // Categorize workflows
    const categories = {};
    workflows.forEach(workflow => {
      const category = categorizeWorkflow(workflow);
      if (!categories[category]) categories[category] = [];
      categories[category].push(workflow);
    });

    // Calculate potential reduction
    const estimatedWorkflowReduction = recommendations
      .filter(r => r.type === 'consolidation' || r.type === 'deduplication')
      .reduce((sum, r) => sum + r.estimated_reduction, 0);

    const estimatedLineReduction = recommendations
      .reduce((sum, r) => sum + (r.estimated_reduction || 0), 0);

    const analysis = {
      summary: {
        totalWorkflows: workflows.length,
        totalLines,
        averageComplexity: Math.round(workflows.reduce((sum, w) => sum + w.complexity_score, 0) / workflows.length),
        averageLines: Math.round(totalLines / workflows.length)
      },
      categories: Object.entries(categories).map(([name, workflows]) => ({
        name,
        count: workflows.length,
        totalLines: workflows.reduce((sum, w) => sum + w.lines_of_code, 0),
        workflows: workflows.map(w => ({
          filename: w.filename,
          name: w.name,
          complexity: w.complexity_score,
          lines: w.lines_of_code
        }))
      })),
      patterns: {
        mostUsedActions: Object.entries(patterns.common_actions)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([action, count]) => ({ action, count })),
        commonTriggers: Object.entries(patterns.common_triggers)
          .sort((a, b) => b[1] - a[1])
          .map(([trigger, count]) => ({ trigger, count })),
        complexityDistribution: patterns.complexity_distribution,
        duplicationCandidates: patterns.duplication_candidates.slice(0, 5)
      },
      recommendations: recommendations.sort((a, b) => {
        const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
        return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
      }),
      estimatedReduction: {
        workflows: estimatedWorkflowReduction,
        linesOfCode: estimatedLineReduction,
        percentageReduction: Math.round((estimatedWorkflowReduction / workflows.length) * 100)
      }
    };

    return analysis;

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    throw error;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const outputFormat = args.find(arg => arg.startsWith('--output='))?.split('=')[1] || 'console';
  const detailed = args.includes('--detailed');

  try {
    if (outputFormat !== 'json') {
      console.log('🚀 GitHub Workflows Analyzer\n');
    }

    const analysis = await analyzeWorkflows();

    if (outputFormat === 'json') {
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      // Console output
      console.log('\n📋 ANALYSIS SUMMARY');
      console.log('='.repeat(50));
      console.log(`Total Workflows: ${analysis.summary.totalWorkflows}`);
      console.log(`Total Lines: ${analysis.summary.totalLines.toLocaleString()}`);
      console.log(`Average Complexity: ${analysis.summary.averageComplexity}`);
      console.log(`Average Lines per Workflow: ${analysis.summary.averageLines}`);

      console.log('\n📂 WORKFLOW CATEGORIES');
      console.log('='.repeat(50));
      analysis.categories.forEach(category => {
        console.log(`${category.name.toUpperCase()}: ${category.count} workflows (${category.totalLines.toLocaleString()} lines)`);
        if (detailed) {
          category.workflows.forEach(w => {
            console.log(`  • ${w.filename}: ${w.lines} lines, complexity ${w.complexity}`);
          });
        }
      });

      console.log('\n🔍 COMMON PATTERNS');
      console.log('='.repeat(50));
      console.log('Most Used Actions:');
      analysis.patterns.mostUsedActions.slice(0, 5).forEach(({ action, count }) => {
        console.log(`  • ${action}: ${count} workflows`);
      });

      console.log('\nCommon Triggers:');
      analysis.patterns.commonTriggers.forEach(({ trigger, count }) => {
        console.log(`  • ${trigger}: ${count} workflows`);
      });

      console.log('\n🎯 OPTIMIZATION RECOMMENDATIONS');
      console.log('='.repeat(50));
      analysis.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
        console.log(`   ${rec.description}`);
        console.log(`   Affected files: ${rec.affected_files.length}`);
        if (detailed) {
          rec.affected_files.forEach(file => console.log(`     • ${file}`));
        }
        console.log();
      });

      console.log('💡 ESTIMATED REDUCTION POTENTIAL');
      console.log('='.repeat(50));
      console.log(`Workflows: ${analysis.estimatedReduction.workflows} (${analysis.estimatedReduction.percentageReduction}% reduction)`);
      console.log(`Lines of Code: ${analysis.estimatedReduction.linesOfCode.toLocaleString()}`);

      if (analysis.patterns.duplicationCandidates.length > 0) {
        console.log('\n🔄 DUPLICATION CANDIDATES');
        console.log('='.repeat(50));
        analysis.patterns.duplicationCandidates.slice(0, 3).forEach(dup => {
          console.log(`• ${dup.count} workflows with identical patterns:`);
          dup.files.forEach(file => console.log(`    ${file}`));
          console.log();
        });
      }
    }

    if (outputFormat !== 'json') {
      console.log('\n✅ Analysis complete!');
    }

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { analyzeWorkflows, extractWorkflowMetadata, categorizeWorkflow };