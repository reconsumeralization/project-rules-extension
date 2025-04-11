# Tradeoff Analysis Workflow

## Overview

The Tradeoff Analysis feature in Taskmaster is designed to help developers make informed implementation decisions by systematically evaluating different approaches to solving a task. The workflow analyzes benefits, drawbacks, and implementation metrics of each approach, providing clear decision-making criteria.

## Key Components

1. **Approach Generation**: Identifies multiple viable implementation strategies
2. **Benefit/Drawback Analysis**: Evaluates pros and cons of each approach
3. **Implementation Metrics Assessment**: Estimates complexity, risk, and time requirements
4. **Decision Recommendation**: Provides data-driven suggestions based on weighted criteria
5. **Decision Documentation**: Records decisions and rationale for future reference

## Workflow Diagram

```ascii
┌─────────────────┐      ┌────────────────────┐      ┌───────────────────┐
│                 │      │                    │      │                   │
│  Task Selection ├─────►│ Approach Generation├─────►│ Criteria Analysis │
│                 │      │                    │      │                   │
└─────────────────┘      └────────────────────┘      └─────────┬─────────┘
                                                               │
┌─────────────────┐      ┌────────────────────┐      ┌─────────▼─────────┐
│                 │      │                    │      │                   │
│ Decision        │◄─────┤ Decision           │◄─────┤ Weighted          │
│ Documentation   │      │ Selection          │      │ Evaluation        │
│                 │      │                    │      │                   │
└─────────────────┘      └────────────────────┘      └───────────────────┘
```

## Detailed Workflow Steps

### 1. Task Selection and Analysis

**Input**: Task ID or description
**Process**:

- Task information is gathered from the system
- Requirements and constraints are identified
- Task complexity is assessed

**Command**:

```bash
npm run taskmaster:tradeoff-task=<task_id>
```

### 2. Approach Generation

**Process**:

- Multiple implementation approaches are identified
- MCP integration enhances approach generation with AI assistance
- Each approach is given a unique identifier and name

If using MCP integration:

```bash
npm run taskmaster:tradeoff-mcp --tradeoff-task=<task_id>
```

Key fields generated for each approach:

- **Name**: Descriptive title for the approach
- **Description**: High-level summary of implementation strategy
- **Key Technologies**: Primary technologies, libraries, or patterns used

### 3. Criteria Analysis

**Process**:

- Each approach is evaluated against standardized criteria:
  - **Benefits**: Advantages of the approach
  - **Drawbacks**: Disadvantages or potential issues
  - **Complexity**: Estimated implementation difficulty (1-5 scale)
  - **Risk**: Likelihood of complications (1-5 scale)
  - **Time Estimate**: Projected implementation time (in hours/days)

The analysis considers:

- Technical feasibility
- Alignment with project standards
- Performance implications
- Maintainability
- Testing requirements

### 4. Weighted Evaluation

**Process**:

- Criteria are weighted according to project priorities
- Default weights:
  - Complexity: 0.3 (30%)
  - Risk: 0.4 (40%)
  - Time Estimate: 0.3 (30%)
- A composite score is calculated for each approach:

```javascript
// Calculation used in taskmaster-enhanced.js
score = (5 - complexity) * complexityWeight + 
        (5 - risk) * riskWeight + 
        (1 - (timeEstimate / maxTimeEstimate)) * timeWeight;
```

Lower complexity, lower risk, and lower time estimates result in higher scores.

### 5. Decision Selection

**Process**:

- The highest-scoring approach is recommended
- The developer can:
  - Accept the recommended approach
  - Select an alternative approach with justification
  - Request additional analysis

**Interactive Selection**:

```bash
npm run taskmaster:tradeoff-task=<task_id> --interactive
```

### 6. Decision Documentation

**Process**:

- Selected approach and rationale are documented
- A markdown file is generated in `docs/taskmaster/tradeoffs/<task_id>-tradeoff.md`
- Decision is recorded in the task metadata

**Output Document Sections**:

- Task information
- Approaches considered
- Analysis criteria
- Evaluation results
- Selected approach
- Implementation guidance
- Decision rationale

## Integration with Development Workflow

### Phase Integration

The tradeoff analysis is designed to integrate at specific points in the development phase workflow:

