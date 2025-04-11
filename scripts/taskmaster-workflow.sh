#!/bin/bash
# Taskmaster Workflow Script for UI Component Integration

# Check current tasks and status
echo "Checking current tasks..."
taskmaster list

# Identify next task to work on
NEXT_TASK=$(taskmaster next --format=json)
TASK_ID=$(echo $NEXT_TASK | jq -r '.id')
TASK_NAME=$(echo $NEXT_TASK | jq -r '.name')

echo "Next task: #$TASK_ID - $TASK_NAME"

# Update task to in-progress
taskmaster update id=$TASK_ID status=in-progress

# Check dependencies before implementation
DEPS=$(taskmaster deps $TASK_ID --format=json)
INCOMPLETE_DEPS=$(echo $DEPS | jq '[.[] | select(.status != "completed")] | length')

if [ $INCOMPLETE_DEPS -gt 0 ]; then
  echo "Warning: Task has incomplete dependencies!"
  echo $DEPS | jq '.[] | select(.status != "completed") | "#\(.id) - \(.name) [\(.status)]"'
  
  # Prompt to continue or abort
  read -p "Continue anyway? (y/n): " CONTINUE
  if [ "$CONTINUE" != "y" ]; then
    taskmaster update id=$TASK_ID status=blocked
    echo "Task marked as blocked. Exiting."
    exit 1
  fi
fi

# Integration work happens here
# ...

# Check if task needs to be broken down
read -p "Is this task too complex and needs to be broken down? (y/n): " NEEDS_BREAKDOWN
if [ "$NEEDS_BREAKDOWN" = "y" ]; then
  taskmaster expand id=$TASK_ID
  echo "Task expanded. Exiting workflow."
  exit 0
fi

# Record architectural decisions
read -p "Any architectural decisions to document? (y/n): " HAS_DECISIONS
if [ "$HAS_DECISIONS" = "y" ]; then
  read -p "Enter decision notes: " DECISION_NOTES
  taskmaster update id=$TASK_ID notes="$DECISION_NOTES"
fi

# Mark task as completed
taskmaster update id=$TASK_ID status=completed
echo "Task #$TASK_ID completed successfully!"

# Recommend next task
echo "Suggested next task:"
taskmaster next 