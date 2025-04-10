import * as vscode from 'vscode'
import { Task, TaskPriority, TaskStatus, TaskMetadata } from '../models/task'
import * as ruleController from '../controllers/ruleController'
import * as taskController from '../controllers/taskController'
import * as crypto from 'crypto'
import { AiService } from './aiService'
import * as path from 'path'
import { getProjectContextSummary } from '../utils'

/**
 * Service for AI-powered task management features
 */
export class TaskAiService {
  private _extensionContext: vscode.ExtensionContext
  private _aiService: AiService
  
  constructor(context: vscode.ExtensionContext) {
    this._extensionContext = context
    this._aiService = new AiService(context)
  }
  
  /**
   * Analyzes rule content to generate suggested tasks
   * @param ruleId The ID of the rule to analyze
   * @returns Array of suggested tasks
   */
  async generateTasksFromRule(ruleId: string): Promise<Task[]> {
    try {
      // Get the rule content
      const rule = ruleController.getRuleById(ruleId)
      if (!rule) {
        throw new Error(`Rule with ID ${ruleId} not found`)
      }

      // Extract content from rule for analysis
      const prompt = this._buildPromptForRuleAnalysis(rule)
      
      // Call an AI service to analyze the rule and suggest tasks
      const taskSuggestions = await this._aiService.analyzeWithAI<any[]>(prompt)
      
      // Convert AI suggestions to Task objects
      return this._convertSuggestionsToTasks(taskSuggestions, ruleId)
    } catch (error) {
      console.error('Error generating tasks from rule:', error)
      throw error
    }
  }
  
  /**
   * Parses a natural language task description into structured task data
   * @param description Natural language task description
   * @returns Structured task data
   */
  async parseTaskDescription(description: string): Promise<Partial<Task>> {
    try {
      const prompt = this._buildPromptForTaskParsing(description)
      
      // Call AI to parse the description
      const parsedTask = await this._aiService.analyzeWithAI<any>(prompt)
      
      // Return a partial task object
      return {
        metadata: {
          // These required fields will be filled in by the controller
          id: '',
          title: parsedTask.title || '',
          createdAt: 0,
          updatedAt: 0,
          syncStatus: 'local-only',
          // Optional fields
          description: parsedTask.description,
          assignedTo: parsedTask.assignee,
          dueDate: parsedTask.dueDate ? new Date(parsedTask.dueDate).getTime() : undefined,
          aiGenerated: true
        },
        status: this._convertStatusFromAI(parsedTask.status),
        priority: this._convertPriorityFromAI(parsedTask.priority),
        ruleId: parsedTask.relatedRuleId
      }
    } catch (error) {
      console.error('Error parsing task description:', error)
      throw error
    }
  }
  
  /**
   * Suggests appropriate assignees for a task based on content and context
   * @param taskDescription Task description or content
   * @returns Array of suggested assignee names/ids
   */
  async suggestTaskAssignees(taskDescription: string): Promise<string[]> {
    try {
      const prompt = this._buildPromptForAssigneeSuggestion(taskDescription)
      
      // Call AI to suggest assignees
      const suggestions = await this._aiService.analyzeWithAI<{assignees: string[]}>(prompt)
      
      return suggestions.assignees || []
    } catch (error) {
      console.error('Error suggesting assignees:', error)
      return []
    }
  }
  
  /**
   * Estimates the complexity and time required for a task
   * @param task Task to analyze
   * @returns Complexity score and time estimate
   */
  async estimateTaskEffort(task: Task): Promise<{ complexity: number, estimatedHours: number }> {
    try {
      const prompt = this._buildPromptForEffortEstimation(task)
      
      // Call AI to estimate effort
      const estimate = await this._aiService.analyzeWithAI<{
        complexity: number;
        estimatedHours: number;
      }>(prompt)
      
      return {
        complexity: estimate.complexity || 3, // 1-5 scale
        estimatedHours: estimate.estimatedHours || 4 // Default to 4 hours
      }
    } catch (error) {
      console.error('Error estimating task effort:', error)
      return { complexity: 3, estimatedHours: 4 }
    }
  }
  
