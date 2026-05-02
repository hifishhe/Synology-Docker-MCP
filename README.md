# Synology Docker MCP Server

*(Scroll down for English version / 英文版本在下方)*

## 🇨🇳 中文说明 (Chinese Version)

这是一个专门为群晖 (Synology NAS) 设计的 Model Context Protocol (MCP) 服务器。它旨在通过大语言模型直接管理、配置和调试群晖 Container Manager 中的 Docker 容器和 Docker Compose 项目。

### ✨ 核心功能与亮点

- **基于 SSH 的安全管理**: 直接通过 SSH 与您的群晖 NAS 进行通信，安全执行原生命令，彻底免除对外暴露 Docker TCP 接口的风险。
- **自动提权系统 (Auto-Privilege Escalation)**: 自动注入凭证静默执行 `sudo`，完美解决群晖管理员账号在执行 docker 时常见的 `Permission Denied` 权限壁垒。
- **群晖 Container Manager 完美兼容**: 原生支持并强制使用 `docker-compose -p` 标签，确保通过此 MCP 服务器启动或更新的项目能够与群晖自带网页端的项目界面完美同步（维持绿点健康状态）。
- **全方位工具集**:
  - `synology_docker_ps`: 查看所有运行中的容器。
  - `synology_docker_logs`: 获取并追踪容器日志。
  - `synology_docker_manage`: 控制容器的启动、停止、重启或移除。
  - `synology_project_list`: 自动搜索并发现 `/volume1/docker/` 目录下的所有项目。
  - `synology_project_manage`: 原生执行项目的 Pull、Up、Down 或 Restart 指令。
  - `synology_read_file` / `synology_write_file`: 远程读取或修改 `.env` 与 `docker-compose.yml` 配置文件。

### 🔒 安全加固记录 (v1.1.0)

| 漏洞 | 修复方案 |
|------|---------|
| 密码特殊字符展开（`$`/反引号） | `echo "..."` 改为 `printf '%s\n' '...'`，避免 shell 展开 |
| 命令注入（容器名/项目名/路径拼接） | 所有用户输入经 `shQuote()` 单引号包裹后再拼接命令 |
| action 参数未验证 | 代码层白名单校验，独立于 schema enum |
| 路径遍历（`/etc/shadow` 等） | `synology_read_file` / `synology_write_file` 限制在 `NAS_DOCKER_DIR` 内，拒绝含 `..` 的路径 |
| `tail` 参数注入 | 强制正整数，上限 10000，默认 100 |
| SSH 连接无超时 | 添加 `readyTimeout: 30000` |

### 🚀 快速上手 (面向终端用户)

1. **开启群晖 SSH 服务**: 
   前往 **控制面板 -> 终端机和 SNMP** 并勾选 **启动 SSH 功能**。
   
2. **接入 MCP 客户端 (例如 Claude Desktop 或 Cursor)**:
   您**不需要**克隆代码或安装任何东西。只需将以下内容添加到客户端的 MCP 配置文件 JSON 中，客户端会自动通过 `npx` 帮您拉取并运行最新版代码：
   ```json
   {
     "mcpServers": {
       "synology-docker": {
         "command": "npx",
         "args": [
           "-y",
           "synology-docker-mcp"
         ],
         "env": {
           "NAS_HOST": "192.168.1.xxx",
           "NAS_PORT": "22",
           "NAS_USER": "your_admin_account",
           "NAS_PASSWORD": "your_admin_password",
           "NAS_DOCKER_DIR": "/volume1/docker"
         }
       }
     }
   }
   ```

### 🛠️ 本地开发 (面向开发者)

如果您希望修改此项目的源代码：

1. **克隆并配置**:
   复制项目中的 `.env.example` 并重命名为 `.env`，填入您的 NAS 连接信息。

2. **安装依赖并构建**:
   ```bash
   npm install
   npm run build
   ```

3. **测试运行**:
   ```bash
   npm start
   ```

---

## 🇬🇧 English Version

This is a Model Context Protocol (MCP) server specifically designed to manage, configure, and debug Docker containers and Docker Compose projects on Synology NAS devices.

### ✨ Features & Highlights

- **SSH-Based Management**: Communicates with your Synology NAS directly via SSH, ensuring secure execution of native commands without needing to expose the Docker TCP socket.
- **Auto-Privilege Escalation**: Automatically injects credentials to run `sudo` silently, bypassing the `Permission Denied` issues commonly faced by Synology administrator accounts.
- **Synology Container Manager Compatibility**: Native support for `docker-compose -p`, ensuring that projects started or updated via this MCP server perfectly align with the Synology Container Manager GUI (maintaining the green status indicator).
- **Comprehensive Toolset**:
  - `synology_docker_ps`: View all running containers.
  - `synology_docker_logs`: Stream container logs.
  - `synology_docker_manage`: Start, stop, restart, or remove containers.
  - `synology_project_list`: Discover projects mapped in `/volume1/docker/`.
  - `synology_project_manage`: Pull, up, down, or restart Docker Compose projects natively.
  - `synology_read_file` / `synology_write_file`: Edit `.env` and `docker-compose.yml` configurations remotely.

### 🔒 Security Hardening (v1.1.0)

| Vulnerability | Fix |
|---------------|-----|
| Password shell expansion (`$`, backticks) | Replaced `echo "..."` with `printf '%s\n' '...'` to prevent shell expansion |
| Command injection (container/project name/path concatenation) | All user inputs wrapped with `shQuote()` before shell concatenation |
| Unvalidated `action` parameter | Code-level whitelist enforced independently of schema enum |
| Path traversal (e.g. reading `/etc/shadow`) | `synology_read_file` / `synology_write_file` restricted to `NAS_DOCKER_DIR`; paths with `..` segments rejected |
| `tail` parameter injection | Enforced positive integer, capped at 10000, defaults to 100 |
| SSH connection hangs indefinitely | Added `readyTimeout: 30000` |

### 🚀 Setup Instructions

1. **Enable SSH on Synology NAS**: 
   Go to **Control Panel -> Terminal & SNMP** and check **Enable SSH service**.
   
2. **Configure Credentials**:
   Copy `.env.example` to `.env` and fill in your NAS connection details:
   ```env
   NAS_HOST=192.168.1.xxx
   NAS_PORT=22
   NAS_USER=your_admin_account
   NAS_PASSWORD=your_admin_password
   NAS_DOCKER_DIR=/volume1/docker
   ```

3. **Install Dependencies & Build**:
   ```bash
   npm install
   npm run build
   ```

4. **Connect to MCP Client (e.g. Claude Desktop / Cursor)**:
   While you can use a local `node` path if built locally, the **highly recommended** method is to use `npx` (which pulls directly from npm, requiring no local cloning). Add the following to your MCP configuration JSON:
   ```json
   {
     "mcpServers": {
       "synology-docker": {
         "command": "npx",
         "args": [
           "-y",
           "synology-docker-mcp"
         ],
         "env": {
           "NAS_HOST": "192.168.1.xxx",
           "NAS_PORT": "22",
           "NAS_USER": "your_admin_account",
           "NAS_PASSWORD": "your_admin_password",
           "NAS_DOCKER_DIR": "/volume1/docker"
         }
       }
     }
   }
   ```
