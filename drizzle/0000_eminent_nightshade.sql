CREATE TYPE "public"."health_status" AS ENUM('healthy', 'degraded', 'down', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'monitoring', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('todo', 'doing', 'done');--> statement-breakpoint
CREATE TYPE "public"."service_tier" AS ENUM('prod', 'staging', 'dev');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('p0', 'p1', 'p2', 'p3');--> statement-breakpoint
CREATE TABLE "incidents" (
	"incident_id" text PRIMARY KEY NOT NULL,
	"repo_id" text NOT NULL,
	"severity" "severity" NOT NULL,
	"signal_type" text NOT NULL,
	"summary_md" text DEFAULT '' NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hypotheses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"work_item" jsonb DEFAULT 'null'::jsonb,
	"created_by" text DEFAULT 'mcp' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"status" "issue_status" DEFAULT 'todo' NOT NULL,
	"assignee" text,
	"priority" text DEFAULT 'P2' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"repo" text NOT NULL,
	"owner" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"next_issue_num" integer DEFAULT 1 NOT NULL,
	"integrations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_links" (
	"repo_id" text PRIMARY KEY NOT NULL,
	"repo_url" text NOT NULL,
	"issues_url" text NOT NULL,
	"actions_url" text NOT NULL,
	"deploy_dashboard" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_states" (
	"repo_id" text PRIMARY KEY NOT NULL,
	"health_status" "health_status" DEFAULT 'unknown' NOT NULL,
	"warnings_count" integer DEFAULT 0 NOT NULL,
	"deploy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"open_issues_count" integer DEFAULT 0 NOT NULL,
	"rev" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"repo_id" text PRIMARY KEY NOT NULL,
	"repo_full_name" text NOT NULL,
	"service_tier" "service_tier" DEFAULT 'prod' NOT NULL,
	"owners" jsonb DEFAULT '{"primary":null,"backup":null}'::jsonb NOT NULL,
	"dev" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"architecture" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes_md" text DEFAULT '' NOT NULL,
	"rev" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repos_repo_full_name_unique" UNIQUE("repo_full_name")
);
--> statement-breakpoint
CREATE TABLE "state_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"repo_id" text NOT NULL,
	"signal_id" text NOT NULL,
	"type" text NOT NULL,
	"severity" "severity" NOT NULL,
	"summary" text NOT NULL,
	"link" text
);
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_repo_id_repos_repo_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("repo_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_links" ADD CONSTRAINT "repo_links_repo_id_repos_repo_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("repo_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_states" ADD CONSTRAINT "repo_states_repo_id_repos_repo_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("repo_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_signals" ADD CONSTRAINT "state_signals_repo_id_repos_repo_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("repo_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issues_project_status_pos_idx" ON "issues" USING btree ("project_id","status","position");