  /**
   * Executes a task autonomously using AI capabilities
   * @param taskId The ID of the task to execute
   * @returns Result of task execution including completion status and any generated tasks
   */
  async executeTask(taskId: string): Promise<{
    completed: boolean;
    status: TaskStatus;
    result: string;
    generatedTasks?: Partial<Task>[];
    suggestedRules?: any[];
  }> {
    let task: Task | undefined;
    try {
      task = taskController.getTaskById(taskId);
      if (!task) throw new Error(`Task with ID ${taskId} not found`);
      if (task.status === 'completed') {
        return {
          completed: true,
          status: 'completed',
          result: 'Task was already completed.'
        }
      }

      // Fetch Rule Content
      let ruleContent: string | null = null;
      if (task.ruleId) {
        const rule = ruleController.getRuleById(task.ruleId);
        if (rule) ruleContent = rule.content;
      }

      // --- Get Configuration ---
      const config = vscode.workspace.getConfiguration('ProjectRules.ai.context');
      const maxFiles = config.get<number>('maxFiles', 5); // Default 5
      const maxCharsPerFile = config.get<number>('maxFileChars', 2000); // Default 2000
      const enableSummarization = config.get<boolean>('enableSummarization', true); // Default true
      const includeRuleContext = config.get<boolean>('includeRuleContextInTaskExecution', true); // Default true

      // Fetch Workspace File Context
      let fileSnippets: { [filePath: string]: string } = {};
      const textToSearch = `${task.metadata.title}\n${task.metadata.description || ''}\n${ruleContent || ''}`;
      const potentialPaths = this._extractFilePaths(textToSearch);
      const validatedPaths: string[] = [];

      if (potentialPaths.length > 0) {
          console.log(`TaskAiService: Validating ${potentialPaths.length} potential file paths...`);
          const workspaceFolders = vscode.workspace.workspaceFolders;
          const workspaceRootUri = workspaceFolders?.[0]?.uri;

          for (const potentialPath of potentialPaths) {
              let fileUri: vscode.Uri | undefined = undefined;
              try {
                 if (path.isAbsolute(potentialPath)) {
                    fileUri = vscode.Uri.file(potentialPath);
                 } else if (workspaceRootUri) {
                    fileUri = vscode.Uri.joinPath(workspaceRootUri, potentialPath);
                 } else {
                     // Cannot reliably resolve relative path without workspace
                     continue; 
                 }
                 
                 // --- Validation Step ---
                 await vscode.workspace.fs.stat(fileUri); // Throws error if not found/accessible
                 validatedPaths.push(potentialPath); // Add to list of paths to read
                 console.log(`   Validated: ${potentialPath}`);

              } catch (error: any) {
                   // If stat fails (likely FileNotFound), just ignore this path silently or log minimally
                   if (error.code !== 'FileNotFound' && error.code !== 'ENOENT') { 
                       console.warn(`   Validation error for ${potentialPath} (URI: ${fileUri?.toString()}): ${error.message}`);
                   } else {
                       // console.log(`   Validation failed (Not Found): ${potentialPath}`); // Too noisy maybe
                   }
              }
          }
          console.log(`TaskAiService: Validation complete. ${validatedPaths.length} paths seem valid.`);
      }

      // --- Read Content for Validated Paths ---
      if (validatedPaths.length > 0) {
          console.log(`TaskAiService: Reading content for up to ${maxFiles} validated paths...`);
          let filesReadCount = 0;
          for (const validPath of validatedPaths) {
              if (filesReadCount >= maxFiles) {
                  console.log(`   Reached max context file limit (${maxFiles}). Skipping remaining validated paths.`);
                  break;
              }
              // Pass configured maxCharsPerFile and enableSummarization to _readFileContent
              const snippet = await this._readFileContent(validPath, maxCharsPerFile, enableSummarization);
              if (snippet !== null) {
                  fileSnippets[validPath] = snippet;
                  filesReadCount++;
                  console.log(`   Successfully read/summarized context for: ${validPath}`);
              } else {
                   console.warn(`   Failed to read content for validated path: ${validPath}`);
              }
          }
           console.log(`TaskAiService: Finished reading context for ${filesReadCount} files.`);
      }

      // --- Fetch Related Tasks Context --- 
      let relatedTasks: Task[] = [];
      if (task.ruleId) {
          try {
              const allRuleTasks = taskController.getTasksForRule(task.ruleId);
              relatedTasks = allRuleTasks.filter(t => t.metadata.id !== taskId); // Exclude current task
              if (relatedTasks.length > 0) {
                  console.log(`TaskAiService: Found ${relatedTasks.length} related tasks for rule ${task.ruleId}.`);
              }
          } catch (relatedTaskError) {
              console.error(`TaskAiService: Failed to get related tasks for rule ${task.ruleId}:`, relatedTaskError);
              // Continue without related task context
          }
      }

      // --- Fetch Project Context --- 
      const projectContext = await getProjectContextSummary();

      // --- Mark as In-Progress --- 
      await taskController.updateTaskStatus(this._extensionContext, taskId, 'in-progress');

      // Prepare prompt for AI execution
      const prompt = this._buildPromptForTaskExecution(
        task, 
        includeRuleContext ? ruleContent : null, 
        fileSnippets,
        relatedTasks,
        projectContext // Pass project context
      );
      
      // Execute task via AI service
      const result = await this._aiService.analyzeWithAI<{
        completed: boolean;
        blocked: boolean;
        result: string;
        generatedTasks?: any[];
        suggestedRules?: any[];
      }>(prompt);

      // Process Result
      const newStatus: TaskStatus = result.completed ? 'completed' : result.blocked ? 'blocked' : 'in-progress';
      
      // Prepare update payload
      let taskUpdatePayload: Partial<TaskMetadata & Pick<Task, 'status' | 'priority' | 'ruleId'> > = {
          status: newStatus
      };
      
      // If blocked (by AI or error), store the reason
      if (newStatus === 'blocked') {
          const blockReason = result.result || 'No specific reason provided by AI.';
          taskUpdatePayload.lastError = `AI Blocked: ${blockReason}`;
          console.log(`Task ${taskId} marked as blocked by AI. Reason: ${blockReason}`);
      } else {
          // Clear last error if task is no longer blocked (or completed)
          if (task.metadata.lastError) { // Only add if it needs clearing
              taskUpdatePayload.lastError = undefined; 
          }
      }
      
      // Apply the update
      await taskController.updateTask(this._extensionContext, taskId, taskUpdatePayload);

      const generatedTasks: Partial<Task>[] = [];
      if (result.generatedTasks && Array.isArray(result.generatedTasks)) {
         for (const taskData of result.generatedTasks) {
            const newTask = {
               metadata: {
                  id: crypto.randomUUID(),
                  title: taskData.title || 'Untitled AI Task',
                  description: taskData.description,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  syncStatus: 'local-only' as const,
                  assignedTo: taskData.assignee || 'AI Assistant',
                  aiGenerated: true
               },
               status: this._convertStatusFromAI(taskData.status || 'todo'),
               priority: this._convertPriorityFromAI(taskData.priority || 'medium'),
               ruleId: task.ruleId
            }
            generatedTasks.push(newTask);
         }
      }
      
      vscode.window.showInformationMessage(
        `AI executed task "${task.metadata.title}": ${newStatus === 'completed' ? 'Completed' : (newStatus === 'blocked' ? 'Blocked' : 'In progress')}`
      );
      
      return {
        completed: newStatus === 'completed',
        status: newStatus,
        result: result.result || 'Task execution completed.',
        generatedTasks: generatedTasks.length > 0 ? generatedTasks : undefined,
        suggestedRules: result.suggestedRules
      };
    } catch (error) {
      console.error('Error executing task:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (taskId && task) { // Ensure taskId and task are available
         try {
            // Update status AND set lastError
            await taskController.updateTask(this._extensionContext, taskId, {
                 status: 'blocked',
                 lastError: `Execution Error: ${errorMessage}`
                 // Don't append to description anymore
            });
            console.warn(`Task ${taskId} marked as blocked due to error during execution. Error stored.`);
         } catch (updateErr) {
            console.error(`Failed to mark task ${taskId} as blocked after error:`, updateErr);
         }
      }
      throw error; // Re-throw original error
    }
  }
  
