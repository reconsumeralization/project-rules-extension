# Phase-Based Development with Enhanced Taskmaster

This guide explains the phase-based development approach implemented in the Enhanced Taskmaster system, including how phases are defined, transition criteria, and integration with other components.

## Overview

Phase-based development is a structured approach that divides the software development process into discrete, manageable phases. Each phase has clear entry and exit criteria, specific goals, and appropriate tooling. The Enhanced Taskmaster system implements this approach to provide better organization, tracking, and automation of the development workflow.

## Development Phases

The Enhanced Taskmaster system defines six standard development phases:

### 1. Planning Phase

The initial phase where requirements are gathered, analyzed, and formalized into tasks.

**Key Activities:**

- Requirements gathering and analysis
- Task definition and breakdown
- Estimation and prioritization
- Resource allocation
- Risk assessment

**Tools and Scripts:**

```bash
# Initiate planning phase
npm run taskmaster:planning

# Create initial task breakdown
npm run taskmaster:analyze-task -- --task=<task_id>

# Generate planning report
npm run taskmaster:planning:report
```

**Exit Criteria:**

- All high-level requirements are documented
- Tasks are broken down into manageable units
- Initial estimates are established
- Dependencies are identified
- Stakeholders have approved the plan

### 2. Design Phase

The phase where architectural and design decisions are made to address the requirements identified in the planning phase.

**Key Activities:**

- System architecture design
- Component interface definition
- Database schema design
- API specification
- UI/UX prototyping
- Tradeoff analysis for key decisions

**Tools and Scripts:**

```bash
# Initiate design phase
npm run taskmaster:design

# Perform tradeoff analysis
npm run taskmaster:tradeoff-task -- --task=<task_id>

# Generate design documentation
npm run taskmaster:design:generate-docs
```

**Exit Criteria:**

- Architecture documents are complete
- Design decisions are documented with rationale
- Tradeoff analyses are completed for key decisions
- Interfaces are specified
- Design has been reviewed and approved

### 3. Implementation Phase

The phase where the actual code is written according to the designs developed in the previous phase.

**Key Activities:**

- Code development
- Unit testing
- Integration of components
- Documentation of code
- Static code analysis
- Developer testing

**Tools and Scripts:**

```bash
# Initiate implementation phase
npm run taskmaster:implementation

# Work on a specific task
npm run taskmaster:task -- --task=<task_id>

# Mark a task as complete
npm run taskmaster:complete -- --task=<task_id>
```

**Exit Criteria:**

- All planned code is written
- Code passes static analysis and linting
- Unit tests are written and passing
- Code is reviewed
- Technical documentation is updated

### 4. Testing Phase

The phase dedicated to thorough testing of the implemented features to ensure quality and compliance with requirements.

**Key Activities:**

- Integration testing
- System testing
- Performance testing
- Security testing
- Accessibility testing
- Bug reporting and triage

**Tools and Scripts:**

```bash
# Initiate testing phase
npm run taskmaster:testing

# Generate test plan
npm run taskmaster:testing:plan -- --task=<task_id>

# Record test results
npm run taskmaster:testing:results -- --task=<task_id> --status=<pass|fail>
```

**Exit Criteria:**

- All tests are executed
- Critical and high-priority bugs are resolved
- Test coverage meets defined thresholds
- Performance meets requirements
- Testing documentation is complete

### 5. Review Phase

The phase where the entire implementation is reviewed holistically to ensure it meets all requirements and quality standards.

**Key Activities:**

- Code review
- Documentation review
- Security review
- Accessibility review
- Performance evaluation
- Final stakeholder review

**Tools and Scripts:**

```bash
# Initiate review phase
npm run taskmaster:review

# Start review process
npm run taskmaster:review:start -- --task=<task_id>

# Submit review results
npm run taskmaster:review:complete -- --task=<task_id> --approved=<true|false>
```

**Exit Criteria:**

- All reviews are completed
- All critical feedback is addressed
- Documentation is complete and accurate
- Implementation is approved by stakeholders
- Final acceptance criteria are met

### 6. Deployment Phase

The final phase where the completed work is prepared for and released to production environments.

**Key Activities:**

- Deployment preparation
- Release notes compilation
- User documentation finalization
- Production deployment
- Post-deployment monitoring
- Handover to operations/support

**Tools and Scripts:**

