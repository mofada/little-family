# 小家谱（Little Family）

小家谱是一个包含微信小程序和自建 Node.js API 的 Monorepo。当前支持微信登录、私有家庭空间、成员维护、亲缘图谱、生日提醒和家庭邀请码，目录已为未来 Web 端和共享包预留扩展位置。

## 仓库结构

```text
little-family/
├─ apps/
│  ├─ api/                 Node.js + Express + SQLite API
│  └─ miniprogram/         微信原生 TypeScript 小程序
├─ packages/               未来共享 contracts、SDK、UI
├─ scripts/                仓库级资源生成脚本
├─ compose.yaml            API 单机容器部署
├─ package.json            根工作区和统一命令
└─ project.config.json     微信开发者工具项目配置
```

`apps/api` 是 npm workspace。小程序保留独立的 `package.json` 和锁文件，因为微信开发者工具需要在小程序源码目录内执行“构建 npm”，不参与根 workspace 的依赖提升。

## 环境要求

- Node.js 22.13+
- npm
- 微信开发者工具
- 生产部署需要 HTTPS 域名和微信小程序 AppID/AppSecret

## 安装和检查

在仓库根目录执行：

```bash
npm install
cd apps/miniprogram
npm install
cd ../..
npm run check
```

常用命令：

```bash
npm run dev:api             # 启动 API 开发服务器
npm run build:api           # 编译 API 到 apps/api/dist
npm run start:api           # 运行已编译 API
npm run check:miniprogram   # 检查小程序 TypeScript
npm run check:api           # 检查 API TypeScript
npm run check               # 检查全部应用
npm run icons:generate      # 重新生成 TabBar 图标
```

## 本地启动

复制并编辑 API 环境变量：

```bash
cp apps/api/.env.example apps/api/.env
```

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_PATH=./data/little-family.db
WECHAT_APP_ID=你的小程序AppID
WECHAT_APP_SECRET=你的小程序AppSecret
SESSION_DAYS=30
ALLOW_DEV_LOGIN=true
```

从根目录启动：

```bash
npm run dev:api
```

API 默认地址为 `http://127.0.0.1:3000`，健康检查为 `/health`。

小程序开发：

1. 检查 `apps/miniprogram/config.ts` 的 `API_BASE_URL`。
2. 用微信开发者工具导入仓库根目录。
3. `project.config.json` 会把源码根定位到 `apps/miniprogram/`。
4. 本地 HTTP 联调时临时关闭合法域名校验。
5. 依赖变化后，在开发者工具中执行“工具 → 构建 npm”。

生产版的 `API_BASE_URL` 应为不带 `/api` 后缀的 HTTPS 域名，例如：

```ts
export const API_BASE_URL = 'https://family.mofada.cn'
```

## 数据和安全

API 数据默认位于 `apps/api/data/little-family.db`，包含用户 OpenID、家庭、成员、关系、邀请和审计记录。目录不会提交到 Git。

- 登录令牌只以哈希形式保存。
- AppSecret 只允许出现在 API 的 `.env`。
- 每条家庭数据按 `family_id` 隔离。
- 所有写操作由 API 重新校验 owner/admin/editor/viewer 角色。
- 生产环境必须设置 `ALLOW_DEV_LOGIN=false`。

## PM2 部署

先在本地构建：

```bash
npm install
npm run build:api
```

服务器保留最小 Monorepo 结构：

```text
~/little-family/
├─ package.json
├─ package-lock.json
└─ apps/api/
   ├─ package.json
   ├─ dist/
   ├─ .env
   └─ data/
```

服务器安装生产依赖：

```bash
cd ~/little-family
npm ci --omit=dev --workspace @little-family/api
```

以 API 目录作为工作目录启动，确保 `.env` 和相对数据库路径正确：

```bash
pm2 start apps/api/dist/index.js \
  --name little-family-api \
  --cwd /home/ubuntu/little-family/apps/api

pm2 save
```

如果 Gitea 已占用 3000，API 的 `.env` 使用 `PORT=3002`，Caddy 代理到 `127.0.0.1:3002`。

## Docker 部署

根目录 `compose.yaml` 使用 `apps/api/Dockerfile` 构建 API，并把宿主机 `127.0.0.1:3002` 映射到容器 3000。

在仓库根目录创建只存在于服务器上的 `.env`：

```dotenv
WECHAT_APP_ID=你的小程序AppID
WECHAT_APP_SECRET=你的小程序AppSecret
```

启动：

```bash
docker compose up -d --build
curl http://127.0.0.1:3002/health
```

SQLite 保存在命名卷 `little-family-data`。PM2 和 Docker 是两种部署方式，不要同时启动同一套 API。

## 增加 Web 端

建议未来创建：

```text
apps/web/
```

并将 `apps/web` 加入根 `package.json` 的 `workspaces`。当 Web 与小程序确实需要共用 API 类型或客户端时，再分别创建：

```text
packages/contracts/
packages/sdk/
```

避免为了“看起来共享”而过早耦合微信小程序的构建流程。

协作规则见 [AGENTS.md](./AGENTS.md)。