  /**
   * Autonomously works on rules and tasks, looking for opportunities to complete tasks
   * and generate new ones based on completion results
   * @returns Summary of actions taken
   */
  async executeAutonomousWorkCycle(): Promise<{
    tasksCompleted: number;
    tasksCreated: number;
    rulesCreated: number;
  }> {
    try {
      const allTasks = taskController.getTasks()
      
      // Filter for tasks assigned to AI
      const aiTasks = allTasks.filter(task => 
        (task.metadata.assignedTo === 'AI' || task.metadata.assignedTo === 'AI Assistant') && 
        task.status !== 'completed' && 
        task.status !== 'blocked'
      )
      
      if (aiTasks.length === 0) {
        return { tasksCompleted: 0, tasksCreated: 0, rulesCreated: 0 }
      }
      
      // Statistics
      let tasksCompleted = 0
      let tasksCreated = 0
      let rulesCreated = 0
      
      // Process each AI task
      for (const task of aiTasks) {
        // Execute the task
        const result = await this.executeTask(task.metadata.id)
        
        if (result.completed) {
          tasksCompleted++
        }
        
        // Create any generated tasks
        if (result.generatedTasks && result.generatedTasks.length > 0) {
          for (const newTask of result.generatedTasks) {
            if (newTask.metadata?.title) {
              await taskController.createNewTask(this._extensionContext, {
                title: newTask.metadata.title,
                description: newTask.metadata?.description,
                assignedTo: newTask.metadata?.assignedTo || 'AI Assistant',
                status: newTask.status || 'todo',
                priority: newTask.priority || 'medium',
                ruleId: newTask.ruleId
              })
              tasksCreated++
            }
          }
        }
        
        // Create rules from suggestions
        if (result.suggestedRules && result.suggestedRules.length > 0) {
          for (const ruleData of result.suggestedRules) {
            if (ruleData.name && ruleData.content) {
              try {
                // Use our programmatic rule creation method
                const ruleId = await ruleController.createRuleProgrammatically(
                  this._extensionContext,
                  ruleData.name,
                  ruleData.content,
                  true // aiGenerated
                )
                
                if (ruleId) {
                  rulesCreated++
                  console.log(`Created rule "${ruleData.name}" programmatically`)
                }
              } catch (error) {
                console.error(`Error creating rule "${ruleData.name}":`, error)
              }
            }
          }
        }
      }
      
      return { tasksCompleted, tasksCreated, rulesCreated }
    } catch (error) {
      console.error('Error in autonomous work cycle:', error)
      return { tasksCompleted: 0, tasksCreated: 0, rulesCreated: 0 }
    }
  }
  