```bash
# Initiate deployment phase
npm run taskmaster:deployment

# Generate release notes
npm run taskmaster:deployment:release-notes

# Execute deployment
npm run taskmaster:deployment:execute
```

**Exit Criteria:**

- Deployment is successful
- Deployment is verified in production
- Release documentation is complete
- Users/stakeholders are notified
- Support team is briefed
- Project retrospective is completed

## Phase Transitions

Transitioning between phases is a critical aspect of the phase-based development approach. Each transition represents a milestone in the development process and requires specific criteria to be met.

### Transition Workflow

1. **Evaluate Exit Criteria**: Check if all exit criteria for the current phase are met
2. **Generate Phase Report**: Document achievements, issues, and metrics from the phase
3. **Conduct Phase Review**: Hold a review meeting to discuss the phase outcomes
4. **Approve Transition**: Get formal approval to move to the next phase
5. **Initialize Next Phase**: Set up the environment for the next phase's activities

### Transition Commands

```bash
# Check if ready for transition
npm run taskmaster:phase-check -- --phase=<current_phase>

# Generate phase report
npm run taskmaster:phase-report -- --phase=<current_phase>

# Transition to next phase
npm run taskmaster:transition -- --from=<current_phase> --to=<next_phase>
```

### Transition Matrix

The following matrix shows the valid transitions between phases:

| From \ To | Planning | Design | Implementation | Testing | Review | Deployment |
|-----------|---------|--------|----------------|---------|---------|------------|
| **Planning** | - | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Design** | ✅ | - | ✅ | ❌ | ❌ | ❌ |
| **Implementation** | ✅ | ✅ | - | ✅ | ❌ | ❌ |
| **Testing** | ✅ | ✅ | ✅ | - | ✅ | ❌ |
| **Review** | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| **Deployment** | ✅ | ✅ | ✅ | ✅ | ✅ | - |

Note: ✅ = Valid transition, ❌ = Invalid direct transition

While the normal flow is sequential, it's possible to return to previous phases when necessary (e.g., if design issues are discovered during implementation).

## MCP Integration with Phases

The Enhanced Taskmaster integrates with Model Context Protocol (MCP) server to provide AI-assisted capabilities tailored to each development phase.

### Phase-Specific MCP Agents

Each development phase has a designated MCP agent with specialized capabilities:

| Phase | MCP Agent | Capabilities |
|-------|-----------|--------------|
| Planning | Protocol Validator Agent | Requirement analysis, task decomposition, estimation assistance |
| Design | Protocol Enhancement Agent | Architecture advice, tradeoff analysis, interface design |
| Implementation | Integration Assistant Agent | Code generation, refactoring suggestions, documentation |
| Testing | Monitoring & Analytics Agent | Test case generation, bug analysis, coverage optimization |
| Review | Protocol Validator Agent | Code review, security analysis, quality assessment |
| Deployment | Integration Assistant Agent | Release automation, deployment verification, monitoring setup |

### Enabling MCP Integration

To enable MCP integration for any phase:

```bash
# Enable MCP integration for a specific phase
npm run taskmaster:phase -- --phase=<phase_name> --mcp-integrate

# Run a specific task with MCP assistance
npm run taskmaster:task -- --task=<task_id> --mcp-integrate
```

### MCP Configuration

The MCP integration can be configured in `.env` or through command-line parameters:

```bash
# .env file configuration
MCP_SERVER_URL=https://mcp-server.example.com
MCP_API_KEY=your-api-key
MCP_LOG_LEVEL=info
MCP_TIMEOUT=30000
```

## Task Tracking Across Phases

Enhanced Taskmaster maintains task state and metadata across phase transitions to provide continuity and traceability.

### Task Phase Metadata

Each task record includes phase-specific metadata:

```json
{
  "id": "task123",
  "title": "Implement user authentication",
  "phases": {
    "planning": {
      "status": "completed",
      "estimatedEffort": "3 days",
      "priority": "high",
      "completedAt": "2023-05-10T15:30:00Z"
    },
    "design": {
      "status": "completed",
      "artifacts": ["auth-flow-diagram.png", "api-spec.md"],
      "decisions": ["jwt-vs-session.md"],
      "completedAt": "2023-05-15T11:20:00Z"
    },
    "implementation": {
      "status": "in-progress",
      "startedAt": "2023-05-16T09:00:00Z",
      "commits": ["a1b2c3d", "e4f5g6h"],
      "completion": 75
    },
    "testing": {
      "status": "not-started"
    },
    "review": {
      "status": "not-started"
    },
    "deployment": {
      "status": "not-started"
    }
  }
}
```

