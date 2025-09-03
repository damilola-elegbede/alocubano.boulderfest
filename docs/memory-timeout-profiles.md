# Memory and Timeout Profiles

This document describes the standardized memory and timeout profile system implemented to resolve Issue #9: Memory/Timeout Mismatches.

## Problem Solved

Previously, workflows had inconsistent timeout and memory settings:
- Memory settings ranged from 2048MB to 6144MB with no standardization
- Timeout values varied from 5-30 minutes for similar test types  
- Browser matrix had inconsistent memory allocations (3GB vs 4GB for same browsers)
- No environment-specific adjustments (CI vs local)
- Configuration scattered across multiple files

## Solution: Standardized Resource Profiles

A centralized profile system in `.github/browser-matrix-config.yml` with four standardized profiles:

### Memory Profiles

| Profile | Memory | Node Options | Use Case |
|---------|---------|-------------|----------|
| **basic** | 2048MB | `--max-old-space-size=2048` | Unit tests, smoke tests |
| **standard** | 3072MB | `--max-old-space-size=3072` | Regular E2E tests, main CI |
| **extended** | 4096MB | `--max-old-space-size=4096` | Complex scenarios, multiple browsers |
| **performance** | 6144MB | `--max-old-space-size=6144` | Load testing, performance analysis |

### Timeout Profiles

| Profile | Job | Test | Action | Navigation | WebServer | Use Case |
|---------|-----|------|--------|------------|-----------|----------|
| **basic** | 10min | 30s | 15s | 30s | 60s | Fast unit/smoke tests |
| **standard** | 15min | 90s | 30s | 50s | 180s | Standard E2E testing |
| **extended** | 20min | 120s | 45s | 60s | 240s | Complex scenarios |
| **performance** | 30min | 300s | 60s | 120s | 300s | Performance testing |

### Browser-Specific Multipliers

Different browsers have different resource requirements:

| Browser | Memory Multiplier | Timeout Multiplier | Notes |
|---------|------------------|-------------------|-------|
| **chromium** | 1.0x | 1.0x | Baseline browser |
| **firefox** | 1.2x | 1.3x | Needs more memory |
| **webkit** | 1.1x | 1.5x | Safari needs more time |
| **mobile-chrome** | 0.9x | 1.8x | Efficient but slower |
| **mobile-safari** | 1.0x | 2.0x | Needs most time |

### Environment Adjustments

CI environments get additional resources:

| Environment | Timeout Multiplier | Memory Buffer | Reason |
|-------------|-------------------|---------------|---------|
| **CI** | 1.5x | +512MB | Network latency, resource contention |
| **Local** | 1.0x | +0MB | Baseline performance |

## Usage Examples

### In Workflows

Workflows automatically calculate resources using the `>î Calculate Resource Requirements` step:

```yaml
- name: >î Calculate Resource Requirements
  id: resources
  run: |
    # Auto-detect profile based on test type
    case "${{ inputs.test-type }}" in
      "unit"|"smoke") RESOURCE_PROFILE="basic" ;;
      "e2e") RESOURCE_PROFILE="standard" ;;
      "performance") RESOURCE_PROFILE="performance" ;;
    esac
    
    # Calculate final values with multipliers
    # ... (see workflow files for complete implementation)
    
    echo "memory_mb=$FINAL_MEMORY" >> $GITHUB_OUTPUT
    echo "timeout_minutes=$FINAL_TIMEOUT" >> $GITHUB_OUTPUT
    echo "node_options=$FINAL_NODE_OPTIONS" >> $GITHUB_OUTPUT

- name: Run Tests
  timeout-minutes: ${{ steps.resources.outputs.timeout_minutes }}
  env:
    NODE_OPTIONS: ${{ steps.resources.outputs.node_options }}
  run: npm run test:e2e
```

### Manual Calculation

Use the helper script for manual calculations:

```bash
# Basic unit tests
./scripts/calculate-resources.sh basic basic chromium local

# Standard E2E tests in CI
./scripts/calculate-resources.sh standard standard firefox ci

# Performance testing
./scripts/calculate-resources.sh performance performance chromium ci
```

### Example Calculations

**Standard E2E Test with Firefox in CI:**
- Base: 3072MB, 15min
- Browser multiplier: 1.2x memory, 1.3x timeout  
- CI multiplier: 1.5x timeout, +512MB memory
- **Final: 3584MB, 29min**

**Performance Test with Chromium in CI:**
- Base: 6144MB, 30min
- Browser multiplier: 1.0x memory, 1.0x timeout
- CI multiplier: 1.5x timeout, +512MB memory  
- **Final: 6656MB, 45min**

## Workflow Integration

### Updated Workflows

The following workflows now use standardized profiles:

1. **`reusable/test-suite.yml`** - Auto-detects profile based on test type
2. **`e2e-tests-optimized.yml`** - Browser-specific profile selection
3. **Browser matrix configurations** - Profile-based timeouts/memory

### Profile Selection Logic

| Test Type | Auto-Selected Profile | Rationale |
|-----------|----------------------|-----------|
| unit, smoke | basic | Fast, lightweight tests |
| integration | basic | Simple API tests |
| e2e | standard | Regular browser testing |
| e2e-extended | extended | Complex scenarios |
| performance, load | performance | Resource-intensive |

### Browser Matrix Updates

Browser matrices now use profiles instead of hardcoded values:

```yaml
# Before (inconsistent)
{"browser": "firefox", "memory": "4GB", "timeout": 15}
{"browser": "chromium", "memory": "3GB", "timeout": 12}

# After (standardized)  
{"browser": "firefox", "memory_profile": "standard", "timeout_profile": "standard"}
{"browser": "chromium", "memory_profile": "standard", "timeout_profile": "standard"}
```

## Benefits

1. **Consistency**: All workflows use same resource calculation logic
2. **Predictability**: Known resource requirements for each test type
3. **Flexibility**: Easy to adjust profiles without touching multiple files
4. **Environment Awareness**: Automatic CI/local adjustments
5. **Browser Optimization**: Browser-specific resource tuning
6. **Maintainability**: Single source of truth for resource settings

## Migration Notes

Existing workflows were updated to:
1. Remove hardcoded timeout/memory values
2. Add resource calculation steps
3. Use calculated values in test execution
4. Display resource profile in summaries

No breaking changes to test execution, only improved resource allocation.

## Validation

Test the resource calculation:

```bash
# Verify script works
./scripts/calculate-resources.sh standard standard firefox ci

# Check configuration parsing  
yq eval '.resource_management.memory_profiles.standard' .github/browser-matrix-config.yml

# Validate all profiles exist
for profile in basic standard extended performance; do
  echo "Profile: $profile"
  yq eval ".resource_management.memory_profiles.$profile" .github/browser-matrix-config.yml
done
```

## Future Enhancements

1. **Dynamic Profile Selection**: AI-based profile selection based on test complexity
2. **Performance Monitoring**: Track actual resource usage vs allocation
3. **Cost Optimization**: Minimize resource allocation while maintaining reliability
4. **Profile Tuning**: Continuous optimization based on execution data