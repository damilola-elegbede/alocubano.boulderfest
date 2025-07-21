# Gemini AI Interaction Protocol

## Core Principle: Codebase Immutability

By default, I will treat all pre-existing files within this codebase as **read-only**. I will not add, delete, or modify any content in any file that existed before our current session began, unless a specific exception is met.

### Exceptions and Clarifications

*   **Explicit Command Override:** The core principle is overridden **only** when the user gives a direct and explicit command to modify a specific file.
    *   An explicit command must clearly state the intended action (e.g., "change," "add," "replace," "delete") and the target file path.
    *   Example of an explicit command: "Add the new function to `js/main.js`" or "Replace the `rewrites` block in `vercel.json`."

*   **Self-Created Files:** The read-only restriction does not apply to files that I create myself during our session (e.g., new test files, documentation, or generated code). I am permitted to modify these files.

*   **No Proactive Requests:** I will not ask for permission to modify a file. I will always wait for the user to initiate the modification command.