### Querying Task Status by Phase

```bash
# View task status across all phases
npm run taskmaster:task-status -- --task=<task_id>

# View tasks in a specific phase with their status
npm run taskmaster:phase-tasks -- --phase=<phase_name>

# View all tasks that are blocked in any phase
npm run taskmaster:blocked-tasks
```

## Metrics and Reporting

Enhanced Taskmaster collects metrics for each phase to enable data-driven process improvement.

### Phase Metrics

| Metric | Description |
|--------|-------------|
| Duration | Time spent in the phase |
| Task Completion Rate | Percentage of tasks completed vs. planned |
| Blockers | Number of reported blockers |
| Revisions | Number of tasks that required revision |
| MCP Assists | Number of times MCP agents assisted |
| Effort Variance | Actual vs. estimated effort |

### Generating Reports

```bash
# Generate metrics for a specific phase
npm run taskmaster:metrics -- --phase=<phase_name>

# Generate project-wide phase metrics
npm run taskmaster:metrics-all

# Generate a phase comparison report
npm run taskmaster:phase-comparison
```

## Customizing Phases

The Enhanced Taskmaster system allows for customization of phases to match specific project needs.

### Adding a Custom Phase

1. Define the phase in your configuration:

```json
{
  "phases": {
    "validation": {
      "displayName": "User Validation",
      "description": "User acceptance testing and feedback",
      "order": 5.5,
      "mcpAgent": "User Feedback Analysis Agent",
      "requiredArtifacts": ["feedback-form", "user-test-scenarios"],
      "exitCriteria": ["user-feedback-addressed", "acceptance-criteria-met"]
    }
  }
}
```

1. Register any phase-specific scripts in package.json:

```json
{
  "scripts": {
    "taskmaster:validation": "node scripts/taskmaster-enhanced.js --phase=validation",
    "taskmaster:validation:report": "node scripts/taskmaster-enhanced.js --phase=validation --generate-report"
  }
}
```

1. Use the customized phase in your workflow:

```bash
npm run taskmaster:validation
```

### Disabling a Phase

Phases can be disabled if not needed for a particular project:

```bash
# Disable a phase
npm run taskmaster:config -- --disable-phase=<phase_name>

# Re-enable a phase
npm run taskmaster:config -- --enable-phase=<phase_name>
```

## GitHub Actions Integration

The phase-based workflow integrates with GitHub Actions for automated CI/CD processes.

### Workflow Configuration

The Enhanced Taskmaster GitHub Action workflow is configured to support phase-based development:

```yaml
name: Enhanced Taskmaster Workflow

on:
  workflow_dispatch:
    inputs:
      phase:
        description: 'Development phase'
        required: true
        type: choice
        options:
          - planning
          - design
          - implementation
          - testing
          - review
          - deployment
      action:
        description: 'Action to perform'
        required: true
        type: choice
        options:
          - check-current
          - generate-report
          - analyze-tasks
          - next-task
          - complete-current
```

### Phase-Specific Actions

Each GitHub Actions run is associated with a specific development phase, allowing for appropriate automation:

1. **Planning Phase Actions**:
   - Automatic task breakdown
   - Requirements documentation generation
   - Integration with issue tracking systems

2. **Design Phase Actions**:
   - Automatic diagram generation
   - API documentation creation
   - Tradeoff analysis documentation

3. **Implementation Phase Actions**:
   - Code quality checks
   - Documentation generation
   - Integration testing

4. **Testing Phase Actions**:
   - Automated test execution
   - Test coverage reporting
   - Bug tracking integration

5. **Review Phase Actions**:
   - Code review automation
   - Compliance checks
   - Documentation verification

6. **Deployment Phase Actions**:
   - Release automation
   - Environment configuration
   - Deployment verification

## Example Workflows

### Standard Sequential Development

The typical flow through all phases in sequence:

1. **Planning**: Define requirements and break down tasks

   ```bash
   npm run taskmaster:planning
   npm run taskmaster:analyze-task -- --task=feature123
   npm run taskmaster:planning:report
   ```

2. **Design**: Create architecture and design documents

   ```bash
   npm run taskmaster:transition -- --from=planning --to=design
   npm run taskmaster:design
   npm run taskmaster:tradeoff-task -- --task=feature123
   ```

