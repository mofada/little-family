# 小家记 API 部署说明

本文说明后端代码更新后，如何把 `apps/api` 发布到 Linux 服务器。项目支持 **PM2** 和 **Docker Compose** 两种部署方式，请只选择一种，避免端口冲突或同时写入同一个数据库。

## 1. 部署前检查

运行环境要求：

- Node.js 22.13 或更高版本（PM2 部署）
- npm
- PM2，或 Docker + Docker Compose
- 可供反向代理访问的本机端口；仓库默认使用 `127.0.0.1:3002`
- 已配置 HTTPS 域名，并由 Caddy、Nginx 等反向代理到 API

生产环境必须配置真实的微信小程序 AppID 和 AppSecret，并确保：

```dotenv
NODE_ENV=production
ALLOW_DEV_LOGIN=false
```

生日祝福生成功能还需要配置 `DEEPSEEK_API_KEY`；`DEEPSEEK_MODEL` 可选，默认使用 `deepseek-v4-flash`。DeepSeek 调用失败时，小程序会降级复制本地提示词。

发布前先在项目根目录验证代码：

```bash
npm ci
npm run check
npm run build:api
```

如果检查或构建失败，不要继续发布。

## 2. PM2 更新部署

以下示例假设代码位于 `/home/ubuntu/little-family`，PM2 进程名为 `little-family-api`。

### 2.1 首次部署

在服务器保留 Monorepo 的根 `package.json`、`package-lock.json` 和 `apps/api`。创建 `/home/ubuntu/little-family/apps/api/.env`：

```dotenv
NODE_ENV=production
PORT=3002
DATABASE_PATH=./data/little-family.db
WECHAT_APP_ID=你的小程序AppID
WECHAT_APP_SECRET=你的小程序AppSecret
DEEPSEEK_API_KEY=你的DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
SESSION_DAYS=30
ALLOW_DEV_LOGIN=false
```

然后执行：

```bash
cd /home/ubuntu/little-family
npm ci
npm run check
npm run build:api
npm prune --omit=dev

pm2 start apps/api/dist/index.js \
  --name little-family-api \
  --cwd /home/ubuntu/little-family/apps/api
pm2 save
```

`--cwd` 很重要：API 会从 `apps/api/.env` 读取配置，相对数据库路径也以该目录为基准。

### 2.2 后端代码更新后的发布步骤

先进入服务器上的仓库并拉取代码：

```bash
cd /home/ubuntu/little-family
git pull --ff-only
npm ci
npm run check
npm run build:api
```

构建成功后，备份 SQLite 数据库。为保证数据库文件与 WAL 日志一致，先短暂停止 API，再备份整个 `data` 目录：

```bash
pm2 stop little-family-api
mkdir -p backups
tar -czf "backups/api-data-$(date +%Y%m%d-%H%M%S).tar.gz" -C apps/api data
```

安装精简后的生产依赖并重启：

```bash
npm prune --omit=dev
pm2 restart little-family-api --update-env
pm2 save
```

最后检查进程、日志和健康接口：

```bash
pm2 status little-family-api
pm2 logs little-family-api --lines 100 --nostream
curl --fail http://127.0.0.1:3002/health
```

健康检查返回成功后，再通过公网 HTTPS 域名检查一次：

```bash
curl --fail https://你的API域名/health
```

> 如果只上传本地构建好的 `dist`，仍要同步 `package.json` 和 `package-lock.json`，并在服务器根目录执行 `npm ci --omit=dev --workspace @little-family/api`。不要只替换单个 JavaScript 文件。

## 3. Docker Compose 更新部署

Docker 部署使用仓库根目录的 `compose.yaml`。服务器仓库根目录需要有一个不提交到 Git 的 `.env`：

```dotenv
WECHAT_APP_ID=你的小程序AppID
WECHAT_APP_SECRET=你的小程序AppSecret
DEEPSEEK_API_KEY=你的DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
```

代码更新后执行：

```bash
cd /home/ubuntu/little-family
git pull --ff-only
npm ci
npm run check
npm run build:api
docker compose build api
docker compose up -d api
```

Compose 会重新构建镜像并替换 API 容器，SQLite 数据保存在仓库根目录的 `data/little-family.db` 中（服务器上通常为 `/home/ubuntu/little-family/data/little-family.db`），不会因容器替换而删除。`data/` 已被 Git 忽略。

发布后验证：

```bash
docker compose ps
docker compose logs --tail 100 api
curl --fail http://127.0.0.1:3002/health
curl --fail https://你的API域名/health
```

### Docker 数据备份

应在更新前定期备份 SQLite 数据。最稳妥的方式是短暂停止 API 后，备份整个 `data` 目录：

```bash
docker compose stop api
mkdir -p backups
tar -czf "backups/api-data-$(date +%F-%H%M%S).tar.gz" data
docker compose up -d api
```

从旧版命名卷首次迁移到 `./data` 时，先停止 API，再复制整个目录（包括 WAL 和 SHM 文件）：

```bash
docker compose stop api
mkdir -p data
docker run --rm \
  -v little-family_little-family-data:/from:ro \
  -v "$PWD/data:/to" \
  alpine sh -c 'cp -a /from/. /to/'
docker compose up -d api
```

确认新目录中的数据正常后，旧命名卷可暂时保留作为额外备份。

## 4. 回滚

如果新版本健康检查失败：

1. 查看 PM2 或 Docker 日志，确认是配置、依赖还是代码问题。
2. 将代码切回上一个已验证的 Git 提交或发布标签。
3. 重新安装依赖、构建并重启服务。
4. 只有在数据库结构或数据被错误修改时，才停止 API 并恢复发布前的数据备份。

PM2 回滚示例：

```bash
cd /home/ubuntu/little-family
git checkout <上一个发布标签或提交>
npm ci
npm run build:api
npm prune --omit=dev
pm2 restart little-family-api --update-env
curl --fail http://127.0.0.1:3002/health
```

回滚完成后应切回正常维护分支；不要在生产服务器上长期保留 detached HEAD 状态。恢复数据库会覆盖回滚点之后产生的新数据，操作前必须再次备份当前数据。

## 5. 常见问题

- **启动后找不到 `.env` 或数据库位置不对**：检查 PM2 的 `--cwd` 是否为 `apps/api`。
- **端口被占用**：确认 `.env` 的 `PORT` 与反向代理目标一致；本项目示例使用 3002。
- **微信登录失败**：检查 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`，以及小程序后台配置的合法请求域名。
- **公网访问失败但本机健康检查成功**：检查 Caddy/Nginx 配置、防火墙、DNS 和 HTTPS 证书。
- **修改环境变量后未生效**：PM2 使用 `pm2 restart little-family-api --update-env`；Docker 使用 `docker compose up -d --force-recreate api`。
- **数据库字段有变化**：务必先备份。当前 API 启动时会执行建表语句；未来若引入正式迁移脚本，应在发布文档中明确迁移和回滚顺序。
