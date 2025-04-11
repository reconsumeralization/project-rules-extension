# Dead Code Analysis Report

## Summary

- **Date:** 2025-04-10
- **Total Files Analyzed:** 2
- **Total Issues Found:** 11
- **Confidence Threshold:** 75%

## Issues by Type

### unused-function (10)

| File | Location | Message | Confidence |
| ---- | -------- | ------- | ---------- |
| src\utils\protocolValidator.ts | \Users\recon\buil\cursor-rules-extension\src\utils\protocolValidator.ts:19:0 | Unused function 'mapToMCPValidationError' | 90% |
| src\utils\protocolValidator.ts | \Users\recon\buil\cursor-rules-extension\src\utils\protocolValidator.ts:30:7 | Unused function 'validateProtocol' | 90% |
| src\utils\protocolValidator.ts | \Users\recon\buil\cursor-rules-extension\src\utils\protocolValidator.ts:140:7 | Unused function 'getSuggestedImprovements' | 90% |
| src\utils\eventHandlers.ts | \Users\recon\buil\cursor-rules-extension\src\utils\eventHandlers.ts:34:7 | Unused function 'createChangeHandler' | 90% |
| src\utils\eventHandlers.ts | \Users\recon\buil\cursor-rules-extension\src\utils\eventHandlers.ts:61:7 | Unused function 'createVSCodeChangeHandler' | 90% |
| src\utils\eventHandlers.ts | \Users\recon\buil\cursor-rules-extension\src\utils\eventHandlers.ts:99:7 | Unused function 'handleRadixChange' | 90% |
| src\utils\eventHandlers.ts | \Users\recon\buil\cursor-rules-extension\src\utils\eventHandlers.ts:114:7 | Unused function 'createSubmitHandler' | 90% |
| src\utils\eventHandlers.ts | \Users\recon\buil\cursor-rules-extension\src\utils\eventHandlers.ts:137:7 | Unused function 'adaptHandler' | 90% |
| src\utils\eventHandlers.ts | \Users\recon\buil\cursor-rules-extension\src\utils\eventHandlers.ts:155:7 | Unused function 'normalizeChangeEvent' | 90% |
| src\utils\eventHandlers.ts | \Users\recon\buil\cursor-rules-extension\src\utils\eventHandlers.ts:171:7 | Unused function 'normalizeVSCodeEvent' | 90% |

### unused-import (1)

| File | Location | Message | Confidence |
| ---- | -------- | ------- | ---------- |
| src\utils\eventHandlers.ts | \Users\recon\buil\cursor-rules-extension\src\utils\eventHandlers.ts:9:7 | Unused import 'vscode' | 95% |

## Recommendations

1. Review high-confidence issues (90%+) first as they are most likely to be actual dead code.
2. Consider removing unused imports to improve bundle size and loading performance.
3. Unreachable code should be removed as it will never execute.
4. Commented code blocks should be either restored or removed entirely.
5. For lower confidence issues, verify manually before removing.

## Next Steps

- Run the tool regularly as part of your CI/CD pipeline
- Consider setting up a git pre-commit hook to check for dead code
- Add ignores for intentionally unused code (e.g., for documentation or future use)
