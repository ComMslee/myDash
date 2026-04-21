---
name: screenshot-compare
description: Take browser screenshot and compare UI changes
user_invocable: true
---

Capture and review the current dashboard UI state.

Usage: /screenshot-compare [page]

Steps:
1. Use the Chrome MCP tools to navigate to the dashboard page
   - Default: http://localhost:4001/
   - If page specified: http://localhost:4001/<page>
2. Take a screenshot using mcp__Claude_in_Chrome__read_page
3. Describe what is visible and any issues found
4. If the user provided a reference screenshot, compare the two and note differences
