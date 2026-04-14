---
name: prd
description: "Generate a Product Requirements Document (PRD) for a new feature. Use when planning a feature, starting a new project, or when asked to create a PRD. Triggers on: create a prd, write prd for, plan this feature, requirements for, spec out."
user-invocable: true
---

# PRD Generator

Create detailed Product Requirements Documents that are clear, actionable, and suitable for implementation.

---

## The Job

1. Receive a feature description from the user
2. **Explore the codebase** to understand relevant architecture, patterns, and constraints
3. Present a brief reconnaissance summary, then ask informed clarifying questions
4. Generate a structured PRD grounded in what was discovered
5. Save to `tasks/prd-[feature-name].md`

**Important:** Do NOT start implementing. Just create the PRD.

---

## Phase 1: Codebase Reconnaissance

Before asking a single question, explore the codebase to understand the landscape. **If a question can be answered by exploring the codebase, explore the codebase instead of asking.**

Use Read, Glob, and Grep to investigate areas relevant to the feature:

- **Adjacent features:** Find existing features similar to the request. These are your strongest reference — trace them end-to-end (DB → API → UI/CLI) to understand conventions.
- **Data layer:** Schemas, migrations, ORM config. What tables and columns already exist? What patterns does the project use for data access?
- **API patterns:** Routers, procedures, endpoints. Note conventions for input validation, error handling, and response shapes.
- **UI components:** Reusable components (tables, forms, modals, badges). What design system or component library is in use?
- **CLI patterns:** Existing commands, flag conventions, output formatting (if the feature touches the CLI).
- **Types & validation:** Shared type definitions and validation schemas the feature would need to extend.

Only explore areas relevant to the feature. Do NOT exhaustively catalog the codebase. Spend time on targeted exploration, then synthesize your findings.

---

## Phase 2: Informed Questions

Present your findings as a **reconnaissance summary** (3-5 bullets), then ask clarifying questions.

### Rules

- **Never ask what the code already told you.** Do not ask about technology choices, database engines, frameworks, existing patterns, or component libraries you already discovered.
- **Only ask about genuine product decisions:** scope trade-offs, priority between approaches, user experience preferences, ambiguous requirements that code cannot clarify.
- **Reference your findings in questions.** Good: "I see you have a `DataTable` component in `apps/web/src/app/_components/` — should we reuse it here or does this need something custom?" Bad: "What kind of table component should we use?"

### Format

```
**What I found:**
- The project uses [X] for [Y], with existing [Z] at `path/to/file`
- Related feature: [feature name] follows [pattern] — see `path/to/reference`
- Reusable components available: [list with paths]
- [Any relevant constraints or technical details discovered]

**Questions (answer with "1A, 2C, 3B"):**

1. [Informed question grounded in what was found]
   A. [Option]
   B. [Option]
   C. [Option]
   D. Other: [please specify]

2. ...
```

Ask 3-5 questions, but fewer is fine if the codebase answered most of them. The goal is to resolve only what genuinely requires human input.

---

## Phase 3: PRD Structure

Generate the PRD with these sections:

### 1. Introduction/Overview
Brief description of the feature and the problem it solves.

### 2. Goals
Specific, measurable objectives (bullet list).

### 3. User Stories
Each story needs:
- **Title:** Short descriptive name
- **Description:** "As a [user], I want [feature] so that [benefit]"
- **Acceptance Criteria:** Verifiable checklist of what "done" means

Each story should be small enough to implement in one focused session.

**Format:**
```markdown
### US-001: [Title]
**Description:** As a [user], I want [feature] so that [benefit].

**Acceptance Criteria:**
- [ ] Specific verifiable criterion
- [ ] Another criterion
- [ ] Typecheck/lint passes
- [ ] **[UI stories only]** Verify in browser using dev-browser skill
```

**Important:**
- Acceptance criteria must be verifiable, not vague. "Works correctly" is bad. "Button shows confirmation dialog before deleting" is good.
- **For any story with UI changes:** Always include "Verify in browser using dev-browser skill" as acceptance criteria. This ensures visual verification of frontend work.

