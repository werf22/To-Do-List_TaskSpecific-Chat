## Detailed Directory & File Explanations

---

### `/app` - Next.js App Router Core
*   Contains all routing, page UI, layouts, and API endpoint logic as defined by the Next.js App Router convention.
    *   `/app/page.tsx` - Main home page with task list, filters, and task creation form. **Manages the overall `filters` state and orchestrates fetching tasks from the API based on those filters, playing a crucial role in the search/filtering system.**
    *   `/app/tasks/[id]/page.tsx` - Task detail page with full editing capabilities. Displays task details and allows editing and deletion. Fetches data using the task ID from the URL. Includes form handling, state management, and interaction with the `/api/tasks/[id]` endpoint (GET, PATCH, DELETE). (Delete functionality added/verified 2025-04-22)
    *   `/app/api/tasks/route.ts` - API endpoints for listing and creating tasks. **Handles core task CRUD operations and retrieval, including filtering logic (e.g., parsing search parameters, applying Prisma filters, executing raw SQL searches), which is integral to the search/filtering system.**
    *   `/app/api/tasks/[id]/route.ts` - API endpoints for individual task operations (get, update, delete). Handles API requests for a specific task ID. Implements:
        *   `GET`: Retrieve details for a specific task.
        *   `PATCH`: Update details of a specific task.
        *   `DELETE`: Delete a specific task. (Verified & Used: 2025-04-22)
    *   `/app/api/tasks/batch/route.ts` - API endpoints for batch operations on multiple tasks
    *   `/app/api/force-delete/route.ts` - Emergency endpoint with direct database access for troubleshooting
    *   `/app/api/ai/chat/route.ts` - **(UPDATED 2025-04-24)** API endpoint for handling AI chat interactions using the Vercel AI SDK. Receives messages, model selection, task context, and AI parameters (`maxTokens`, `providerOptions` containing `temperature`, `reasoningEffort`). Validates input using Zod, interacts with the selected AI model (via `streamText`), and integrates AI tools like `updateTaskFields`.

### `/components` - UI Components
*   All reusable UI components (forms, lists, field displays, etc.).
    *   `/components/AIChatInterface.tsx` - **(UPDATED 2025-04-24)** Frontend component for AI chat interaction. Manages chat state, model selection, and AI parameter controls (temperature, max tokens, reasoning effort). Uses the `@ai-sdk/react` `useChat` hook. **Crucially, constructs the request body for `/api/ai/chat`, including conditional logic to send `maxTokens` only for specific models (e.g., `gpt-4.1`) and nests other parameters like `temperature` and `reasoningEffort` within `providerOptions`.**
    *   `DeleteTaskButton.jsx` - Component for deleting tasks
    *   `FilterBar.tsx` - Component for filtering tasks by various criteria. **The main component responsible for rendering filter controls (search input, dropdowns, etc.) based on `TASK_FIELD_CONFIG` and notifying the parent page (`app/page.tsx`) of filter changes via the `onFilterChange` prop, playing a key role in the search/filtering system.**
    *   `ImportCSVModal.tsx` - Modal dialog for importing tasks from CSV files
    *   `SimpleTaskList.jsx` - Simple component for displaying tasks in a list format
    *   `TaskForm.tsx` - Component for adding new tasks
    *   `TaskList.tsx` - Component for displaying tasks in a tabular format. Displays a list of tasks, potentially with sorting, filtering, and actions like selection and deletion. Interacts with task API endpoints. (Delete functionality updated to use `DELETE /api/tasks/[id]` 2025-04-22)
    *   `/ui/Select.tsx` - Reusable dropdown component with search functionality
    *   `/ui/MultiSelect.tsx` - Reusable multi-select component with checkboxes for selecting multiple options

### `/config` - Configuration & Setup Files
*   Stores all configuration files for the app, including:
    *   `TASK_FIELD_CONFIG.ts` — Core field definitions. Defines the structure, types, labels, options, and properties of every task field used throughout the application. **Crucial for UI rendering, data validation, and AI interaction.** *Recently modified (2025-04-23) to ensure `dependents` and `related_tasks` use `textarea` type for better AI text processing.*
    *   `.env.local` — Environment variables
    *   `next.config.mjs` — Next.js config
    *   `package.json` — Dependencies & scripts
    *   `postcss.config.js` — PostCSS config
    *   `tailwind.config.ts` — Tailwind config
    *   `tsconfig.json` — TypeScript config
    *   `.windsurfrules` — Project rules

### `/lib` - Library Code
*   Utility code, database clients, and shared logic.
    *   `prisma.ts` - Prisma client singleton for database operations
    *   `csvExport.ts` - Utilities for exporting tasks to CSV
    *   `csvImport.ts` - Utilities for importing tasks from CSV. Modified on 2025-04-22 to use commas as column delimiters and semicolons as multi-select value delimiters. Added support for user-provided task IDs and improved error handling.
    *   `/ai/`: Contains definitions and utilities for AI-related functionality.
        -   `/ai/tools/`: Contains definitions for tools that the AI can use (e.g., updating task fields).
            -   `updateTaskFields.ts`: Defines the `updateTaskFieldsTool`, its Zod schema (`updateTaskFieldsSchema`), and the `executeTaskUpdate` function for performing the database update.
        -   `/ai/contextHelper.ts`: **(NEW)** Provides helper functions related to preparing context for AI interactions.
            -   `getContextForTask`: Fetches a task by ID from Prisma and formats its key details into a string, providing context for the AI about the specific task being discussed.
        -   `/ai/dynamicToolSchema.ts`: **(UPDATED 2025-04-24)** Dynamically generates the Zod schema for the `updateTaskFields` tool based on `TASK_FIELD_CONFIG.ts`. **Crucially, it now includes logic to adapt the schema based on the AI model ID (`modelId`)**: for `o4-mini`, it enforces required fields and simplifies the schema type (e.g., to `z.string()`) for fields with a large number of enum options (>50) to avoid validation errors, while maintaining optional/nullable fields and detailed enum types for other models.

