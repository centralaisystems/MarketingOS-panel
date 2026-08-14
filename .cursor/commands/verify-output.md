# Verify output (Brand Guardian)

Run Brand Guardian against an AgentResult JSON file for a brand.

```bash
pnpm verify-output -- --brand LOTIN --file path/to/agent-result.json
```

Expect pass/fail with reasons. Contaminated or unsupported outputs must fail.