### 4. Functional Requirements
Numbered list of specific functionalities:
- "FR-1: The system must allow users to..."
- "FR-2: When a user clicks X, the system must..."

Be explicit and unambiguous.

### 5. Non-Goals (Out of Scope)
What this feature will NOT include. Critical for managing scope.

### 6. Design Considerations
- UI/UX requirements
- Link to mockups if available
- **Cite actual existing components to reuse, with file paths** (discovered during reconnaissance)

### 7. Technical Considerations
- **Reference real constraints and dependencies discovered in the codebase**
- Integration points with existing systems, citing actual file paths and patterns
- Performance requirements

### 8. Success Metrics
How will success be measured?
- "Reduce time to complete X by 50%"
- "Increase conversion rate by 10%"

### 9. Open Questions
Remaining questions or areas needing clarification.

---

## Writing for Junior Developers

The PRD reader may be a junior developer or AI agent. Therefore:

- Be explicit and unambiguous
- Avoid jargon or explain it
- Provide enough detail to understand purpose and core logic
- Number requirements for easy reference
- Use concrete examples where helpful

---

## Output

- **Format:** Markdown (`.md`)
- **Location:** `tasks/`
- **Filename:** `prd-[feature-name].md` (kebab-case)

---

## Example PRD

```markdown
# PRD: Task Priority System

## Introduction

Add priority levels to tasks so users can focus on what matters most. Tasks can be marked as high, medium, or low priority, with visual indicators and filtering to help users manage their workload effectively.

## Goals

- Allow assigning priority (high/medium/low) to any task
- Provide clear visual differentiation between priority levels
- Enable filtering and sorting by priority
- Default new tasks to medium priority

## User Stories

### US-001: Add priority field to database
**Description:** As a developer, I need to store task priority so it persists across sessions.

**Acceptance Criteria:**
- [ ] Add priority column to tasks table: 'high' | 'medium' | 'low' (default 'medium')
- [ ] Generate and run migration successfully
- [ ] Typecheck passes

### US-002: Display priority indicator on task cards
**Description:** As a user, I want to see task priority at a glance so I know what needs attention first.

**Acceptance Criteria:**
- [ ] Each task card shows colored priority badge (red=high, yellow=medium, gray=low)
- [ ] Priority visible without hovering or clicking
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Add priority selector to task edit
**Description:** As a user, I want to change a task's priority when editing it.

**Acceptance Criteria:**
- [ ] Priority dropdown in task edit modal
- [ ] Shows current priority as selected
- [ ] Saves immediately on selection change
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Filter tasks by priority
**Description:** As a user, I want to filter the task list to see only high-priority items when I'm focused.

**Acceptance Criteria:**
- [ ] Filter dropdown with options: All | High | Medium | Low
- [ ] Filter persists in URL params
- [ ] Empty state message when no tasks match filter
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Add `priority` field to tasks table ('high' | 'medium' | 'low', default 'medium')
- FR-2: Display colored priority badge on each task card
- FR-3: Include priority selector in task edit modal
- FR-4: Add priority filter dropdown to task list header
- FR-5: Sort by priority within each status column (high to medium to low)

## Non-Goals

- No priority-based notifications or reminders
- No automatic priority assignment based on due date
- No priority inheritance for subtasks

## Technical Considerations

- Reuse existing badge component with color variants
- Filter state managed via URL search params
- Priority stored in database, not computed

## Success Metrics

- Users can change priority in under 2 clicks
- High-priority tasks immediately visible at top of lists
- No regression in task list performance

## Open Questions

- Should priority affect task ordering within a column?
- Should we add keyboard shortcuts for priority changes?
```

---

## Checklist

Before saving the PRD:

- [ ] Explored codebase for relevant architecture, patterns, and components
- [ ] Presented reconnaissance summary to user
- [ ] Asked informed clarifying questions with lettered options
- [ ] Incorporated user's answers
- [ ] User stories are small and specific
- [ ] Functional requirements are numbered and unambiguous
- [ ] Non-goals section defines clear boundaries
- [ ] Design/Technical Considerations reference actual code paths and components
- [ ] Saved to `tasks/prd-[feature-name].md`