3. **Implementation**: Develop the code

   ```bash
   npm run taskmaster:transition -- --from=design --to=implementation
   npm run taskmaster:implementation
   npm run taskmaster:task -- --task=feature123
   ```

4. **Testing**: Verify functionality

   ```bash
   npm run taskmaster:transition -- --from=implementation --to=testing
   npm run taskmaster:testing
   npm run taskmaster:testing:plan -- --task=feature123
   ```

5. **Review**: Conduct final reviews

   ```bash
   npm run taskmaster:transition -- --from=testing --to=review
   npm run taskmaster:review
   npm run taskmaster:review:complete -- --task=feature123 --approved=true
   ```

6. **Deployment**: Release to production

   ```bash
   npm run taskmaster:transition -- --from=review --to=deployment
   npm run taskmaster:deployment
   npm run taskmaster:deployment:execute
   ```

### Handling Rework

When issues are discovered that require revisiting a previous phase:

1. **Issue discovered in Testing**:

   ```bash
   # Record the issue
   npm run taskmaster:testing:issue -- --task=feature123 --description="Authentication fails for edge case"
   
   # Transition back to implementation
   npm run taskmaster:transition -- --from=testing --to=implementation --reason="Fix authentication edge case"
   
   # Work on the fix
   npm run taskmaster:task -- --task=feature123
   
   # Mark as fixed and return to testing
   npm run taskmaster:complete -- --task=feature123
   npm run taskmaster:transition -- --from=implementation --to=testing
   ```

## Best Practices

### Phase Management

1. **Clear Criteria**: Define clear entry and exit criteria for each phase
2. **Regular Reviews**: Conduct phase reviews to assess readiness for transition
3. **Documentation**: Maintain documentation for decisions made in each phase
4. **Metrics Tracking**: Collect and analyze phase metrics to identify bottlenecks
5. **Feedback**: Incorporate feedback from each phase into process improvements

### Using MCP Integration Effectively

1. **Phase Specificity**: Use phase-specific MCP agents for their specialized capabilities
2. **Review AI Output**: Always review and validate AI-generated content
3. **Feedback Loop**: Provide feedback to improve MCP agent performance
4. **Fallback Plan**: Have a plan for cases where MCP integration is unavailable
5. **Progressive Enhancement**: Use MCP to enhance, not replace, human expertise

### Cross-Phase Considerations

1. **Knowledge Transfer**: Ensure knowledge is transferred between phases
2. **Traceability**: Maintain traceability from requirements to implementation
3. **Consistency**: Use consistent terminology and artifacts across phases
4. **Iterative Refinement**: Allow for iterative refinement within and across phases
5. **Stakeholder Involvement**: Involve stakeholders at appropriate points in each phase

## Troubleshooting

### Common Issues

1. **Phase Transition Failures**
   - Ensure all exit criteria are met
   - Check for unresolved blockers
   - Verify required artifacts exist

2. **MCP Integration Issues**
   - Verify MCP server connectivity
   - Check API keys and authentication
   - Ensure the correct agent is specified for the phase

3. **Task Tracking Inconsistencies**
   - Run the task reconciliation command: `npm run taskmaster:reconcile`
   - Check for duplicate task IDs
   - Verify phase metadata is complete

4. **Customization Problems**
   - Ensure custom phases are properly registered
   - Check configuration syntax
   - Verify script paths and commands

### Getting Help

For additional assistance:

- Check the Enhanced Taskmaster documentation
- View logs: `npm run taskmaster:logs -- --phase=<phase_name>`
- Run diagnostics: `npm run taskmaster:diagnostics`
- Consult the community forum at [taskmaster-community.example.com](https://taskmaster-community.example.com)

## Conclusion

The phase-based development approach implemented in Enhanced Taskmaster provides a structured, traceable, and efficient process for software development. By clearly defining phases, establishing criteria for transitions, and integrating with MCP for AI assistance, teams can achieve better organization, quality, and visibility throughout the development lifecycle.

For more information on specific aspects of Enhanced Taskmaster, refer to:

- [Enhanced Taskmaster Guide](./enhanced-taskmaster-guide.md)
- [Tradeoff Analysis Guide](./tradeoff-analysis-guide.md)
- [MCP Integration Guide](./mcp-integration-guide.md)
- [GitHub Actions Integration](./github-actions-integration.md)
