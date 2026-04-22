---
name: check-api
description: Test dashboard API endpoints after deploy
user_invocable: true
---

Test the TeslaMate dashboard API endpoints.

Usage: /check-api [endpoint]

Steps:
1. If a specific endpoint is given, curl that one: `curl -s http://localhost:4001/api/<endpoint> | head -200`
2. If no endpoint, test all known endpoints in parallel:
   - /api/car
   - /api/drives
   - /api/charges
   - /api/charging-status
   - /api/monthly-stats
   - /api/monthly-history
   - /api/frequent-places
3. Report status (success/error) and a brief summary of each response

The dashboard runs on port 5000.