  // Private helper methods
  
  /**
   * Builds a prompt for rule analysis
   */
  private _buildPromptForRuleAnalysis(rule: any): string {
    const ruleContent = rule.content || ''
    const ruleMetadata = rule.metadata || {}
    
    return `
    You are an AI assistant responsible for breaking down high-level rules into concrete implementation tasks for a software project.

    Analyze the following Model Context Protocol (MCP) rule:

    **Rule Details:**
    ID: ${ruleMetadata.id}
    Name: ${ruleMetadata.filename || 'Unnamed Rule'}

    **Rule Content:**
    \`\`\`
    ${ruleContent}
    \`\`\`

    **Instructions:**
    1.  **Understand the Goal:** Grasp the core objective and requirements defined by this rule.
    2.  **Identify Implementation Steps:** Determine the specific, actionable steps needed to implement or enforce this rule within a codebase. Think about what code needs to be written, modified, or configured.
    3.  **Generate Tasks:** Create a list of granular tasks representing these implementation steps. Aim for tasks that are small enough to be manageable. Suggest 3-5 tasks, but adjust based on the rule's complexity.
    4.  **Task Details:** For each task, provide:
        *   \`title\`: A concise title starting with an action verb (e.g., "Implement...", "Update...", "Create...", "Configure...", "Refactor...").
        *   \`description\`: A clear description of the work involved, including *why* it's necessary based on the rule. Mention specific functions, files, or components if obvious from the rule, but avoid hallucinating details.
        *   \`priority\`: Assign 'high', 'medium', or 'low' based on the perceived importance or foundational nature of the step for the rule's implementation.
        *   \`status\`: Set the initial status, typically 'todo'.
    5.  **Avoid Redundancy:** Do not simply rephrase the rule as a task. Focus on the *actions* needed to satisfy the rule.

    **Output Format:**
    Respond **ONLY** with a single, valid JSON array containing task objects. Do not include any introductory text or explanations outside the JSON structure.
    \`\`\`json
    [
      {
        "title": "string (Action Verb Start)",
        "description": "string (Clear explanation of work)",
        "priority": "high" | "medium" | "low",
        "status": "todo" | "in-progress"
      }
      // ... more task objects if needed
    ]
    \`\`\`
    `;
  }
  
  /**
   * Builds a prompt for natural language task parsing
   */
  private _buildPromptForTaskParsing(description: string): string {
    return `
    Parse the following natural language task description into structured fields:
    
    "${description}"
    
    Extract the following information (if present):
    - Task title
    - Detailed description
    - Priority level (high, medium, low)
    - Status (pending, in-progress, completed, blocked)
    - Due date
    - Assignee
    - Related rule ID (if mentioned)
    
    Format your response as a JSON object with the following properties:
    title, description, priority, status, dueDate (YYYY-MM-DD format), assignee, relatedRuleId
    `
  }
  
