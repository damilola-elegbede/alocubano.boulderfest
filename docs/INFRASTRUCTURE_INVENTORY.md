# Test Infrastructure Inventory
  
Generated: 2025-08-13T08:46:00.434Z

## Executive Summary
- **Total Infrastructure**: 20,134 lines
- **File Count**: 39 files
- **Average File Size**: 516 lines
- **Manager Classes**: 8 (6216 lines)
- **Target Reduction**: 16107 lines to eliminate

## Manager Classes (Priority Targets)

### DatabaseTestManager
- **File**: tests/utils/database-test-utils.js
- **Lines**: 811
- **Complexity**: 57
- **Action**: DELETE in PR #TBD

### StripeMock
- **File**: tests/utils/mock-services.js
- **Lines**: 1534
- **Complexity**: 123
- **Action**: DELETE in PR #TBD

### TestEnvironmentManager
- **File**: tests/utils/test-environment-manager.js
- **Lines**: 721
- **Complexity**: 76
- **Action**: DELETE in PR #2

### TestInitializationOrchestrator
- **File**: tests/utils/test-initialization-orchestrator.js
- **Lines**: 516
- **Complexity**: 56
- **Action**: DELETE in PR #6

### MockRegistry
- **File**: tests/utils/test-mock-manager.js
- **Lines**: 869
- **Complexity**: 63
- **Action**: DELETE in PR #TBD

### TestSingletonManager
- **File**: tests/utils/test-singleton-manager.js
- **Lines**: 518
- **Complexity**: 28
- **Action**: DELETE in PR #3

### AppleWalletMock
- **File**: tests/utils/wallet-mocks.js
- **Lines**: 1119
- **Complexity**: 29
- **Action**: DELETE in PR #TBD

### BrevoMock
- **File**: tests/mocks/brevo-mock.js
- **Lines**: 128
- **Complexity**: 9
- **Action**: DELETE in PR #TBD

## Utility Categories

### other
- Files: 13
- Lines: 6172
- Action: REVIEW and consolidate

### helpers
- Files: 3
- Lines: 993
- Action: CONSOLIDATE in PR #7

### database
- Files: 6
- Lines: 3054
- Action: SIMPLIFY in PR #4 (1,017 → 80 lines)

### environment
- Files: 5
- Lines: 2256
- Action: REPLACE in PR #2 (400 → 30 lines)

### manager
- Files: 6
- Lines: 3460
- Action: DELETE in PR #2-6

### mocking
- Files: 6
- Lines: 4199
- Action: SIMPLIFY in PR #5 (850 → 100 lines)

## Elimination Strategy
1. **PR #1**: This inventory and foundation (0 deletions)
2. **PR #2-6**: Manager eliminations (2,624 lines)
3. **PR #7**: Configuration consolidation (500 lines)
4. **PR #8**: Test activation (0 deletions, 49 test fixes)
5. **PR #9-10**: Validation and documentation

## Success Metrics
- [ ] Reduce from 20134 to <1,600 lines
- [ ] Eliminate all 8 manager classes
- [ ] Consolidate 39 files to <10 files
- [ ] Activate all 49 skipped tests