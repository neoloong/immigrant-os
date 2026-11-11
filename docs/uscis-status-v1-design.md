# USCIS 状态同步 v1：手动刷新设计（Backlog 6）

日期：**2026-11-11**。状态：**Phase 0 — 设计稿 only，未授权实现或上线。**

建议：把“刷新官方状态”限定为**获准使用 USCIS Case Status API 后，由服务端 Worker 按用户点击查询**。当前不采用官方网页抓取：M4-1 的无参数和带参数 GET 均返回 Cloudflare 403 拦截页；正常表单方法、成功结果与 CAPTCHA 行为尚未验证。API 也不是已可用的个人开发者接口：官方 FAQ 面向美国注册的软件开发组织，生产访问有审核门槛（证据 S1–S3、A2–A10）。

API 准入未解决前，保留现有官方链接；可由 Chao 选择“打开官方页 + 用户粘贴原文”的半自动备选。粘贴内容只能标为**用户保存、未经系统核验的副本**，不得冒充 API 返回结果，也不计作完成“官方状态同步”。若要求所有状态展示均有系统直接取得的官方返回，则只保留链接、等待 API，不启用粘贴功能。

本文沿用 [reminders-v1-design.md](reminders-v1-design.md) 的基线、来源证据、数据/流程、上线门与 owner 事项结构。仅改本文件及 `docs/project_state.md` 一行登记；不创建迁移、账号、密钥、云资源或 cron，不改应用代码、部署、audience，不 push、merge 或发消息。

## 1. 基线实查：从建档到官方链接

实查工作区 `/Users/chao/Projects/immigrant-os`；开始时 `git status --short` 为空，已位于 `uscis-status-v1-design`，HEAD 为 `41259ff`（reminders 设计提交）。本地 reflog 显示从 `reminders-v1-design` 切换到该分支；没有再建分支、fetch 或检查线上部署。下列行号均针对该 HEAD，不能据本地 schema 推断远端 D1 已应用迁移。

| 层 / 文件与行号 | 当前行为与缺口 |
| --- | --- |
| `app/page.tsx:211–239`，特别是 221、235、237 | CasesView 表单收集 receiptNumber、formType、nickname，POST `/api/cases`，保存后重新加载；卡片显示收据、标签、创建时间、删除按钮和官方链接。**没有刷新官方状态按钮，也不展示 statusText / lastCheckedAt。** |
| `app/api/cases/route.ts:21–31` | 从 `ownerFromRequest` 取得 owner，调用 `saveCase(owner, payload)`，201 返回保存行；不接受状态文本作为保存字段，不请求 USCIS。 |
| `lib/workspace.ts:32–48` | `saveCase` 去掉非字母数字并大写，检查三字母 + 十数字；UUID 建档，以 `(owner, receiptNumber)` upsert，仅更新表单类型与标签。没有状态获取或状态写入。此格式检查不是向 USCIS 验证收据存在。 |
| `db/index.ts:5–6,44–54`；`db/schema.ts:38–53` | `getDb` 使用运行时 `DB` 的 Drizzle D1 连接；trackedCases 对应 `tracked_cases`，按 owner + receipt 唯一。初始化 SQL 与 schema 均已有状态列。 |
| `drizzle/0000_new_maria_hill.sql:40–51` | **已提交的初始迁移**含 `status_text TEXT NOT NULL DEFAULT 'Not checked'`、`last_checked_at TEXT`，后者可空。不是只有前端类型占位，无需再添加同名列。 |
| `app/api/cases/route.ts:7–18,35–46` | GET 按 owner 查询整行、按 createdAt 倒序，因而 JSON 已包含两个状态字段；DELETE 同时限定 owner 和 id。当前错误分支 49–50 会返回异常 message；新刷新接口不得照搬可能泄露上游内容的做法。 |
| `app/page.tsx:11,57–79,113–115,237` | TrackedCase 类型已有两个字段；`refresh()` 从本应用四个 API 读数据、写入 React state，首屏也调用。该函数只是重新读 D1，**不是 USCIS 刷新**。 |
| `app/page.tsx:237` | 链接为 `https://egov.uscis.gov/casestatus/mycasestatus.do?appReceiptNum=` + encodeURIComponent(receiptNumber)，新标签打开且 `rel="noreferrer"`；代码只能证明生成带参链接，不能证明官网 GET 会直接返回案件结果。 |
| `lib/mcp.ts:25–39,59–63,82` | `list_cases` 的描述明写 “Does not fetch live statuses”；只读 owner 的 receiptNumber，返回 receiptNumber + statusUrl，不返回两个状态字段。`add_case` 复用 saveCase。不存在刷新工具。 |

两个字段的结论：**schema、0000 迁移、运行时初始化、GET JSON、前端类型都有；saveCase 的业务写入、上游获取、UI 展示、MCP 输出没有。** 默认 `Not checked` 是应用占位，不是 USCIS 原文。未查询远端 D1；部署前仍需核对真实列和迁移历史。`CREATE TABLE IF NOT EXISTS` 不会为既有表补列（当前初始化见 `db/index.ts:44–54`），不能替代迁移核对。

运行时与约束也以代码为准：