### `/pages` - Legacy Pages Router (Special Pages)
*   Contains standalone emergency/utility pages using the Next.js Pages Router.
    *   `/pages/nuke-tasks.js` - Emergency task deletion page for troubleshooting

### `/prisma` - Database Schema & Migrations
*   Prisma ORM configuration and database schema management.
    *   `migrations/` - Database migration files
    *   `schema.prisma` - Database schema definition
    *   `seed.ts` - Script to populate database with initial data

### `/public` - Static Assets
*   Static files served directly by the web server (images, fonts, etc.).

### `/tests` - Unit Tests
*   Example unit test files
    *   `csvUtils.test.ts` - Example unit test file

### Root Files
*   Documentation and planning files (`README.md`, `PRD.txt`, `PLANNING.md`, `TASK.md`, `DONE.md`, this file, etc.).
*   Environment variables and configuration files
    *   `.env` - Environment variables (ignored by Git)
    *   `.gitignore` - Git ignore file
    *   `jest.config.js` - Jest configuration
    *   `jest.setup.ts` - Jest setup file (e.g., for mocks)

---

### Current File Structure
```
/
├── app/
│   ├── api/
│   │   ├── force-delete/
│   │   │   └── route.ts
│   │   └── tasks/
│   │       ├── [id]/
│   │       │   └── route.ts
│   │       ├── batch/
│   │       │   └── route.ts
│   │       └── route.ts
│   ├── tasks/
│   │   └── [id]/
│   │       └── page.tsx
│   └── page.tsx
├── components/
│   ├── AIChatInterface.tsx
│   ├── DeleteTaskButton.jsx
│   ├── FilterBar.tsx
│   ├── ImportCSVModal.tsx
│   ├── SimpleTaskList.jsx
│   ├── TaskForm.tsx
│   ├── TaskList.tsx
│   └── ui/
│       ├── MultiSelect.tsx
│       └── Select.tsx
├── config/
│   ├── TASK_FIELD_CONFIG.ts
│   ├── next.config.mjs
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── .windsurfrules
├── lib/
│   ├── csvExport.ts
│   ├── csvImport.ts
│   ├── prisma.ts
│   └── ai/
│       ├── contextHelper.ts
│       └── tools/
│           └── updateTaskFields.ts
├── pages/
│   └── nuke-tasks.js
├── prisma/
│   ├── migrations/
│   │   └── ... (migration files)
│   ├── schema.prisma
│   └── seed.ts
├── public/
│   └── [static assets]
├── tests/
│   └── csvUtils.test.ts
├── .env
├── .gitignore
├── jest.config.js
├── jest.setup.ts
├── DONE.md
├── PLANNING.md
├── PRD.txt
├── PROJECTS_FILE_STRUCTURE_DOCUMENTATION.md
├── README.md
└── TASK.md

### File Management Log
*   [2025-04-22 16:28] Refined documentation in `csv_field_documentation.md` and `csv_input_form_documentation.md`.
*   [2025-04-22 16:28] Added `prisma/seed.ts` for database seeding.
*   [2025-04-22 14:39] Implemented comprehensive task deletion system with:
    * New API endpoints (`/api/tasks/[id]`)
    * Emergency deletion page (`/pages/nuke-tasks.js`)
    * Enhanced TaskList component with integrated delete buttons
*   [2025-04-23 ~09:45] Fixed various React/Next.js/TypeScript errors in FilterBar, TaskDetailPage, HomePage.
*   [2025-04-23 ~10:15] Implemented full-text search functionality via raw SQL query in `/api/tasks/route.ts` and integrated with `FilterBar.tsx`.
*   [2025-04-23 ~13:30] Implemented AI tool `updateTaskFields` (`lib/ai/tools/updateTaskFields.ts`) and context helper (`lib/ai/contextHelper.ts`). Integrated tool usage into `/api/ai/chat/route.ts`.
*   [2025-04-24 ~13:22] Refined AI parameter handling (`maxTokens`, `temperature`, `reasoningEffort`) in `AIChatInterface.tsx` and `/api/ai/chat/route.ts`, implementing conditional logic for `maxTokens` based on the selected model.
*   [2025-04-24 ~14:45] Modified `lib/ai/dynamicToolSchema.ts` to handle model-specific schema generation, fixing `o4-mini` compatibility issues with the `updateTaskFields` tool (missing type key, too many enums).

_Last updated: 2025-04-24 14:45_

[EndOfDocument PROJECTS_FILE_STRUCTURE_DOCUMENTATION.md]