  /**
   * Builds a prompt for assignee suggestion
   */
  private _buildPromptForAssigneeSuggestion(taskDescription: string): string {
    return `
    Based on the following task description, suggest appropriate team members to assign this task to:
    
    "${taskDescription}"
    
    Considering the technical requirements implied in this task, who would be the best fit to work on it?
    
    Format your response as a JSON object with an 'assignees' property containing an array of names.
    `
  }
  
  /**
   * Builds a prompt for effort estimation
   */
  private _buildPromptForEffortEstimation(task: Task): string {
    return `
    Estimate the complexity and effort required for the following task:
    
    TITLE: ${task.metadata.title}
    DESCRIPTION: ${task.metadata.description || 'No description provided'}
    
    Analyze the technical requirements and scope of this task to provide:
    1. A complexity score on a scale of 1-5 (1 being simplest, 5 being most complex)
    2. An estimated number of hours to complete this task
    
    Format your response as a JSON object with 'complexity' and 'estimatedHours' properties.
    `
  }
  
  /**
   * Builds a prompt for autonomous task execution
   */
  private _buildPromptForTaskExecution(
    task: Task, 
    ruleContent: string | null = null,
    fileSnippets: { [filePath: string]: string } | null = null,
    relatedTasks: Task[] | null = null,
    projectContext: Awaited<ReturnType<typeof getProjectContextSummary>>
  ): string {
    let prompt = `Please execute the following task and provide the results:

TASK DETAILS:
Title: ${task.metadata.title}
ID: ${task.metadata.id}
Description: ${task.metadata.description || 'N/A'}
Status: ${task.status}
Priority: ${task.priority}
`;
    if (task.metadata.lastError) {
        prompt += `Last Error/Blockage: ${task.metadata.lastError}\n`; // Include last error
    }
    
    // Include associated rule context if provided
    if (task.ruleId && ruleContent) {
      const rule = ruleController.getRuleById(task.ruleId); // Get rule for description
      prompt += `\nAssociated Rule (ID: ${task.ruleId}):
`;
      if (rule?.metadata?.description) {
          prompt += `Rule Description: ${rule.metadata.description}\n`;
      }
      prompt += `Rule Content Snippet (first 200 chars):\n${ruleContent.substring(0, 200)}...\n`;
    } else if (task.ruleId) {
        prompt += `\nAssociated Rule ID: ${task.ruleId} (Content not included in this context)\n`;
    }

    // --- Include Related Task Context --- 
    if (relatedTasks && relatedTasks.length > 0) {
        prompt += `\nRELATED TASKS (for the same rule):
`;
        relatedTasks.forEach(rt => {
            prompt += ` - ${rt.metadata.title} (ID: ${rt.metadata.id}, Status: ${rt.status}, Priority: ${rt.priority})\n`;
        });
        prompt += `Consider these related tasks when planning your execution.
`;
    }

    // Include file context if provided
    if (fileSnippets && Object.keys(fileSnippets).length > 0) {
      prompt += `\n\n**Relevant Workspace File Context:**`;
      for (const [filePath, content] of Object.entries(fileSnippets)) {
          prompt += `\n--- START FILE: ${filePath} ---\n`;
          prompt += `${content}\n`;
          prompt += `--- END FILE: ${filePath} ---\n`;
      }
    } else {
      prompt += `\n(No specific file content was automatically extracted. Analyze based *only* on the task description and rule. If file access is absolutely required but no context is provided, indicate this as a blockage reason.)`;
    }
    // --- Add Project Context Section --- 
    if (projectContext) {
        prompt += `\nPROJECT CONTEXT:
`;
        if (projectContext.rootDirs && projectContext.rootDirs.length > 0) {
            prompt += ` - Root Dirs: ${projectContext.rootDirs.join(', ')}\n`;
        }
        if (projectContext.dependencies && Array.isArray(projectContext.dependencies) && projectContext.dependencies.length > 0) {
            prompt += ` - Dependencies: ${projectContext.dependencies.slice(0, 15).join(', ')}${projectContext.dependencies.length > 15 ? '...' : ''}\n`; // Limit length
        }
        if (projectContext.devDependencies && Array.isArray(projectContext.devDependencies) && projectContext.devDependencies.length > 0) {
            prompt += ` - Dev Dependencies: ${projectContext.devDependencies.slice(0, 15).join(', ')}${projectContext.devDependencies.length > 15 ? '...' : ''}\n`; // Limit length
        }
    }

    // ---- Define Planning Threshold ----
    const COMPLEXITY_THRESHOLD_FOR_PLAN = 4;
    const requiresPlan = (task.metadata.complexity ?? 0) >= COMPLEXITY_THRESHOLD_FOR_PLAN;

    // ---- Core Instructions ----
    prompt += `\n\n**Execution Instructions:**\n1.  **Analyze:** Carefully review the Task Goal, Governing Rule, and **all provided File Context**. Understand the requirements and constraints.`;

    // --- Inject Planning Step if Required ---
    if (requiresPlan) {
        prompt += `\n2.  **Plan (High Complexity Task):** This task is marked as complex. **Before simulating the action**, outline your step-by-step plan to achieve the Task Goal in the 'result' field under a \"### Plan\" heading.`;
        prompt += `\n3.  **Simulate Action:** Based on your plan, determine the logical steps or concrete output (e.g., code changes as a diff/patch, configuration updates, textual response) required to fulfill the task based *primarily* on the Rule and File Context. Include this under a \"### Action/Output\" heading in the 'result' field.`;
        prompt += `\n4.  **Evaluate Feasibility:** Can the task be fully completed with the given information and your capabilities? You **cannot** execute commands, access external websites, or interact with APIs directly. Your output is the *result* of the simulated action.`;
        prompt += `\n5.  **Determine Outcome:** Based on your analysis and simulation, decide if the task is 'completed', 'blocked', or 'in-progress'.`;
        prompt += `\n6.  **Report Result:** Populate the 'result' field clearly, including the Plan and Action/Output sections generated above. If **blocked**, clearly state the reason under a \"### Blockage Reason\" heading. If **completed**, summarize under \"### Completion Summary\".`;
        prompt += `\n7.  **Suggest Follow-ups (Optional):** If the task's execution reveals a pattern, missing constraint, or opportunity for automation, suggest concise, actionable follow-up tasks (generatedTasks) or new, well-defined rules (suggestedRules) based on the outcome. Ensure suggested rules have clear titles and content.`;
    } else {
        // Instructions for lower complexity tasks (original numbering adjusted)
        prompt += `\n2.  **Simulate Action:** Determine the logical steps or concrete output (e.g., code changes as a diff/patch, configuration updates, textual response) required to fulfill the task based *primarily* on the Rule and File Context.`;
        prompt += `\n3.  **Evaluate Feasibility:** Can the task be fully completed with the given information and your capabilities? You **cannot** execute commands, access external websites, or interact with APIs directly. Your output is the *result* of the simulated action.`;
        prompt += `\n4.  **Determine Outcome:** Based on your analysis and simulation, decide if the task is 'completed', 'blocked', or 'in-progress'.`;
        prompt += `\n5.  **Report Result:** Populate the 'result' field clearly:\n    *   If **completed**: Describe the outcome, including any generated code/text or key findings.\n    *   If **blocked**: State the specific reason for the blockage (e.g., "Missing information about X in file Y.ts", "Requires external API call to Z", "Rule is ambiguous regarding scenario A").\n    *   If **in-progress** (neither completed nor blocked): Explain the steps taken so far and what remains.`;
        prompt += `\n6.  **Suggest Follow-ups (Optional):** If the task's execution reveals a pattern, missing constraint, or opportunity for automation, suggest concise, actionable follow-up tasks (generatedTasks) or new, well-defined rules (suggestedRules) based on the outcome. Ensure suggested rules have clear titles and content.`;
    }

    // ---- Output Format ----
    prompt += `\n\n**Output Format:**\nRespond **ONLY** with a single, valid JSON object adhering strictly to the following structure. Do not include any introductory text, explanations, or markdown formatting outside the JSON structure itself.\n\n\`\`\`json\n{\n  "completed": boolean, // True if the task is fully achieved by your simulated action.\n  "blocked": boolean,   // True if the task cannot proceed due to missing info, ambiguity, or capability limits.\n  "result": string,     // **Crucial:** Detailed outcome description. If code was generated/modified, include it here (e.g., using markdown diff format). Explain blockage reasons precisely. Describe progress if in-progress.\n  "generatedTasks": [ // Optional: Array of NEW suggested follow-up tasks.\n    {\n      "title": string,           // Concise title for the follow-up task.\n      "description": string,     // Optional: Brief description of the follow-up.\n      "priority": "low" | "medium" | "high", // Optional: Suggested priority.\n      "assignee": string        // Optional: Suggested assignee (name/role).\n    }\n  ],\n  "suggestedRules": [ // Optional: Array of NEW suggested rules. Only suggest if a clear need or pattern emerges from the task execution.\n    {\n      "title": string,           // Descriptive title for the new rule.\n      "content": string          // The full text content of the proposed rule. Ensure it's well-defined.\n    }\n  ]\n}\n\`\`\``;
    // ---- End Prompt ----

    // console.log("--- TASK EXECUTION PROMPT ---", prompt); // Keep for debugging if needed
    return prompt;
  }
  
