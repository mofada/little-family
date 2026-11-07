# 小家记 Gateway 网络隔离与双层 Caddy 切换

适用：当前 `family.mofada.cn` 由公共 Gateway 分别转发到 `little-family-api-1:3000` 和 `little-family-web-1:80`；
同时，小家记的 `api` 还加入了共享 `gateway-net`，因此其通用 DNS 别名 `api` 可能被其他项目误用。

目标：**只有 web 加入 gateway-net，API 只在 little-family 默认网络**。
共享 Gateway 只反代 `little-family-web:80`，内部 Caddy 通过专属别名 `little-family-api:3000` 转发 `/api`、`/api/*`、`/health`。
保留 `127.0.0.1:3002:3000` 和 `./data` SQLite 挂载，不修改数据库、令牌和环境变量。

> 迁移需要操作正在运行的容器和公共 Gateway；GitHub 仓库修改不会自动更改服务器。所有命令在服务器 Ubuntu 中执行；不要使用 `docker compose down -v`。

## 0. 拉取、备份、校验

```bash
cd /opt/little-family/source
git pull --ff-only

cd /opt/little-family
stamp=$(date +%Y%m%d-%H%M%S)
sudo mkdir -p "backups/gateway-network-$stamp"
sudo cp -a compose.yaml "backups/gateway-network-$stamp/compose.yaml"
sudo cp -a caddy/Caddyfile "backups/gateway-network-$stamp/Caddyfile"
sudo cp -a /opt/gateway/Caddyfile "backups/gateway-network-$stamp/gateway.Caddyfile"

# 与已备份的生产配置同步，保留 ./api.env、./data 原样。
sudo cp source/compose.yaml compose.yaml
sudo cp source/Caddyfile caddy/Caddyfile

sudo docker compose config --quiet
sudo docker run --rm --network none \
  -v /opt/little-family/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

只有看到 `Valid configuration` 才继续。

## 1. Web 先加入两个网络（过渡上游）

API 此时尚未重建，`little-family-api` 专属别名可能尚未注册。
为避免先切换 Gateway 时中断 API，临时使用已存在的唯一容器名：

```bash
cd /opt/little-family

sudo sed -i 's/reverse_proxy little-family-api:3000/reverse_proxy little-family-api-1:3000/' caddy/Caddyfile

sudo docker compose up -d --no-deps --no-build --pull never --force-recreate web

sudo docker compose exec -T web grep reverse_proxy /etc/caddy/Caddyfile
sudo docker compose exec -T web wget -qO- http://127.0.0.1:80/health
```

最后一条应返回 API 健康响应。此时 API 仍在共享网络，旧 Gateway 路由仍可用。

## 2. 切换公共 Gateway（在移除 API 共享网络之前）

编辑 `/opt/gateway/Caddyfile`，只替换 `family.mofada.cn` 站点块，**其他项目块保持不变**：

```caddyfile
family.mofada.cn {
    reverse_proxy little-family-web:80
}
```

删除旧 Family 块内的 `@api`、`handle @api` 和旧 `handle`，避免 API 继续直接访问共享网路。

```bash
cd /opt/gateway

sudo docker compose exec -T caddy cat /etc/caddy/Caddyfile
sudo docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
sudo docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile

curl -i https://family.mofada.cn/health
curl -i https://family.mofada.cn/api/families
```

`/health` 应返回 200；`/api/families` 在没有登录令牌时返回 401 是正常的，关键是 JSON 来自小家记 API 而不是 `502` 或前端 HTML。

**注意**：如果宿主机文件已更新但容器内 `cat` 仍为旧内容，通常是单文件 bind mount 指向了旧 inode。此时需要 `sudo docker compose up -d --no-deps --no-build --pull never --force-recreate caddy`，它会短暂影响所有通过公共 Gateway 访问的域名；重建后再验证上述接口。

## 3. 移除 API 的共享网络，启用专属别名

确保第二步已验证成功，再重建 API：

```bash
cd /opt/little-family

sudo docker compose up -d --no-deps --no-build --pull never --force-recreate api

sudo docker compose ps
sudo docker compose exec -T web wget -qO- http://little-family-api:3000/health
curl -i https://family.mofada.cn/health
```

这里会有一次短暂 API 重启；SQLite 的生产数据仍使用 `./data:/repo/apps/api/data` 挂载，未删除数据卷。

## 4. 结束过渡：恢复 GitHub 中的专属网络别名

```bash
cd /opt/little-family
sudo cp source/Caddyfile caddy/Caddyfile

sudo docker compose up -d --no-deps --no-build --pull never --force-recreate web

sudo docker compose exec -T web grep reverse_proxy /etc/caddy/Caddyfile
sudo docker compose exec -T web wget -qO- http://127.0.0.1:80/health

curl -i https://family.mofada.cn/health
curl -i https://family.mofada.cn/api/families
curl -I https://family.mofada.cn/
```

此时内部 Caddy 应显示 `reverse_proxy little-family-api:3000`，最终拓扑：

```text
Internet --HTTPS--> gateway-caddy (gateway-net)
                     └── little-family-web (gateway-net + little-family_default)
                            ├── /api, /api/*, /health -> little-family-api:3000 (little-family_default)
                            └── 其他路径 -> React SPA /srv
```

可选地核实 API 不再连接共享网络：

```bash
sudo docker inspect little-family-api-1 --format '{{json .NetworkSettings.Networks}}'
```

应只列出项目默认网络，不包含 `gateway-net`。

## 回滚注意

备份在 `/opt/little-family/backups/gateway-network-时间戳/`。
若已移除 API 的共享网络，回滚时**先**恢复旧的 `/opt/little-family/compose.yaml` 并重建 API，使旧 Gateway 的 API 上游重新可达；
随后恢复 Gateway Caddyfile 并验证 / 重载，最后恢复旧 Web Caddyfile 与 Web 容器。
不得直接切回旧 Gateway 而不先恢复 API 网络，否则 Family API 会返回 502。
不要执行 `down -v`，不要删除 `./data`。
