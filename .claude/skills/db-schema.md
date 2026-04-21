---
name: db-schema
description: Check TeslaMate PostgreSQL table schema
user_invocable: true
---

Query the TeslaMate PostgreSQL database schema.

Usage: /db-schema [table_name]

Steps:
1. If a table name is provided, run: `docker compose exec -T database psql -U teslamate -d teslamate -c "\d <table_name>"`
2. If no table name, list all tables: `docker compose exec -T database psql -U teslamate -d teslamate -c "\dt"`
3. Show the result to the user

Common tables: cars, positions, drives, charging_processes, charges, addresses, states, settings, car_settings, updates
