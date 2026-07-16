# 小家记 Web

`apps/web` 是小家记的 React + Vite H5。它保留原高保真设计稿的温暖卡片、移动端底部导航和桌面端侧栏，但成员、关系、生日和当前用户全部来自 `apps/api`，不再内置真实家庭资料。

## 本地开发

先在仓库根目录启动 API（API 需要 Node.js 22.13+，并在 `.env` 中启用开发登录仅供小程序调试），再启动 Web：

```bash
npm run dev:api
npm run dev:web
```

Vite 会把 `/api` 和 `/health` 代理到 `http://127.0.0.1:3000`。如 API 位于其他同源入口，可创建不提交的 `apps/web/.env.local`：

```dotenv
VITE_API_BASE_URL=https://family.example.com
```

跨域部署还需要在网关配置允许来源；推荐把 Web 和 API 放在同一 HTTPS 域名下，`VITE_API_BASE_URL` 留空。

## 登录流程

### 微信扫码登录

生产环境可以在 PC 登录页点击“微信扫码登录”。需要先在微信开放平台创建并审核网站应用，并把网站应用和小程序绑定到同一个开放平台账号。API 配置：

```dotenv
WECHAT_OPEN_APP_ID=网站应用AppID
WECHAT_OPEN_APP_SECRET=网站应用AppSecret
WECHAT_OPEN_REDIRECT_URI=https://family.example.com/wechat-callback
```

回调地址必须与网站应用审核配置的授权回调域名一致。服务端用一次性 OAuth `state` 防止伪造回调，并通过 UnionID 将网站应用 OpenID 与小程序用户关联。历史用户如果尚无 UnionID，应先重新进入一次小程序完成微信登录，再使用扫码登录。

### 小程序登录码

浏览器不能直接使用小程序的 `wx.login`，因此保留登录码作为无需网站应用资质的入口：

1. 在微信小程序进入“我的 → 家庭与成员管理”。
2. 点击“生成并复制网页登录码”。
3. 在 Web 登录页输入登录码。

登录码只可使用一次，5 分钟后过期。Web 换取独立会话并保存在浏览器本地存储，不复用或暴露小程序令牌。

## 检查和构建

```bash
npm run check:web
npm run build:web
```

构建产物位于 `apps/web/dist/`。生产环境要把 SPA 的未知路径回退到 `index.html`，并将 `/api/*`、`/health` 反向代理到 API。

## 生日祝福

Web 与小程序保持一致：只有成员生日当天才显示祝福生成按钮。点击后由 `apps/api` 调用 DeepSeek，生成结果会自动复制到剪贴板；浏览器端不保存或调用 DeepSeek API Key。服务端需配置 `DEEPSEEK_API_KEY`，可用 `DEEPSEEK_MODEL` 指定模型。
