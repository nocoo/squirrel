# 04. 管理后台与 API 规范

## 1. 管理后台界面（`@nocoo/basalt@^3.6.0`）

界面统一采用 `@nocoo/basalt` 组件体系、哑光表面层级（L0–L3）与琥珀主色令牌，支持亮/暗主题切换与移动端抽屉导航：

1. **概览（`/admin`）**：展示托管密钥、活跃消费方、周期调用/拒绝、30 天临期与文件夹总数 KPI；使用 Basalt `ChartFrame` + Recharts 绘制每日放行/拒绝柱状趋势图；列出高频密钥 Top 10 及临期/僵尸密钥（>90 天未用）提醒。
2. **密钥库（`/admin/secrets`）**：左侧文件夹导航栏（全部 / 未分类 / 自定义文件夹 CRUD）+ 搜索与服务筛选 + 密钥表格（掩码预览、状态与有效期徽章、点击查看明文弹窗、新增/编辑密钥与轮换）。
3. **客户端与凭证（`/admin/clients`）**：集中展示 OAuth DCR、静态 OAuth 与无头 Bot Token；支持一键新建 Bot Token 或静态 OAuth 客户端（弹窗一次性展示明文凭证），支持在线调整「全部 / 按文件夹 / 按单密钥」授权范围与「仅元数据 / 读取明文」开关，支持暂停/恢复、Bot Token 轮换与永久吊销。
4. **审计日志（`/admin/logs`）**：支持按消费方、工具/操作、决策结果筛选并分页浏览，展示每次 `get_secret` 的取用 `reason` 与耗时，并提示 90 天自动清理策略。
5. **授权同意页（`/authorize?tx=...`）**：位于 `AppShell` 之外的独立表单页，展示客户端名称、Client ID、回调域名（本地回环触发黄色提醒）、消费方命名输入框及文件夹/单密钥范围选择器。

## 2. 受保护接口清单

所有 `/api/admin/*` 接口均受 `cfAccessMiddleware` 与 `enforceOriginMiddleware` 保护（实现见 [routes.ts](file:///Users/nocoo/workspace/personal/squirrel/worker/src/admin/routes.ts)）：

| 路径                                        | 方法               | 说明                                                  |
| :------------------------------------------ | :----------------- | :---------------------------------------------------- |
| `/api/admin/me`                             | `GET`              | 当前管理员邮箱与运行环境                              |
| `/api/admin/stats?days=7`                   | `GET`              | 概览统计、每日趋势、高频/僵尸/临期榜单                |
| `/api/admin/folders`                        | `GET` / `POST`     | 文件夹列表（含密钥计数）与新建                        |
| `/api/admin/folders/:id`                    | `PUT` / `DELETE`   | 更新或删除文件夹（密钥置未分类并清理策略引用）        |
| `/api/admin/secrets`                        | `GET` / `POST`     | 密钥元数据检索与加密入库                              |
| `/api/admin/secrets/:id/reveal`             | `POST`             | 管理员解密查看明文并写入 `admin_reveal` 审计日志      |
| `/api/admin/secrets/:id`                    | `PUT` / `DELETE`   | 更新元数据/轮换密钥值或删除密钥                       |
| `/api/admin/clients`                        | `GET` / `POST`     | 消费方列表、新建 `bot_token` 或 `static_oauth` 客户端 |
| `/api/admin/clients/:clientId`              | `PATCH` / `DELETE` | 实时修改策略与状态，或删除已吊销客户端记录            |
| `/api/admin/clients/:clientId/rotate-token` | `POST`             | 轮换 Bot Token（旧 Token 立即失效）                   |
| `/api/admin/clients/:clientId/revoke`       | `POST`             | 永久吊销客户端并清理 OAuth 注册信息                   |
| `/api/admin/oauth/tx/:txId`                 | `GET`              | 获取待确认 OAuth 授权事务详情                         |
| `/api/admin/oauth/tx/:txId/decision`        | `POST`             | 提交批准或拒绝并换取带 `state`/`iss` 的 `redirectTo`  |
| `/api/admin/logs`                           | `GET`              | 分页查询审计日志                                      |

免鉴权健康接口：

- `GET /`：302 跳转至 `/admin`。
- `GET /api/live`：探测 D1 连通性并返回 `{ status: "ok", service: "squirrel", version, storage: "d1", database: { connected: true } }`。