  /**
   * Convert AI suggestions to Task objects
   */
  private _convertSuggestionsToTasks(suggestions: any[], ruleId: string): Task[] {
    return suggestions.map(suggestion => {
      const now = Date.now()
      const id = `task_${now}_${Math.random().toString(36).substr(2, 9)}`
      
      return {
        metadata: {
          id,
          title: suggestion.title,
          description: suggestion.description,
          createdAt: now,
          updatedAt: now,
          aiGenerated: true,
          syncStatus: 'local-only'
        },
        status: this._convertStatusFromAI(suggestion.status),
        priority: this._convertPriorityFromAI(suggestion.priority),
        ruleId
      }
    })
  }
  
  /**
   * Convert AI status to internal status
   */
  private _convertStatusFromAI(status: string): TaskStatus {
    switch (status?.toLowerCase()) {
      case 'todo':
      case 'pending':
        return 'todo'
      case 'in-progress':
      case 'in progress':
        return 'in-progress'
      case 'completed':
      case 'done':
        return 'completed'
      case 'blocked':
        return 'blocked'
      default:
        return 'todo'
    }
  }
  
  /**
   * Convert AI priority to internal priority
   */
  private _convertPriorityFromAI(priority: string): TaskPriority {
    switch (priority?.toLowerCase()) {
      case 'high':
      case 'urgent':
      case 'critical':
        return 'high'
      case 'medium':
      case 'normal':
        return 'medium'
      case 'low':
        return 'low'
      default:
        return 'medium'
    }
  }