- `wrangler.jsonc:3–24`：Worker `immigrant-os`，入口 `worker/index.ts`；D1 `DB` → `immigrant-os-db`，迁移目录 `drizzle`；R2 `BUCKET` → `immigrant-os-files`。`AUTH_MODE=session`、`AGENT_MCP_ENABLED=true`，`workers_dev=true`、`preview_urls=false`、routes 为空；**无 triggers/cron**。这只是本地配置，不证明生产状态或 Access 策略。
- `worker/index.ts:38–88` 只有 fetch，无 scheduled；注入 DB/BUCKET 与 auth 配置，`/mcp` 先走独立处理（50–51），普通 web API 经 `handleAccessAuth` 后交给 app router（61–82）。本功能不涉及 R2。
- `lib/access-auth.ts:18–68` 要求验证后的 Access 身份与应用 session owner 一致；`lib/auth.ts:36–49,83–93` 在 session 模式从已验证签名、未过期的 D1 session 取 owner，不使用客户端传来的 owner 或明文身份头。
- `docs/cloudflare-hosting.md:16–30,108–119` 区分本地 schema、初始化与远端迁移；其 18 行“disabled default URLs”与当前配置不同。`README.md:14` 的 MCP 未实现描述和 53 行默认关闭描述滞后，以以上代码为准；不将这些文字作为现状证据。
- `docs/content-audit.md:11–13,94–128` 将“附来源”与“验证个人结论”区分；本稿继续不引入案件解读、资格或申报判断。此前审计并非本次重新验证移民规则。

## 2. 官方渠道实证与路线选择

### 证据方法与可复核记录

以下访问日期均为 **2026-11-11**。本地 `hostname` 返回 `Mac-mini-M4-1`，`uname -m` 为 `arm64`。HTTP 是 curl GET 跟随重定向后的最终响应码；200 后还检查正文，不能把 JS 空壳算作已读到条款。临时证据位于 `/tmp/uscis-v1-evidence/`（不入 Git）；结论与关键句保留在本稿，不依赖临时文件长期存在。

使用下列命令形态逐条请求表中 URL（无账号、cookie、真实收据、代理轮换、UA 伪装或挑战求解）：

```sh
curl -L -sS --max-time 25 -o /tmp/uscis-v1-evidence/PAGE.html \
  -w 'HTTP %{http_code}\nURL %{url_effective}\n' '表中对应 URL'
```

带参测试用 **`appReceiptNum=INVALID`**，故意不使用格式有效但归属未知的收据；它只验证访问入口，不证明有效案件的查询方式。最初 Python 子进程批量 curl 全部报 exit 6 / DNS 失败（HTTP `000`，不是服务器状态）；随后独立 curl 得到下表实测结果。未将 DNS 失败解读为 USCIS 宕机。Web 搜索用于发现官方资料；条款搜索索引与现场返回正文不一致，单独标明。

| ID | 官方 URL（必要时列最终地址） | HTTP / 日期 | 正文观察、支持的事实与未验证部分 |
| --- | --- | --- | --- |
| S1 | https://egov.uscis.gov/casestatus/mycasestatus.do | **403** / 2026-11-11 | 本地 GET 正文标题为 “Attention Required!”，含 “Sorry, you have been blocked”，页面标识 Cloudflare。没有取得状态表单或结果。 |
| S2 | https://egov.uscis.gov/casestatus/mycasestatus.do?appReceiptNum=INVALID | **403** / 2026-11-11 | 同类拦截页；带参数不能绕过本次拦截。**有效收据 GET 能否直接出结果、是否必须 POST、表单 action/隐藏参数均 UNVERIFIED。** |
| S3 | https://egov.uscis.gov/robots.txt | **403** / 2026-11-11 | 也是拦截页，并非 robots 内容；该主机对自动查询的 robots 指令 **UNVERIFIED**。 |
| S4 | https://www.uscis.gov/robots.txt → https://www.uscis.gov/sites/default/files/robots.txt | **200** / 2026-11-11 | 含 `User-agent: *`、`Crawl-delay: 10`、多条特定路径 Disallow，另有 `User-agent: PetalBot` / `Disallow: /`。不将 www 主机内容套用于 egov，也不把爬取延迟当作自动查询许可。 |
| S5 | https://www.uscis.gov/website-policies | **200** / 2026-11-11 | Site Security 段含 “Unauthorized attempts to upload information or change information on this service are strictly prohibited”。检查正文未找到明确允许或禁止 egov 自动状态查询的专门句子；该项 **UNVERIFIED**，不是许可或法律结论。 |
| T1 | https://myaccount.uscis.gov/legal-terms#tos-tos （由 A5 链接） | **200，JS 空壳** / 2026-11-11 | curl 与 web open 只读到需启用 JS 的页面；当前完整条款正文 **UNVERIFIED**。同日搜索索引可见 Rules of Behavior 片段，见下方，不能等同现场条款验证。 |
| A2 | https://developer.uscis.gov/get-started/sign-up | **200** / 2026-11-11 | 开发者账号 → Developer Team → Team App → Client Credentials；注册可自助接入 Sandbox，不能由此推断已获生产访问。 |
| A3 | https://developer.uscis.gov/get-started/sandbox | **200** / 2026-11-11 | OAuth 2.0 Client Credentials；Sandbox token URL `https://api-int.uscis.gov/oauth/accesstoken`。Case Status Sandbox **1,000 次/日、5 TPS**；页面说生产日额度与吞吐量获批后提供。未调用 token/API。 |
| A4 | https://developer.uscis.gov/get-started/production-access | **200** / 2026-11-11 | 生产步骤为申请、Affidavit、demo ID、预约演示；Affidavit 要打印签字。没有自动获批承诺。 |
| A5 | https://developer.uscis.gov/faqs | **200** / 2026-11-11 | 面向 “software development organizations incorporated within the United States”；另列 Section 508、隐私政策及审核要求，对外营销需公开政策网站。**不能认定无组织背景的个人开发者符合要求**；Chao 的具体组织准入未验证。 |
| A6 | https://developer.uscis.gov/api/case-status | **200** / 2026-11-11 | Case Status 产品页与当前 1.0.0 规范链接。要求第三方不得未经明确同意提交/使用非应用用户的收据，并提及不能查询邻号。不得将其推论为“登录用户就有权查任意收据”。 |
| A7 | https://developer.uscis.gov/get-started/production-access/affidavit | **200** / 2026-11-11 | 询问组织、开发团队所在地、业务主页、联系人等；签署联系人需能代表组织。审核隐私、删除与数据保留等政策。未提交资料。 |
| A8 | https://developer.uscis.gov/node/140 | **200** / 2026-11-11 | 演示检查 OAuth、成功/错误处理与 UI 展示；原文 “Request originating from any client applications are prohibited.”，密钥/token 留在服务端。页面当日显示最早演示档期为 2027 年 3 月；仅为当时公告，不承诺排期。 |
| A9 | https://developer.uscis.gov/get-started/production-access/request | **200** / 2026-11-11 | 申请前要求账号、Sandbox app、至少 **5 个连续日历日** API 流量及成功/4xx 测试；之后联系支持。本文没有联络任何人。 |
| A10 | https://developer.uscis.gov/sites/default/files/apidoc_specs/swagger_3.yaml | **200** / 2026-11-11 | 从 A6 HTML 的 swaggerFile 发现的 OpenAPI 1.0.0；Sandbox base URL、GET `/{receiptNumber}`、read scope、响应字段及错误码见第 3 节。描述列生产 **400,000 次/日、10 TPS**，但重置原文 “-04:00 UTC (Midnight EST)” 有歧义，且与 A3 的获批后提供额度说法并存；**不能当作本 app 已授予额度**。 |
| C1 | https://developers.cloudflare.com/workers/platform/pricing/ | **200** / 2026-11-11 | Workers Free 表：**100,000 请求/日、每次 10 ms CPU**；实际账号套餐、剩余额度及当前 Worker CPU 用量 **UNVERIFIED**。 |
| C2 | https://developers.cloudflare.com/d1/platform/pricing/ | **200** / 2026-11-11 | Free 表：**5,000,000 行读/日、100,000 行写/日、5 GB 总存储**；扫描行数和索引写入也影响用量。实际 DB 余量 **UNVERIFIED**。 |