1. **Planning Phase**: Used to determine implementation strategies

   ```bash
   npm run taskmaster:phase-planning --tradeoff-analysis
   ```

2. **Design Phase**: Used to evaluate architectural decisions

   ```bash
   npm run taskmaster:phase-design --tradeoff-analysis
   ```

3. **Pre-Implementation**: Used for final approach selection

   ```bash
   npm run taskmaster:phase-implementation --tradeoff-analysis
   ```

### GitHub Actions Integration

Tradeoff analysis can be triggered via GitHub Actions:

```yaml
name: Tradeoff Analysis
on:
  workflow_dispatch:
    inputs:
      task_id:
        description: 'Task ID to analyze'
        required: true
      use_mcp:
        description: 'Use MCP integration'
        type: boolean
        default: true
jobs:
  tradeoff:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      - name: Run Tradeoff Analysis
        run: |
          npm ci
          npm run taskmaster:tradeoff-task=${{ inputs.task_id }} ${{ inputs.use_mcp && '--mcp-integrate' || '' }}
```

## Configuration Options

The tradeoff analysis workflow can be customized through the following configuration options:

### Criteria Weights

Adjust the weights in `config/taskmaster-config.json`:

```json
{
  "tradeoffAnalysis": {
    "weights": {
      "complexity": 0.3,
      "risk": 0.4,
      "timeEstimate": 0.3
    }
  }
}
```

### Custom Criteria

Add custom evaluation criteria:

```json
{
  "tradeoffAnalysis": {
    "additionalCriteria": [
      {
        "name": "maintainability",
        "weight": 0.2,
        "scale": 1-5
      }
    ]
  }
}
```

## MCP Integration

When MCP integration is enabled:

1. The system connects to the MCP server
2. AI agents analyze the task and generate approaches
3. Detailed analysis of benefits and drawbacks is enhanced
4. Decision recommendations include AI-powered insights

To enable MCP integration:

```bash
npm run taskmaster:tradeoff-mcp --tradeoff-task=<task_id>
```

## Example Output

A typical tradeoff analysis document includes:

```markdown
# Tradeoff Analysis: Task ID-123 - Implement User Authentication

## Task Description
Implement user authentication system with social login options.

## Approaches Considered

### Approach 1: Custom Authentication System
**Description**: Build a custom authentication system from scratch
**Technologies**: Express.js, JWT, MongoDB
...

### Approach 2: Auth0 Integration
**Description**: Integrate Auth0 as authentication provider
**Technologies**: Auth0 SDK, Express.js
...

### Approach 3: Firebase Authentication
**Description**: Use Firebase Authentication service
**Technologies**: Firebase SDK, Web API
...

## Analysis

| Criteria       | Custom Auth | Auth0  | Firebase |
|----------------|-------------|--------|----------|
| Complexity     | 4           | 2      | 2        |
| Risk           | 4           | 2      | 2        |
| Time Estimate  | 5 days      | 2 days | 2 days   |
| Score          | 0.40        | 0.80   | 0.80     |

## Selected Approach
**Auth0 Integration** was selected.

## Decision Rationale
While both Auth0 and Firebase scored equally, Auth0 was chosen due to:
1. Better compatibility with existing systems
2. More flexible user management features
3. Team's previous experience with Auth0
```

## Troubleshooting

### Common Issues

1. **Analysis Timing Out**
   - Increase timeout in configuration
   - Break task into smaller components

2. **MCP Connection Failures**
   - Verify MCP server URL and token
   - Check network connectivity
   - Run with `--verbose` flag for detailed logs

3. **Missing or Incomplete Analysis**
   - Ensure task has sufficient details
   - Run in verbose mode to diagnose
   - Try with `--detailed-analysis` flag

## Best Practices

1. **Use Early in Development**
   - Run tradeoff analysis during planning and design phases
   - Revisit analysis if requirements change significantly

2. **Provide Detailed Task Information**
   - Include clear requirements
   - Specify constraints and priorities
   - Reference related tasks or components

3. **Document Decision Rationale**
   - Always include reasoning for approach selection
   - Note team discussions and considerations
   - Document any overrides of recommended approaches

4. **Review Historical Decisions**
   - Refer to past tradeoff analyses for similar tasks
   - Learn from previous implementation outcomes
   - Refine decision criteria based on past results
