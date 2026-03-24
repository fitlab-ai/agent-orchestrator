# Fix Workflow

Read this file before changing code during refinement.

### 3. Plan the Fixes

Classify and prioritize work:
1. **Blockers first**
2. **Then major issues**
3. **Finally minor issues**

For each finding, determine:
- which files must change
- what specific fix is required
- how the fix will be verified

### 4. Execute the Fixes

For each fix:
1. read the affected files
2. apply the smallest necessary change
3. verify the change addresses the review feedback
4. run the relevant tests

### 5. Run Test Verification

Run the project test command from the `test` skill and confirm that all required tests still pass.

## Notes

1. **Prerequisite**: a review artifact must exist (`review.md` or `review-r{N}.md`)
2. **No auto-commit**: do not run `git commit`
3. **Scope discipline**: only fix reviewed issues
4. **Disagreement handling**: record any disagreement in the report
5. **Re-review**: after fixing Blockers or Major issues, recommend `review-task`
6. **Consistency**: the latest review artifact, Activity Log entry, and refinement report must reference the same round