T1 搜索索引中的关键片段为：“Attempt to bypass access control, monitoring, or auditing measures instituted by DHS or USCIS”。[原文入口](https://myaccount.uscis.gov/legal-terms#tos-tos) 的 HTTP 200 只证明空壳可取，**这句当前仍有效及适用范围均 UNVERIFIED**；上线前由 Chao 在正常浏览器核对完整条款。该片段、S4、S5 均不用于作法律结论，也不用于声称官方明确禁止所有自动查询。产品层面的决策是：在页面已拦截、适用条款未核清时，不做网页自动抓取。

**网页交互结论：**本次确实遇到安全拦截；没有观察到可交互 CAPTCHA，不能据此写“没有 CAPTCHA”。因 S1/S2 已被拦截，没有猜测 POST action、提交表单、加载挑战脚本或尝试绕过。正常浏览器是否可打开/预填仍为 UNVERIFIED；官方链接提供带参入口，并附“若未带入收据，请在官方页面手动输入”的退路，不承诺直接结果。

**费用结论：**已读 A2–A10 没有建立可引用的 API 收费/免费价格表；“API 免费”“个人无门槛”均 **UNVERIFIED**。生产 token/status URL、实际授权范围、额度重置边界与商业条件需随审批确认。不得猜测生产主机地址、把 Sandbox 测试数据用于真实案件，或将 400,000 次/日当作既得额度。

### 路线取舍（产品决策）

| 路线 | 取舍与 v1 决策 |
| --- | --- |
| A：获批官方 API，Worker 单次查询 | 官方结构化响应、可验证来源，符合目标交互；准入、政策、测试、演示、费用与配额确认会影响上线。**推荐的正式同步路线，条件满足前关闭。** |
| B：浏览器打开官网 + 手动复制粘贴 | 本 app 不自动访问 USCIS、不需要 API 密钥；多一步操作，无法验证粘贴文字或官网查询时间。作为需明确选择的备选，单独存为未核验副本，不计作官方同步。用户自行完成官网交互；app 不接管登录、CAPTCHA 或浏览器。 |
| C：Worker curl/解析 HTML 或浏览器跨域 fetch | S1/S2 已阻断，表单契约与条款未核实；浏览器 CORS 可用性也 **UNVERIFIED**。v1 不选，不用代理、浏览器自动化、验证码服务或第三方抓取商回退。 |
| D：仅保留现有官方链接 | 无同步新能力，但能保持明确来源与现有隐私边界。若 A 暂不可达且不接受 B 的来源限制，采用此等待态。 |

用户按按钮不意味着后端抓网页不再是自动访问；本设计不会以“手动刷新”的命名跳过来源/条款核验。

## 3. 手动刷新流程、存储语义与失败文案

### 正式路线 A：浏览器 → 本应用 Worker → 官方 API → D1

以下接口和文件职责为**后续实现设计，不是已存在端点**：

1. 卡片添加“刷新官方状态 / Refresh official status”，保留官方来源链接。首次使用说明收据将发送给 USCIS，只支持用户本人的案件；记录该 owner 对该收据的明确确认及文案版本。现有保存记录不等于已同意 API 传送，不自动查询所有已存收据。v1 不提供代表他人或邻号批量查询入口。
2. 点击只向同源 **POST `/api/cases/{caseId}/refresh`** 提交空 JSON（首次确认另由显式确认动作完成）；不把 receipt 放进本应用 URL，不接受 owner、上游 URL 或任意收据作为请求参数。浏览器只调用本应用，不保存官方 API 凭证，不直接调 USCIS（A8）。列表 GET、首屏加载、重开页面、focus 与 MCP 都不得触发外呼。
3. 经过现有 Access/session 链；服务端再次用 `(owner, caseId)` 查询并检查确认记录。未找到/非本人统一 404，未认证 401；校验 Origin、JSON Content-Type 与请求大小，拒绝跨站写入。检查功能开关、配额、冷却与持久化锁；抢占成功才发请求。前端按钮锁仅改善交互，不能承担限流。
4. Worker 服务模块读取服务端 secret，按 A3/A10 的 OAuth Client Credentials 取得 read token；token 缓存限服务端、按官方 expires_in 提前失效，缺失有效过期信息则不长期缓存。生产 URL 仅来自已批准配置并精确 allowlist；禁止跟随到其他 host 的重定向。Sandbox base 为 `https://api-int.uscis.gov/case-status`，GET `/{receiptNumber}`；生产地址仍待授权，不从域名猜测。
5. 一次点击最多一次状态 API 请求；token 请求也受全局外呼门限控制。整个操作建议 10 秒截止（包括认证、状态响应读取），token 子请求至多 3 秒；到期 Abort。响应体上限 64 KiB，提取文本上限 16 KiB UTF-8；超限返回技术失败，不截断后冒充完整原文。
6. A10 的成功结构：`case_status.receiptNumber`、`current_case_status_text_en`、`current_case_status_desc_en`（另有 es 与可选历史）。核对 receipt 精确匹配已保存值、字段类型与非空。**只取当前英文标题与正文**，标题 + 两个换行 + 正文写入已有 statusText；只规范换行，不摘要、翻译、分类或据关键字判断状态。保留原文拼写。IOE 缺少 submittedDate / modifiedDate 是规范所列差异；不将其当失败，也不依赖这些字段。
7. 使用同一 owner、case id 和 lease token 条件写入：statusText、statusSource=`uscis_api`、lastCheckedAt=服务端成功接收并校验响应的 UTC ISO 时间；同时清除操作错误/失败次数。即使文本没变，也更新成功核对时间；不保存上游整个 JSON、历史列表、顶层 message 或 modifiedDate，不解释内部事件。
8. **提交 D1 成功后**才向浏览器返回最小卡片数据，前端就地更新，不调用现有四请求 `refresh()`。用“上次从 USCIS 获取：{时间} / Last retrieved from USCIS”描述 lastCheckedAt；它不是 USCIS 案件事件时间，也不是用户点击时间。卡片始终呈现官方链接、来源、获取时间、短免责声明。失败保留旧快照并标明“本次未更新”，不能把旧文本说成刚核验。

statusText 存原文，不增添 approved/pending 等产品归一化状态。技术错误码（timeout 等）放独立操作元数据，不进入 statusText。空白、HTML 拦截页、错误 JSON、收据不匹配或 schema 变更一律不覆盖快照。未经确认的既有非默认值保留但不自动标为官方数据；渲染成功快照要求 statusSource 和 lastCheckedAt 都有效。

### 失败分类与文案

下列文案为产品草案；官方响应码依据 A10（403/网络/存储错误是本 app 的处理设计）。每条错误附近保留“打开 USCIS 官方页面”链接。不得把任意 404 解读成案件不存在，更不能由此推断案件属性。

| 情况 / 本应用错误码 | 中文 / English UI | 重试与数据处理 |
| --- | --- | --- |
| 官方 404 / `status_unavailable` | “USCIS 未返回此收据的可用状态。请核对号码或打开官方页面。” / “USCIS did not return an available status for this receipt. Check the number or open USCIS.” | A10 的 404 有多种情形；不显示“你的案件不存在”。不覆盖成功快照；该收据 24h 冷却，无自动重试；号码纠错走建档流程。 |
| 本地格式不合 / 官方 422 / `invalid_receipt` | “收据号格式未通过检查，请核对输入。” / “The receipt number format was not accepted. Check your entry.” | 本地拦截不外呼；官方拒绝后不以相同输入重试。现有 saveCase 不支持 A10 另列的星号格式，v1 保持已支持格式，不承诺支持所有收据；扩展校验另行设计。 |
| 5xx、DNS/连接错误 / `upstream_unavailable` | “暂时无法取得 USCIS 状态；已保留上次保存内容。” / “USCIS status is temporarily unavailable. Your saved result is unchanged.” | 后续人工点击最早 15min、30min、60min、上限 6h 退避；第三次连续上游失败触发全局暂停门，需复核恢复。不能把 app 网络故障断言为 USCIS 全站宕机。 |
| 403、挑战页、异常 HTML / `upstream_blocked` | “USCIS 暂未允许本次连接。请打开官方页面查看。” / “USCIS did not allow this connection. Open the official page to check.” | 停止自动连接路线、触发全局关闭待复核；不换 host/IP、不解 CAPTCHA、不回退 HTML 抓取。 |
| 超时 / `upstream_timeout` | “本次查询超时，保存内容未更新。请稍后重试。” / “This check timed out. Your saved result was not updated. Try again later.” | 请求计入配额；同临时失败退避；无后台重放。 |
| 官方 429 / `upstream_rate_limited` | “官方查询暂受限，请在 {时间} 后再试。” / “USCIS requests are limited. Try again after {time}.” | 至少 1h 并遵守更长 Retry-After；日额度耗尽或无法区分原因时暂停至少 24h，再由人工复核额度。时间仅是本 app 下次可尝试时间。 |
| 本地频控 / `cooldown` | “请在 {时间} 后再次刷新；仍可打开官方页面。” / “You can refresh again after {time}, or open USCIS now.” | 本 app 429 + Retry-After + nextAllowedAt；不消耗上游次数，不排队定时发送。 |
| 官方 401、凭证失效 / `integration_unavailable` | “官方状态连接暂不可用，请使用官方页面。” / “The official-status connection is unavailable. Open USCIS.” | 清除失效 token 并暂停路线待操作者修复；同次点击不做盲目重新认证/状态重试循环。 |
| schema 不符、空正文、收据不匹配 / `unexpected_response` | “未取得可保存的官方状态；上次内容保持不变。” / “No usable official status was received. Your saved result is unchanged.” | 不把内容展示为状态；暂停适配器待排查。记录固定错误码，不记录响应原文。 |
| D1 保存失败 / `save_failed` | “本次结果未能保存，请稍后重试。” / “This result could not be saved. Try again later.” | 不报告刷新成功、不推进 lastCheckedAt；上游请求仍算一次。保留锁/尝试记录的保守结果，下一次仅用户主动发起。 |
| 未登录、非 owner、进行中 | “请重新登录。” / “Please sign in again.”；“未找到该记录。” / “Record not found.”；“正在刷新…” / “Refreshing…” | 401、404、409；不外呼，不泄露其他 owner 是否拥有该收据。 |

演示页 A8 要求可见官方错误 message；新接口同时只在已认证的本次请求 UI 中以转义纯文本显示经结构验证的官方错误 message（如有），与以上技术提示分开标注“官方错误信息”。不持久化或写日志，不让未验证 HTML/异常栈进入 UI。A3 的 `errors[]` 与 A10 的 `message` 格式有差异；后续以正式获批版本及 fixtures 锁定支持的结构，不能假设所有错误均一种格式。

### 半自动备选 B（只有选择该路线后才实现）

按钮标为“打开官网并保存副本”，不叫“已同步”。浏览器新标签打开当前官方链接；必要时用户手动输入收据、完成官网自身交互，复制当前状态标题和正文，返回本应用粘贴纯文本并主动保存。app 不读取剪贴板除非用户操作，不用扩展、iframe 注入或跨域读取，不收集 USCIS 账号/cookie。

保存接口拟为 POST `/api/cases/{caseId}/manual-status`，仅接受限定长度的文本；沿用第 4 节 owner/CSRF 控制。UI 单列“用户从官方页面粘贴，未经本系统核验 / Pasted by you; not verified by this app”，旁附官方链接；时间标为“保存副本时间”，不写“USCIS 核对时间”。打开官方页、取消粘贴或空文本都不推进任何核对时间；不会识别用户是否遇到 404/CAPTCHA。仅显示用户提供的原文，不添加解析结果。由于来源不可机器验证，此能力不满足严格的“只显示系统取得的官方返回”验收，需明确选择其范围，否则走路线 D。

## 4. 数据与安全设计

### D1：复用已有列，新增来源与操作元数据

正式路线只保留一份当前快照，不做历史趋势。新增字段/表是**迁移草案方向**；本文 SQL 不执行，也不产生 `.sql` 文件或修改 schema。后续编号由当时迁移链决定，不先占用 `0003`。

```sql
-- 已有 status_text / last_checked_at，禁止再次 ADD。
ALTER TABLE tracked_cases ADD COLUMN status_source TEXT
  CHECK (status_source IS NULL OR status_source = 'uscis_api');
ALTER TABLE tracked_cases ADD COLUMN refresh_consent_at TEXT;
ALTER TABLE tracked_cases ADD COLUMN refresh_consent_version TEXT;
ALTER TABLE tracked_cases ADD COLUMN last_refresh_attempt_at TEXT;
ALTER TABLE tracked_cases ADD COLUMN last_refresh_error_code TEXT;
ALTER TABLE tracked_cases ADD COLUMN refresh_failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tracked_cases ADD COLUMN next_refresh_at TEXT;
ALTER TABLE tracked_cases ADD COLUMN refresh_lease_token TEXT;
ALTER TABLE tracked_cases ADD COLUMN refresh_lease_expires_at TEXT;

-- 配额记录无明文收据或响应；删除案件后仍保留短期反滥用计数。
CREATE TABLE case_refresh_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  case_id TEXT REFERENCES tracked_cases(id) ON DELETE SET NULL,
  receipt_key TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome_code TEXT NOT NULL DEFAULT 'reserved'
);
CREATE INDEX case_refresh_attempts_owner_time_idx
  ON case_refresh_attempts(owner, started_at);
CREATE INDEX case_refresh_attempts_receipt_time_idx
  ON case_refresh_attempts(owner, receipt_key, started_at);
CREATE INDEX case_refresh_attempts_time_idx
  ON case_refresh_attempts(started_at);

-- 在短暂的原子预留操作中序列化预算检查；同时承载全局外呼间隔/熔断。
CREATE TABLE case_refresh_gate (
  id TEXT PRIMARY KEY NOT NULL,
  reservation_token TEXT,
  next_dispatch_at TEXT,
  blocked_until TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0
);
```

receipt_key 用专用服务端 secret 对 owner + 规范化收据做 HMAC，不用可枚举的裸 hash；它仍按敏感关联标识保护。该 key 使删除再添加相同收据不能绕过冷却；不得跨 owner 共用缓存/结果。修改 HMAC secret/version 不得清空仍有效的 24h 限制，轮换期保留旧 key 核对。`case_refresh_gate` 使用固定全局行；正式原子操作细节需在本地真实 D1 并发测试通过后锁定。

预算预留的不可分割条件：检查 owner 滚动计数、receipt 冷却、全局预算/间隔/熔断、case lease，**一次原子胜出后**插入 attempt 并设置 lease；失败者不外呼。receipt 冷却及失败退避从 `(owner, receipt_key)` 的短期 attempt 记录重建，`next_refresh_at` 只是便于展示，删后重建案件不能跳过该检查。owner/全局的进行中判断检查尚未 finished 且在 30s 租期内的 reserved attempt；`next_dispatch_at` 的 1s 间隔本身不能代替并发控制。不能以跨请求的“先 SELECT 后 INSERT”或 Worker 内存锁声称互斥。锁租期建议 30s，大于 10s 网络截止；最终写入检查 lease token，过期旧请求不得覆盖新结果。崩溃留下 reserved 也计入预算；租期到期仅允许以后的人工请求，不启动重试任务。账户间一律独立快照，即使收据相同。

本 app 的 API 响应拟包含 `id/statusText/statusSource/lastCheckedAt/lastRefreshErrorCode/nextAllowedAt/statusUrl`；source URL 在服务端由固定官方地址与已保存收据构造，不接受用户任意 URL，不另存可漂移 URL 字段。确认记录仅证明用户对功能的确认，不证明真实案件归属。

若选择路线 B，另加 nullable `manual_status_text`、`manual_status_saved_at` 两列；不改 statusText、lastCheckedAt 或 statusSource，不用粘贴覆盖 API 快照。这两列不进入只读 MCP。未选 B 就不建这两列和对应端点。未来新增 schema、初始化 SQL、迁移要保持一致；不要用运行时初始化掩盖既有库迁移遗漏。

### 隐私、隔离与生命周期

- 复用 `ownerFromRequest` 和现有 Access/session；所有读取、更新、删除均同时限定 owner 与 id。未认证请求不能查询 receipt 是否存在。新增刷新端点不进入 `/mcp` 的独立认证入口，不新增 Access bypass，不改变 audience。
- POST 限同源、正确 Origin 与 JSON；浏览器流程缺失或不匹配 Origin 时拒绝，拒绝 cross-site Sec-Fetch-Site。限制 body（建议 1 KiB；手动文本接口 20 KiB），按允许键解析。GET 只读且 `private, no-store`；禁止共享 CDN 缓存案件结果。
- 日志仅含固定错误码、时长分桶、匿名聚合计数及随机 attempt id；**绝不记录完整或部分收据、owner 邮箱、上游 URL、响应正文、token/cookie**。A10 顶层 message 和状态正文可能含收据，不能通过 exception、HTTP tracing、分析 SDK 或错误上传间接记录。日志采用字段 allowlist，而非事后仅替换 receiptNumber 字段。
- 官方源链接不可避免携带收据到 USCIS；说明传输对象，保持 `noreferrer`/`noopener`，禁用点击埋点和第三方分析捕获 href。正文用 React 转义纯文本渲染，不用 dangerouslySetInnerHTML、不执行状态内链接/脚本；不将其发送给 LLM、规则引擎、提醒或预测模块。
- API 凭证仅运行时 secret，不能放 `VITE_*`、客户端 bundle、Git、本文或 D1；不借用用户 USCIS 登录、也不要求用户把官网密码粘贴进 app。未来部署 secret 需另行授权，本稿不执行。
- 快照及可选手动副本保留至用户删除案件；不做历史副本。attempt 元数据保留 48h，超过窗口后在已有请求中限量清理，不加 cron；删除案件清除快照/确认/lease，短期计数只留 HMAC 标识与 owner，避免删后重加重置限额。未来账户删除流程需覆盖计数、手动副本、确认记录；备份保留期与生产删除时限仍需上线前明确，不承诺立即清除备份。
- **MCP v1 不开放刷新，也不扩展 list_cases 状态字段。** 保持 receiptNumber + statusUrl 与 “Does not fetch live statuses” 描述。Agent 的循环/重试容易消耗用户查询预算，且未建立每次用户点击的确认边界；新增工具需单独设计授权、配额、来源及注入风险。

## 5. 防滥用与成本

下列数字是**产品建议上限，不是 USCIS 批准额度或案件更新频率结论**；实际允许值取已确认上游限制与本 app 上限的更小者。

| 范围 | v1 建议与原因 |
| --- | --- |
| 单收据 | 相邻刷新至少 15min；失败按第 3 节延长。减少双击/重复查看消耗，点击频率不用于推断案件更新。 |
| 单用户 | 至少间隔 60s；滚动 24h 最多 12 次外呼尝试（含失败/超时），同一时间最多一条刷新进行中。可分配给多个本人案件，无“全部刷新”。 |
| 全局 | 外呼间隔至少 1s，OAuth 与状态调用均纳入；并发最多一条上游操作。不在内存里长时间排队，繁忙即返回可重试时间。 |
| 生产总量 | 滚动 24h 最多 `min(1,000, 已确认日额度的一半)` 次状态尝试，另保留认证请求余量；生产额度/认证计费方式未确认则功能保持关闭。半额余量降低不同重置边界与其他客户端用量的冲突，仍需账号级协调。 |
| Sandbox | 仅官方 staging receipts（A10）；该开发 App 总量预留余量，最多 500 次/滚动 24h、外呼不快于 1/s，不把生产真实收据拿去测试。 |
| 失败与熔断 | 无自动重试、无轮询；503/网络/超时 15min → 30min → 60min → 至多 6h，受其他上限共同约束。连续三次上游失败、单次 403/401/schema 异常暂停集成，操作者检查后恢复；429 遵守更长等待。超额只停止，不购买容量或换渠道。 |

服务端提供 nextAllowedAt/Retry-After；到时间只是恢复按钮可点，不创建后台请求。按 owner 限流不能替代账号级总预算。非法请求在认证、大小与源校验处尽早拒绝；拒绝请求仍可能消耗 Worker 请求量，因此预算估算不是抗无限攻击保证。

**容量模型（假设，不是实测用量）：**100 名活跃用户，每人 3 个案件，每案每日点 2 次 = **600 次刷新/日**。就地更新 UI 时每次 1 个本 app 请求；若需要额外确认读取，保守按 2 个算，即 **600–1,200 Worker 请求/日**，30 天 18,000–36,000。单用户上限合计可达 1,200 次/日，生产全局 1,000 上限先截断，则本功能约不超过 2,000 正常请求/日（不含失败按钮点击、登录、列表、其他业务与恶意流量）。USCIS 外呼 600 次状态请求加 token 更新，和入站 Worker 请求分开计数。

C1 的 Free 为 100,000 请求/日；此假设下新增请求量低于该阈值。**不能据此承诺整个 app 免费可运行**：还要加账号其他 Worker 用量，测量现有 Access 验签/框架/解析在 10 ms CPU 限制内的表现，确认实际套餐。网络等待时间不能拿来替代 CPU 测量；本稿没有调用云指标或做生产压测。

D1 预算先按每次尝试最多约 30 行读、12 行写（含索引/预留/结果/清理摊销）估算：1,000 次/日约 30,000 行读、12,000 行写，另加现有会话/列表/其他业务。与 C2 的 Free 行数上限相比有空间，但这只是设计预算；并发预留查询若扫描大量 attempt 行会放大读取，需使用索引/有上限的统计并以 D1 meta 实测。不能把“一条 SQL”算“一行”。300 份各至多 16 KiB 的当前文本约 4.7 MiB，加 48h 操作元数据；不存历史、无新 R2 读写。生产已有 DB 大小、剩余额度及 API 费用均 **UNVERIFIED**；任一预算不足先关闭刷新，不自动付费。

## 6. 合规红线与展示文案

硬约束：正式状态区只呈现 API 返回的当前原文及官方链接、来源与取得时间。**不解读状态含义，不生成快/慢判断、概率、预测、资格或可申报结论**；不据状态改变用户档案、行动计划、截止日期或提醒。不得以红绿灯、进度百分比、队列排名或“下一步建议”暗含上述结论。保留英文原文；v1 不做机器翻译或自动摘要。

每处状态展示（含展开区、将来若有其他展示面）紧邻可点击官方出处，成功/失败/旧快照均不省略。数据源 `uscis_api` 只证明本 app 取得了该响应，不代表 app 对案件作独立核验。无成功快照时显示“尚未从 USCIS 获取状态”，不把默认 `Not checked` 当官方状态。

中文短句：**“仅展示 USCIS 返回原文；请以官方页面为准。本应用不作状态解读、预测或资格判断，不提供法律建议。”**

English: **“USCIS text is shown as returned. Check the official page. This app does not interpret status, predict outcomes, determine eligibility, or provide legal advice.”**

路线 B 除同样的禁止解读边界，必须用其专用来源说明，不能套“USCIS 返回原文”的 API 声明：**“这是你粘贴的副本，未经本应用核验。请在 USCIS 官方页面核对。” / “This is a copy you pasted, not verified by this app. Check the USCIS page.”** 若产品不接受该来源区别，就不提供 B。

## 7. 分阶段上线门与本稿验证

| 阶段 | 放行条件 |
| --- | --- |
| Phase 0：本稿 | 基线与证据可追溯；来源限制明确；两文件白名单核对；仅本地验证，无云操作。设计完成不等于 v1 可上线。 |
| Phase 1：后续本地实现 | 先获得实现范围授权；确定 A 或 B/D。默认关闭官方刷新。用合成 fixtures 完成接口、迁移草案落地及 UI；不接生产数据。 |
| Phase 2：官方 Sandbox（仅 A） | Chao 确认组织准入并自行注册/接受条款；授权 Sandbox 配置与官方 staging receipts 测试；按 A9 完成连续日测试、错误处理、政策/删除流程、Affidavit 与演示准备。Demo 排期/通过和费用不作保证。 |
| Phase 3：受限生产手动试点（仅 A） | 正式 API 授权、生产 URL/字段契约/条款/费用/配额均已核对，清单全部通过；另行授权迁移/部署并保留当前 audience。只对明确确认查询的试点用户开启，无 cron。 |
| B 备选单独上线门 | Chao 选择未核验副本范围；正常浏览器官方链接流程实测、来源标记/删除/注入/隔离通过；不声称已经完成官方同步。无需为粘贴路线索取 API 凭证。 |
| v1.1 自动轮询 | **后议，不在本稿实现。** 仅在官方 API 实际可用且其授权允许计划查询，或适用 ToS 明确允许所拟自动查询后，才另立设计讨论频率、同意、撤销、预算及触发器。人工 API 获批不自动打开轮询。 |

v1 手动刷新上线前检查清单：

- [ ] 来源门：复核 T1 完整条款，核清 A3/A10 的额度及重置歧义、生产地址和 API 费用；不以 200、robots、按钮点击或网页链接替代授权。若无法满足，保持 A 关闭。
- [ ] 数据门：核对目标 D1 的现有列/迁移 ledger；备份与恢复方案就绪，新增 schema/初始化/迁移一致。默认/未知来源旧值不会冒充成功状态，失败不清空旧快照。
- [ ] API 契约门：验证当前 English 标题/正文、IOE 与非 IOE、空值、404/422/429/401/503、HTML/挑战、错收据、超大体、超时、存储失败；不由错误推断案件是否存在或其他个人属性。fixtures 不含真实个人收据。
- [ ] 并发门：双击、多标签页、多 Worker 并发只有一次预留成功；owner/receipt/global 限额都不可越过；删除再加不能重置限额；租约过期、崩溃、迟到响应不覆盖新状态、不自动重试；token 更新同受限流。
- [ ] 安全门：真实两账号 owner 隔离、伪造 owner/id/headers、Access 与 session 不一致、过期会话、CSRF、XSS/提示注入测试；鉴权先于外呼；日志/监控不出现 receipt、正文、身份或凭证；MCP 仍无刷新和状态扩展。
- [ ] UI 门：首次确认、无成功记录、进行中、冷却、旧快照、失败、成功重复文本、移动端/键盘均可理解；时间带时区且标明获取时间；每处状态附官方链接和对应免责声明；链接带参失效有人工输入退路。
- [ ] 成本门：实际 CPU、D1 rows_read/rows_written、账号总预算与保留/删除策略通过；API 免费与否明确，遇额度停止；关闭开关保留既有快照/官方链接，不重置限额或回退抓取。
- [ ] 验证门：`npm ci`、`npm test`、`npx tsc --noEmit` 全通过；在允许本地监听的环境运行 Miniflare，不跳过、弱化或伪报测试。真实生产数据查询、上线和范围扩大需相应授权。

本次本地验证（Node 22.22.0，npm 11.14.1）：

- `npm ci --offline --no-audit --no-fund --cache /Users/chao/Projects/immigrant-os/.sites-runtime/npm-cache`：通过，锁文件未改。
- `npm test`：构建与 artifact validation 通过；**27 passed / 3 failed**，退出 1。失败均为 Miniflare 启动时 `listen EPERM: operation not permitted 127.0.0.1`，涉及 `tests/access-auth.test.mjs` 的 session 存储套件、`tests/auth.test.mjs`、`tests/workspace.test.mjs`；它们的嵌套检查未运行。不能声称全套通过，仍需在可监听环境验收。
- `npx tsc --noEmit`：通过，退出 0。
- 只交付两份文档；未运行 Wrangler 云命令、登录、购买、发消息、push、merge 或部署。临时下载、测试日志及构建产物不纳入 Git。

## 8. 需 Chao 的事项

1. **选择可实施范围**：接受正式路线 A 的准入等待，或选择 B 的“未核验手动副本”；若严格要求机器取得的官方原文且 API 暂不可用，保留 D。本文给出可审阅方案，不在本次要求登录或作上线批准。
2. 若选 A，核实是否有符合 A5 所述要求的美国注册开发组织；个人身份能否获得特定授权不能由本稿推定。自行处理注册、条款接受、政策资料、Affidavit 与演示；本次没有创建账号、预约、邮件或联系支持。
3. 正常浏览器核对完整适用条款和官网链接交互；取得生产地址、实际配额/重置规则、费用与凭证使用要求，并确认隐私、保存/删除时限。任何费用、账号动作或公开政策页面变更都需另行授权，不能为满足 API 门槛擅自公开当前 app。
4. 后续安排允许本地监听的环境重跑完整测试；API 准入/来源门通过后，才对具体实现、迁移、密钥配置及受限试点作上线决定。保持现有访问范围，不因 MCP 或 API 接入放宽 audience。

交付结论：已有状态列可复用；正式刷新选择获批官方 API + Worker，暂不抓网页；半自动副本为可选且必须标明未核验的替代。当前阻塞为网页 403、完整现场条款未核实、API 组织/生产准入与费用/额度待确认，以及本环境三项 Miniflare 启动失败；均未以猜测或实施绕过。
