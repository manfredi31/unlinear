<p align="center">
  <img src="public/icon.svg" width="80" alt="unlinear logo" />
</p>

<h1 align="center">unlinear</h1>

<p align="center">
  <strong>A collaboration layer for the agentic coding era.</strong><br/>
  Discuss ideas, refine plans, and ship — no matter which platform you're on.
</p>

<p align="center">
  <a href="#the-vision">Vision</a> •
  <a href="#how-it-works">How it Works</a> •
  <a href="#interactive-widgets">Widgets</a> •
  <a href="#mcp-tools">MCP Tools</a> •
  <a href="#getting-started">Getting Started</a>
</p>

---

## The Vision

> As we move into a world where every line of code is written by AI, the real work of humans shifts to **discussing ideas and features at a high level in natural language in plan markdown files**. 

GitHub was designed for sharing and reviewing code. Unlinear is a Github, but for markdown plans as the first primitive (instead of code), and powered by MCP. 

Code is the least leverage manufact. Plans are way higher leverage manufact, and humans should focus on plans.

In unlinear, Engineers share and discuss plans, e quando tutti gli umani hanno finito di discutere sull'highlevel plan ed il plan è approvato, unlinear invia il plan al coding agent per l'implementazione.

### Why MCP?

Model Context Protocol is the interoperability key that makes this possible. Because unlinear is an MCP server, it works **everywhere** — ChatGPT, Cursor, Claude Desktop, any CLI, any coding agent. There's no vendor lock-in, no new app to install. Everyone on the team connects from the platform they already use, and they all see the same projects, the same tasks, the same discussion thread.

## How it Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   ChatGPT    │     │    Cursor    │     │  Any MCP     │
│   (widgets)  │     │   (inline)   │     │   client     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │  MCP protocol
                     ┌──────┴───────┐
                     │   unlinear   │
                     │  MCP server  │
                     └──────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────┴─────┐ ┌────┴────┐ ┌──────┴──────┐
        │ PostgreSQL │ │  OpenAI │ │ Codex runs  │
        │  (Drizzle) │ │  (LLM)  │ │  (agents)   │
        └───────────┘ └─────────┘ └─────────────┘
```

1. **Create a project** and invite your team.
2. **Open a task** — it starts as a draft with an idea or plan in markdown.
3. **Discuss** — anyone comments in natural language; the LLM rewrites the plan to incorporate each comment, creating a new revision.
4. **Approve** — when the plan is solid, approve it. This queues a Codex run (or any agent) to build the feature.
5. **Track** — follow the build status until it's done.

Every step works through natural conversation from any MCP-compatible client.


## Interactive Widgets

When used inside ChatGPT, unlinear renders **interactive React widgets** directly in the conversation.

| Widget | What you see |
|---|---|
| **Projects dashboard** | All your projects as cards — tap to drill in |
| **Project board** | Kanban-style task board with status columns |
| **Task detail** | Full plan, contributor diffs, and a comment box to post feedback |

Widgets are fully interactive: navigate between projects, read task plans, and post comments — all without leaving the chat. They respond to light/dark theme automatically and update live as data changes.


## MCP Tools

| Tool | Description |
|---|---|
| `create-project` | Create a new project |
| `list-projects` | List all projects (renders widget) |
| `get-project` | Project details with members (renders widget) |
| `create-task` | Create a task with an initial plan |
| `list-tasks` | List tasks in a project, filter by status |
| `get-task` | Full task detail with current plan |
| `comment-on-task` | Comment on a task — LLM rewrites the plan |
| `approve-task` | Approve the current revision and queue a build |
| `get-task-timeline` | Revision history showing the full collaboration |
| `get-codex-run` | Check build status |


## Getting Started

### Prerequisites

- Node.js ≥ 22
- PostgreSQL (or use the included Docker Compose)

### Setup

```bash
# Clone and install
git clone https://github.com/manfredi31/unlinear.git
cd unlinear
npm install

# Start Postgres (optional — uses Docker)
docker compose up -d

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and OPENAI_API_KEY

# Push the schema
npm run db:push

# Run in dev mode
npm run dev
```

The server starts at `http://localhost:3000`. Open `/inspector` to test tools interactively.

### Connect from any MCP client

Point your MCP client (ChatGPT, Cursor, Claude, etc.) to:

```
http://localhost:3000
```

That's it — start chatting and managing projects in natural language.

---

## Tech Stack

- **[mcp-use](https://mcp-use.com)** — MCP server framework with widget support
- **Drizzle ORM** + **PostgreSQL** — typed, relational data layer
- **OpenAI** — LLM-powered plan rewriting on every comment
- **React** + **Apps SDK** — interactive ChatGPT widgets
- **Zod** — schema validation for all tool inputs

---

## License

MIT

---

<p align="center">
  <em>Built for the <a href="https://modelcontextprotocol.io/">MCP Hackathon</a> — because the best code starts with the best conversations.</em>
</p>