  /**
   * Extracts potential file paths (like `path/file.ext`, `./path/file`, \"../lib/utils.js\")
   * from a given text using a refined regex.
   * @param text The text to search within.
   * @returns An array of unique potential file paths found.
   */
  private _extractFilePaths(text: string): string[] {
    if (!text) return [];
    // Regex Explanation:
    // ([\'\"`]?)     - Optional opening quote (capture group 1)
    // (            - Start Path Capture Group 2
    //   \.?\.?[\/\\]? - Optional ./ ../ / or \\ at the start
    //   (?:[\\w.-]+[\/\\])* - Zero or more directory segments (chars + separator)
    //   [\\w.-]+      - Final directory/file name part
    //   (?:\\.\w+)?   - Optional file extension
    // )            - End Path Capture Group 2
    // \1           - Matches the same quote as the opening one (or none)
    const regex = /([\'\"`]?)((?:\\.?\\.?[\\/\\])?(?:[\\w.-]+[\\/\\])*[\\w.-]+(?:\\.\\w+)?)\\1/g;
    const matches = new Set<string>();
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Ensure it's not just matching a simple word or number if regex is too broad
      // Basic sanity check: path should contain '/' or '\\' or start with '.'
      const potentialPath = match[2];
      if (potentialPath.includes('/') || potentialPath.includes('\\') || potentialPath.startsWith('.')) {
          // Check if it looks like a standalone version number (e.g., 1.2.3) - avoid these
          if (!/^\\d+(\\.\\d+)+$/.test(potentialPath)) {
             matches.add(potentialPath);
          }
      }
    }
    const foundPaths = Array.from(matches);
    if (foundPaths.length > 0) {
        console.log("TaskAiService: Extracted potential file paths:", foundPaths);
    }
    return foundPaths;
  }

  /**
   * Uses AI to summarize potentially large file content.
   * @param filePath Path for context/logging.
   * @param fileContent The full file content to summarize.
   * @param targetLength Approximate desired character length for the summary.
   * @returns An AI-generated summary or null if summarization fails.
   */
  private async _summarizeFileContent(filePath: string, fileContent: string, targetLength = 1500): Promise<string | null> {
    console.log(`TaskAiService: Content for ${filePath} is too long (${fileContent.length} chars). Attempting summarization...`);
    // Basic file type inference for context (can be expanded)
    const fileExtension = path.extname(filePath).toLowerCase();
    let languageHint = '';
    if (['.js', '.ts', '.jsx', '.tsx'].includes(fileExtension)) languageHint = 'JavaScript/TypeScript';
    else if (['.py'].includes(fileExtension)) languageHint = 'Python';
    else if (['.java'].includes(fileExtension)) languageHint = 'Java';
    // Add more language hints as needed

    try {
      const prompt = `
        You are an AI assistant specializing in source code analysis. Your task is to summarize a file for another AI that needs context to perform a task.
        File Path: "${filePath}" ${languageHint ? `(Likely ${languageHint})` : ''}
        Target Summary Length: Approximately ${targetLength} characters.

        Summarize the following file content concisely. Focus on:
        - The file's primary purpose and functionality.
        - Key exported functions, classes, components, or interfaces.
        - Main logic flow or core algorithms.
        - Important data structures or configurations defined.

        AVOID:
        - Line-by-line explanations or excessive detail.
        - Trivial helper functions unless central to the main logic.
        - Simple import/export statements unless they define the core API.

        Output ONLY the plain text summary, suitable for inclusion as context for another AI.

        FILE CONTENT:
        \`\`\`${languageHint ? languageHint.toLowerCase().split('/')[0] : ''}\n${fileContent}\`\`\`

        CONCISE SUMMARY:`; // Ensure the AI starts generation right after this line

      const response = await this._aiService.analyzeWithAI<{ summary: string }>(prompt);

      if (response && response.summary) {
        console.log(`TaskAiService: Successfully summarized ${filePath} using refined prompt.`);
        // Basic trimming in case the AI adds extra whitespace
        return response.summary.trim();
      } else {
        console.warn(`TaskAiService: AI summarization failed for ${filePath} (refined prompt). Response was empty or invalid.`);
        return null;
      }
    } catch (error) {
      console.error(`TaskAiService: Error during AI summarization for ${filePath} (refined prompt):`, error);
      return null;
    }
  }

  /**
   * Reads the content of a file, summarizing if it exceeds the character limit.
   * @param filePath Relative or absolute file path.
   * @param maxChars Maximum characters for direct inclusion; triggers summarization if exceeded.
   * @param enableSummarization Flag to enable or disable summarization.
   * @returns File content snippet, summary, or null.
   */
  private async _readFileContent(filePath: string, maxChars: number, enableSummarization: boolean): Promise<string | null> {
    let fileUri: vscode.Uri | undefined = undefined;
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (path.isAbsolute(filePath)) {
         fileUri = vscode.Uri.file(filePath);
         // console.warn(`Reading absolute path: ${filePath}. This might be unreliable.`); 
      } else if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri;
        fileUri = vscode.Uri.joinPath(workspaceRoot, filePath);
      } else {
        console.warn(`Cannot resolve relative path "${filePath}" without an open workspace folder.`);
        return null;
      }

      // console.log(`Attempting to read file URI: ${fileUri.toString()}`); 
      const fileContentBytes = await vscode.workspace.fs.readFile(fileUri);
      const fileContent = Buffer.from(fileContentBytes).toString('utf-8');
      
      if (fileContent.length > maxChars) {
        // Check if summarization is enabled
        if (enableSummarization) {
            // Content is too long, attempt summarization
            console.log(`TaskAiService: Content for ${filePath} exceeds ${maxChars} chars. Summarization enabled, attempting...`);
            // Target length calculation can remain based on maxChars
            const summary = await this._summarizeFileContent(filePath, fileContent, maxChars * 0.75);
            if (summary) {
              return `[AI Summary of ${path.basename(filePath)}]:\n${summary}\n... [Content Summarized] ...`;
            } else {
              // Fallback to simple truncation if summarization fails OR is disabled
              console.warn(`Summarization failed for ${filePath}, falling back to truncation.`);
              return fileContent.substring(0, maxChars) + '\n... [Content Truncated] ...';
            }
        } else {
            // Summarization disabled, just truncate
            console.log(`TaskAiService: Content for ${filePath} exceeds ${maxChars} chars. Summarization disabled, truncating...`);
            return fileContent.substring(0, maxChars) + '\n... [Content Truncated] ...';
        }
      }
      // Content is within limits, return directly
      return fileContent;

    } catch (error: any) {
      if (error.code === 'FileNotFound') {
          console.warn(`File not found when trying to read context: ${filePath} (Resolved URI: ${fileUri?.toString()})`);
      } else {
          console.error(`Error reading file context for ${filePath}:`, error);
      }
      return null;
    }
  }
} 