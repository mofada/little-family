# 小家记（Little Family）

小家记是一个包含微信小程序、React H5 和自建 Node.js API 的 Monorepo。当前支持微信登录、网页版一次性登录码、私有家庭空间、成员维护、亲缘图谱、北京时间 08:00 生日订阅提醒和家庭邀请码。

当前产品以“家庭关系档案 + 生日管理 + 家庭协作维护”为核心。成员仅要求姓名，可选填性别、出生年份和完整生日；每位成员最多关联两位父母和一位配偶。小程序使用“首页、图谱、时间轴、生日、我的”五个主导航，不再维护独立的家族分支字段。

## 仓库结构

```text
little-family/
├─ apps/
│  ├─ api/                 Node.js + Express + SQLite API
│  ├─ miniprogram/         微信原生 TypeScript 小程序
│  └─ web/                 React + Vite H5
├─ packages/               未来共享 contracts、SDK、UI
├─ scripts/                仓库级资源生成脚本
├─ compose.yaml            API 单机容器部署
├─ package.json            根工作区和统一命令
└─ project.config.json     微信开发者工具项目配置
```

`apps/api` 和 `apps/web` 是 npm workspace。小程序保留独立的 `package.json` 和锁文件，因为微信开发者工具需要在小程序源码目录内执行“构建 npm”，不参与根 workspace 的依赖提升。

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
npm run dev:web             # 启动 Web 开发服务器
npm run build:api           # 编译 API 到 apps/api/dist
npm run build:web           # 构建 Web 到 apps/web/dist
npm run start:api           # 运行已编译 API
npm run check:miniprogram   # 检查小程序 TypeScript
npm run check:api           # 检查 API TypeScript
npm run check:web           # 检查 Web TypeScript
npm run check               # 检查全部应用
npm test                    # 运行 API 自动化测试
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
WECHAT_OPEN_APP_ID=微信开放平台网站应用AppID
WECHAT_OPEN_APP_SECRET=微信开放平台网站应用AppSecret
WECHAT_OPEN_REDIRECT_URI=https://你的Web域名/wechat-callback
DEEPSEEK_API_KEY=你的DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
SESSION_DAYS=30
ALLOW_DEV_LOGIN=true
```

从根目录启动：

```bash
npm run dev:api
```

API 默认地址为 `http://127.0.0.1:3000`，健康检查为 `/health`。

### 生日订阅提醒

生日提醒使用微信小程序一次性订阅消息。用户每次授权后，API 保存一次可用发送机会，成功发送后需要再次订阅。API 常驻进程每分钟检查一次，并在北京时间 08:00–08:59 内为当天首次运行发送提醒；数据库按家庭、用户和日期去重，因此同一天不会重复发送。

当前生日模板固定在 `apps/api/src/birthdayTemplate.ts`：模板 ID `4Hd2RmOKkWxhOzvP_ZTIKYaCiCorerofM0yPpydIdRg`，称呼 `name1`，生日日期 `thing6`，温馨提示 `thing5`。服务端配置微信 AppID/AppSecret 后自动启用。

生日当天，小程序可以通过服务端调用 DeepSeek 生成生日祝福并复制。服务端需配置 `DEEPSEEK_API_KEY`，可用 `DEEPSEEK_MODEL` 指定模型（默认 `deepseek-v4-flash`）；未配置或生成失败时，小程序会自动改为复制原始祝福提示词。API Key 不得写入小程序源码。

成员称呼不再手动录入。API 会按“当前登录用户关联的成员 → 目标成员”的视角生成称呼，优先读取 `kinship_labels` 缓存；缺失时批量调用 DeepSeek 生成并回填数据库，失败时使用本地亲缘规则兜底。成员或关系变更后会清空该家庭称呼缓存，下次查询重新生成。

API 启动时会执行版本化数据库迁移。旧数据库中的 `branch_name` 会在 v1 迁移中移除，同时把生日字段调整为可空；当前还会创建 `kinship_labels` 表缓存成员间称呼；发布前仍应按部署章节备份完整 SQLite 数据目录。

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
- 网页登录码只保存哈希、单次使用且 5 分钟过期；新的登录码会使同用户旧码失效。
- PC 微信扫码登录使用微信开放平台网站应用，OAuth `state` 只保存哈希、10 分钟过期且只能使用一次。
- 小程序和网站应用应绑定到同一个微信开放平台账号，服务端通过 UnionID 把两种 OpenID 关联到同一登录用户。
- AppSecret 只允许出现在 API 的 `.env`。
- 每条家庭数据按 `family_id` 隔离。
- 所有写操作由 API 重新校验 owner/admin/editor/viewer 角色。
- 成员新增、编辑、删除和邀请只允许家庭所有者执行；其他成员只能加入、关联自己或退出家庭。
- 生产环境必须设置 `ALLOW_DEV_LOGIN=false`。

### 导入旧版写死数据

仓库级命令 `npm run import:family` 可以把旧版成员数组导入现有家庭。导入由 API 在单个事务中完成，仅允许家庭所有者操作，并且目标家庭必须没有成员。旧版 `parentId` 会转换成当前的 `parentIds`，成员 ID 会重新生成 UUID；`generation` 根据关系重新推导，已取消的 `familyName` 分支字段不会入库。

先部署并重启最新 API，在小程序中登录、创建一个空家庭，然后从微信开发者工具控制台取得当前家庭 ID 和登录令牌：

```js
wx.getStorageSync('little-family:active-family-id')
wx.getStorageSync('little-family:token')
```

在本机 PowerShell 中执行：

```powershell
$env:LITTLE_FAMILY_TOKEN = '刚取得的登录令牌'
npm run import:family -- `
  --file 'C:\path\to\family-data.json' `
  --api 'https://family.mofada.cn' `
  --family-id '目标家庭UUID' `
  --link-id '代表当前登录用户的旧成员ID'
Remove-Item Env:LITTLE_FAMILY_TOKEN
```

导入前备份 SQLite 数据目录。成员数组包含真实家庭资料时应保存在仓库外，不能提交到 Git。若导入失败，API 会回滚整批数据并返回校验原因；修改数据后仍使用同一个空家庭重新执行。

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
WECHAT_OPEN_APP_ID=微信开放平台网站应用AppID
WECHAT_OPEN_APP_SECRET=微信开放平台网站应用AppSecret
WECHAT_OPEN_REDIRECT_URI=https://你的Web域名/wechat-callback
DEEPSEEK_API_KEY=你的DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
```

启动：

```bash
docker compose up -d --build
curl http://127.0.0.1:3002/health
```

SQLite 保存在仓库根目录的 `data/little-family.db`（服务器上通常为 `/home/ubuntu/little-family/data/little-family.db`）。`data/` 已被 Git 忽略。PM2 和 Docker 是两种部署方式，不要同时启动同一套 API。

## Web 端

Web 保留移动端优先的高保真样式，并使用与小程序相同的家庭快照、权限和生日祝福接口。登录页同时支持微信开放平台扫码登录，以及小程序“家庭与成员管理”生成的一次性登录码。开发、构建和同源部署说明见 [apps/web/README.md](./apps/web/README.md)。

API 启动时会自动创建 `web_login_codes`、`wechat_identities` 和 `wechat_web_oauth_states` 表，分别管理一次性登录码、多端微信身份与扫码登录状态。部署前仍应按现有流程备份 SQLite 数据目录。

协作规则见 [AGENTS.md](./AGENTS.md)。
