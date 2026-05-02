#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "ssh2";
import dotenv from "dotenv";

dotenv.config();

const NAS_HOST = process.env.NAS_HOST;
const NAS_PORT = parseInt(process.env.NAS_PORT || "22", 10);
const NAS_USER = process.env.NAS_USER;
const NAS_PASSWORD = process.env.NAS_PASSWORD;
const NAS_DOCKER_DIR = process.env.NAS_DOCKER_DIR || "/volume1/docker";

if (!NAS_HOST || !NAS_USER || !NAS_PASSWORD) {
  console.error("Missing required environment variables. Please check .env file.");
  process.exit(1);
}

const VALID_DOCKER_ACTIONS = new Set(["start", "stop", "restart", "rm"]);
const VALID_COMPOSE_ACTIONS = new Set(["up -d", "down", "restart", "pull"]);

/** Wrap s in single quotes, escaping any internal single quotes. */
function shQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** Docker container names: alphanumeric, underscore, dot, hyphen. */
function validateContainerName(name: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\-]*$/.test(name)) {
    throw new Error(`Invalid container name: ${name}`);
  }
}

/** Project folder names: alphanumeric, underscore, hyphen. */
function validateProjectName(name: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_\-]*$/.test(name)) {
    throw new Error(`Invalid project name: ${name}`);
  }
}

/** Filepath must be absolute, contain no .. segments, and be under NAS_DOCKER_DIR. */
function validateRestrictedPath(filepath: string): void {
  if (!filepath.startsWith("/")) {
    throw new Error("Path must be absolute");
  }
  if (filepath.split("/").some((p) => p === "..")) {
    throw new Error("Path traversal not allowed");
  }
  const base = NAS_DOCKER_DIR.replace(/\/$/, "");
  if (!filepath.startsWith(base + "/")) {
    throw new Error(`Path must be within ${NAS_DOCKER_DIR}`);
  }
}

