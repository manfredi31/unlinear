# unlinear

MCP server implementing a JSON-first filesystem DB for repo operations, incidents, and GitHub-issue workflows.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000/inspector` to test tools.

## Database Layout

The server uses `db/` as local storage by default:

```txt
db/
  meta.json
  indexes/
    repos_all.json
    repos_by_health.json
    open_incidents.json
  repos/
  audit/
  locks/
```

Set `UNLINEAR_DB_DIR` to override the location.

## Environment Variables

- `UNLINEAR_DB_DIR` optional filesystem path for DB root
- `GITHUB_TOKEN` (or `GH_TOKEN`) required for canonical GitHub issue operations
- `MCP_URL` optional public server URL
- `PORT` optional server port (defaults to `3000`)

## MCP Tools

- `register-repo`
- `refresh-repo-dev-metadata`
- `update-operational-state`
- `create-incident`
- `handle-recovery`
- `list-projects`
- `get-project-overview`
- `list-work-items`
- `create-work-item`
- `summarize-incident`

## Build

```bash
npm run build
```