const server = new Server(
  {
    name: "synology-docker-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

async function execSshCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => {
      // Use printf to avoid shell expansion of password contents.
      const fullCommand = `export PATH=$PATH:/usr/local/bin:/opt/bin:/bin:/usr/bin && printf '%s\\n' ${shQuote(NAS_PASSWORD!)} | sudo -S sh -c ${shQuote(command)}`;
      conn.exec(fullCommand, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        let stdout = "";
        let stderr = "";

        stream
          .on("close", (code: number) => {
            conn.end();
            resolve({ stdout, stderr, code });
          })
          .on("data", (data: any) => {
            stdout += data;
          })
          .stderr.on("data", (data: any) => {
            stderr += data;
          });
      });
    }).on("error", (err) => {
      reject(err);
    }).connect({
      host: NAS_HOST,
      port: NAS_PORT,
      username: NAS_USER,
      password: NAS_PASSWORD,
      readyTimeout: 30000,
    });
  });
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "synology_docker_ps",
        description: "List all docker containers on the Synology NAS",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "synology_docker_logs",
        description: "Get logs for a specific docker container",
        inputSchema: {
          type: "object",
          properties: {
            container_name: { type: "string", description: "Name or ID of the container" },
            tail: { type: "number", description: "Number of lines to show from the end of the logs", default: 100 },
          },
          required: ["container_name"],
        },
      },
      {
        name: "synology_docker_manage",
        description: "Manage container lifecycle (start, stop, restart)",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["start", "stop", "restart", "rm"], description: "Action to perform" },
            container_name: { type: "string", description: "Name or ID of the container" },
          },
          required: ["action", "container_name"],
        },
      },
      {
        name: "synology_project_list",
        description: "List docker-compose projects in the Synology NAS docker directory",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "synology_project_manage",
        description: "Manage a docker-compose project (up, down, restart)",
        inputSchema: {
          type: "object",
          properties: {
            project_name: { type: "string", description: "Name of the project folder in NAS_DOCKER_DIR" },
            action: { type: "string", enum: ["up -d", "down", "restart", "pull"], description: "Docker compose action" },
          },
          required: ["project_name", "action"],
        },
      },
      {
        name: "synology_read_file",
        description: `Read a configuration file from the NAS (restricted to ${NAS_DOCKER_DIR})`,
        inputSchema: {
          type: "object",
          properties: {
            filepath: { type: "string", description: `Absolute path to the file on the NAS (must be within ${NAS_DOCKER_DIR})` },
          },
          required: ["filepath"],
        },
      },
      {
        name: "synology_write_file",
        description: `Write or update a configuration file on the NAS (restricted to ${NAS_DOCKER_DIR})`,
        inputSchema: {
          type: "object",
          properties: {
            filepath: { type: "string", description: `Absolute path to the file on the NAS (must be within ${NAS_DOCKER_DIR})` },
            content: { type: "string", description: "File content to write" },
          },
          required: ["filepath", "content"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (name === "synology_docker_ps") {
      const res = await execSshCommand(`docker ps -a --format "table {{.ID}}\\t{{.Names}}\\t{{.Status}}\\t{{.Ports}}\\t{{.Image}}"`);
      return { content: [{ type: "text", text: res.stdout || res.stderr }] };
    }

    else if (name === "synology_docker_logs") {
      const { container_name } = args as { container_name: string; tail?: number };
      validateContainerName(container_name);
      const tailRaw = (args as any)?.tail;
      const tail = Number.isInteger(tailRaw) && tailRaw > 0 ? Math.min(tailRaw, 10000) : 100;
      const res = await execSshCommand(`docker logs --tail ${tail} ${shQuote(container_name)} 2>&1`);
      return { content: [{ type: "text", text: res.stdout || res.stderr }] };
    }

    else if (name === "synology_docker_manage") {
      const { action, container_name } = args as { action: string; container_name: string };
      if (!VALID_DOCKER_ACTIONS.has(action)) {
        throw new Error(`Invalid action: ${action}`);
      }
      validateContainerName(container_name);
      const res = await execSshCommand(`docker ${action} ${shQuote(container_name)}`);
      return { content: [{ type: "text", text: `Command 'docker ${action} ${container_name}' executed.\nExit Code: ${res.code}\nOutput:\n${res.stdout || res.stderr}` }] };
    }

    else if (name === "synology_project_list") {
      const res = await execSshCommand(`find ${shQuote(NAS_DOCKER_DIR)} -maxdepth 2 -name "docker-compose.yml" -exec dirname {} \\;`);
      if (res.code !== 0) {
        return { content: [{ type: "text", text: `Failed to search projects: ${res.stderr}` }] };
      }
      const dirs = res.stdout.trim().split("\n").filter(Boolean);
      const projects = dirs.map((dir) => dir.replace(`${NAS_DOCKER_DIR}/`, ""));
      return { content: [{ type: "text", text: projects.length > 0 ? `Found projects:\n${projects.join("\n")}\n\nBase directory: ${NAS_DOCKER_DIR}` : `No projects found in ${NAS_DOCKER_DIR}` }] };
    }

    else if (name === "synology_project_manage") {
      const { project_name, action } = args as { project_name: string; action: string };
      validateProjectName(project_name);
      if (!VALID_COMPOSE_ACTIONS.has(action)) {
        throw new Error(`Invalid compose action: ${action}`);
      }
      const projectPath = `${NAS_DOCKER_DIR}/${project_name}`;
      const checkRes = await execSshCommand(`ls ${shQuote(projectPath + "/docker-compose.yml")}`);
      if (checkRes.code !== 0) {
        return { content: [{ type: "text", text: `Error: docker-compose.yml not found in ${projectPath}` }] };
      }
      const cmd = `cd ${shQuote(projectPath)} && docker-compose -p ${shQuote(project_name)} ${action}`;
      const res = await execSshCommand(cmd);
      return { content: [{ type: "text", text: `Command executed in ${projectPath}.\nExit Code: ${res.code}\nOutput:\n${res.stdout}\n${res.stderr}` }] };
    }

    else if (name === "synology_read_file") {
      const { filepath } = args as { filepath: string };
      validateRestrictedPath(filepath);
      const res = await execSshCommand(`cat ${shQuote(filepath)}`);
      if (res.code !== 0) {
        return { content: [{ type: "text", text: `Error reading file: ${res.stderr}` }] };
      }
      return { content: [{ type: "text", text: res.stdout }] };
    }

    else if (name === "synology_write_file") {
      const { filepath, content } = args as { filepath: string; content: string };
      validateRestrictedPath(filepath);
      const base64Content = Buffer.from(content).toString("base64");
      // base64 output is [A-Za-z0-9+/=], safe to single-quote directly.
      const res = await execSshCommand(`printf '%s' ${shQuote(base64Content)} | base64 -d > ${shQuote(filepath)}`);
      if (res.code !== 0) {
        return { content: [{ type: "text", text: `Error writing file: ${res.stderr}` }] };
      }
      return { content: [{ type: "text", text: `File ${filepath} successfully written.` }] };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Synology Docker MCP server running on stdio");
}

run().catch(console.error);
