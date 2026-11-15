# 正常业务模拟数据：用户侧功能与约束

盘点日期：2026-11-11。本文只读盘点当前源码，未调用生产接口、未读取生产数据库、未执行填充。以下为 root 编排 seed 的契约，不代表这些数据已经生成。接口统一省略部署前缀 `/marathon/api`；用户写操作使用对应合成用户身份，团内管理使用有权管理该团的身份。

## 1. 精确识别现有合成账号

root 的线上只读核对结果：

- 用户 ID 为 **8–207**，共 200 人；昵称严格为 `测试跑者001` 至 `测试跑者200`，即 `nickname === '测试跑者' + String(id - 7).padStart(3, '0')`。
- 这批账号的 `created_at` 同为 `2026-11-10T14:49:00.392Z`。用 ID、昵称、创建时间与原始 manifest 交叉验证，不按昵称模糊搜索、总人数或跑团成员表推断身份。
- 原始 manifest 位于 `/home/ubuntu/marathon-data-backups/refresh-20261110144900392/accounts.json` 和同目录 `prepared-accounts.json`。可能含凭据；仅 seed 进程校验，不复制到文档、截图或公开报告。
- 目标跑团为 ID **13–22**，owner 为 ID 1；现有 490 条成员关系含团长及其他真实用户，**不能把全部成员作为合成用户**。个人资料、比赛标记、成绩、跑史和运动记录只写上述 200 人。
- 保留原昵称、密码、token、创建时间、成员入团时间和已有资料；不重建用户、不重置密码、不回拨 `joined_at`。若 manifest / ID / 昵称 / 时间任一条件不符，停止处理该账号并报告。

建议每个新增业务对象在可展示的名称/说明中含 `【模拟】`，并将本批对象 ID 写入独立 manifest。重跑按 manifest 或确定性业务键检查，避免重复；不能按“像测试数据”删除旧资料。

## 2. 时间与状态的统一约定

- 业务日期以北京时间计算，避免运行机器的 America/New_York 时区影响。`D = new Date(now + 8 * 3600000).toISOString().slice(0, 10)`，月份为 `D.slice(0, 7)`；完整时间一般是 `YYYY-MM-DDTHH:mm`，接口内部按 `+08:00` 解释。
- 使用执行时的真实 now 动态生成日期，不把本次盘点日期硬编码为“今天”。个人历史可覆盖过去 8 周及上一年；未来训练和比赛标记放在未来，已完成成绩放在过去。
- 可补历史的 API 与只允许当日操作的 API 要分开。验收脚本有临时 SQLite 的 SQL 时间改写，不能直接当作生产业务接口的能力。
- API 不校验未来时间的入口也不应填未来“已完成运动/比赛”。例如旧 `/result`、手填 `/runs` 能通过某些未来数据，但 runner 聚合会排除未来记录，且业务语义不成立。
- root 已决定仅对**本批新建模拟对象**做明确记录的历史日期 setup，以覆盖历史约跑、多日签到等接口无法回填的分支；必须在 seed manifest 报告这项 setup，不能改原成员时间或把它描述为真实参加记录。

## 3. 个人资料、首页与运动档案

| 页面/能力 | API 与 payload | 条件、联动和可填场景 |
|---|---|---|
| 我的、账号资料 | `GET /me`；`PUT /me/profile {nickname}` | 昵称 1–20 字，唯一且不含控制字符；本批保留精确昵称。该接口没有城市、性别、生日字段，不要写入不存在的 profile 字段。`/me` 汇总 plans、clubs、results、career、reminders/conflicts。 |
| 头像 | `POST /me/avatar {avatar: 'data:image/png;base64,...'}`，或 profile 的 avatar 字段 | 只上传自行生成的无真人头像；不能直接指定他人头像 URL。现有头像不覆盖。创建的媒体需有真实文件，不能只插一个失效地址。 |
| 运动档案六视图 | `GET /me/runner?period=week&offset=0` | `period=week/month/year/all`；offset 为 -1200..0，all 必须 0。由 runs、旧 results、runner_media、设备状态计算，不是可直接写入 summary 的接口。 |
| 月目标、性别 | `PUT /runs-flag {month: M, gender:'女', targetKm:120}` | 只能设本月；gender 为 男/女/空；目标不低于加入各团规则下限的最大值且至少 1，上限 9999。性别与雷达资料独立。可覆盖目标未完成、接近完成、已超额；不能伪造过去月份的“本人设立目标”。 |
| 奖项雷达条件 | `PUT /me/radar {gender:'女',birth:'1992-06',province:'浙江',targets:{full:'03:50:00',half:'01:45:00','10k':'00:48:00','5k':'00:23:00'}}`；`GET /radar` | 出生年月不能晚于本月，省份须在允许列表；目标用时空则用旧 results 的 PB。仅填合成资料，不宣称实际有奖金、获奖资格或概率。奖项与往届名次必须有来源，禁止把虚构奖项挂到真实官方赛事。 |

运动档案的周/月图来自个人 runs；城市/成绩/PB 来自 **旧 results**；私人跑史是另一套数据。只填 `/me/race-history` 不会让原成绩收藏、赛事成绩墙和 `/me/runner` 的旧成绩列表全部自动有内容。

## 4. 比赛标记、旧成绩与私人跑史

### 4.1 赛事计划与旧成绩

- `PUT /me/races/:raceId {status}`：状态完整枚举为 `想跑 / 已报名 / 待抽签 / 中签 / 未中签 / 已缴费 / 已领物 / 完赛 / 未完赛 / 弃赛`。raceId 必须在公共赛事库真实存在。
- `DELETE /me/races/:raceId` 移除计划，同时删除该计划报名资料，不应对旧数据批量使用。取消/放弃正常展示用“弃赛”状态，而不是为了验收删除大量计划。
- `PUT /me/races/:raceId/result {distance:'half',time:'01:45:30',story:'【模拟】稳定配速完成比赛。'}`：distance 必须属于该赛事的 distances；用时支持 `45:30` 或 `3:29:59`，>0 且不超过 12 小时；story 最多 200 字。按 user/race/distance upsert，**自动把该赛事计划改为“完赛”**。
- `DELETE /me/races/:raceId/result?distance=half` 会删除成绩及关联证明，不用于本批保留式填充。未完赛/弃赛只设计划，不同时写完赛成绩。
- 成绩证明：`POST /me/races/:raceId/result/proof/:kind?distance=half`，kind 为 certificate/medal，multipart 文件；先有本人该项目成绩。只能用明确写有“模拟资料”的自有图片，不冒充赛事官方证书。
- 运动收藏：`POST /me/runner/media?kind=photo&raceId=:id&distance=half`，multipart；kind 为 certificate/medal/photo/video，先有本人旧 results。图片 JPG/PNG/WebP ≤8MB；视频 MP4/WebM ≤40MB；每人 500 个、单赛事项目 30 个、总量 512MB。少量真实有效的合成图片即可，不用空白文件伪造视频。
- `/me/runner` 成绩生涯只纳入已经发生的赛事；PB 还要求 road、offline。`GET /me` 的旧 career/decorateResults 口径与 runner 更简化，seed 应主动保持合理日期和类型，避免利用旧接口的宽松边界。

建议每个合成用户至少有 2–4 场未来计划（分散常规报名/抽签状态）与 2–3 场过去成绩；在一组用户间覆盖十种计划状态。赛事来自经确认的本地公共库；不篡改真实官方赛期、报名渠道或中签名单。用模拟赛事补充覆盖时，名称和说明均标明模拟。

### 4.2 私人跑史

```json
{
  "name": "【模拟】城市春季半程",
  "raceDate": "<执行日之前的有效日期>",
  "city": "杭州",
  "province": "浙江",
  "distance": "half",
  "kind": "road",
  "meet": "offline",
  "status": "finished",
  "timing": "net",
  "netTime": "01:48:30",
  "gunTime": "01:50:00",
  "bib": "SIM-001",
  "story": "【模拟】这是一份用于展示成长曲线的合成跑史。",
  "tags": ["坚持", "城市"]
}
```

- 创建 `POST /me/race-history` 返回 201；详情/修改 `GET/PATCH /me/race-history/:entryId`。ID 是 `exp:123` 或旧成绩桥接的 `result:<raceId>:<distance>`，使用 URL encode，不能当纯数字。
- distance 为 full/half/10k/5k/other；kind 为 road/trail/other；meet 为 offline/online；status 为 finished/dnf/dns；timing 为 net/gun/unknown。
- 跑史日期必须 ≤北京时间今天且是合法日历日期，最早 1900；名称 1–160 字，city/province ≤60，bib ≤40，story ≤1200。用时为完整 `HH:mm:ss` 或整数秒，≤72h；净计时不能长于枪声。
- finished+net 必须 netTime，finished+gun 必须 gunTime；unknown 可有 unknownTime，也可不填时间。dnf/dns **不得有任何完赛用时**。
- tags 仅允许 `突破/第一次/陪伴/归来/城市/坚持/享受比赛`，最多 7 个。`raceId` 可留空保存公共库以外的私人旧比赛；若填则需通过赛事关联校验。
- 成长 PB 只认 `finished + road + offline + 已发生 + 明确 net/gun 用时`，按 distance+timing 分组。用不同日期的同口径更快成绩生成提升信息；同日无法确认先后。unknown、线上赛、越野、DNF/DNS 作为正常记忆存在但不进入这套 PB。
- 旧 `/result` 会作为 timing=unknown 的 legacy 记录被跑史读取；若要纳入成长比较，应 PATCH 该 **已有 bridge entry** 确认计时口径，不能再次 POST 同赛事同日期同项目造成重复。
- `POST /me/race-history/import/preview {text}` 只返回待核对候选；`POST .../import/confirm {candidates:[...]}` 可保存 1–100 条，重复跳过，事务内校验，每人最多 2000 条。模拟“待确认”应保留客户端候选，不直接在服务器伪造一个不存在的 pending 跑史状态。
- 私人历史媒体是 `POST /me/race-history/:entryId/media?kind=photo`（证书/照片/奖牌/号码布/路线/衣服等独立白名单）；其新上传文件独立保存。旧 result bridge 跑史会继承对应 runner_media/旧证明文件的只读引用，不能重复上传同一份内容来假装两个独立收藏。只上传无真人、无真实号码布/证件信息的合成文件。

## 5. 运动记录、跑量 PK、排行与积分

```json
{
  "type": "run",
  "startedAt": "<北京时间 YYYY-MM-DDTHH:mm>",
  "distanceKm": 8,
  "duration": "00:48:00",
  "climb": 0,
  "city": "杭州"
}
```

- 创建 `POST /runs`，读 `GET /runs?month=YYYY-MM`，删除 `DELETE /runs/:rid`。type 仅 run/trail；里程 >0 且 ≤999，时间有效且年份 2000–2100，用时最长 48h，climb 为 0–20000 整数，city ≤20 字。虽然手填接口允许某些未来时间，本批只生成已经结束的运动。
- `PUT /runs/:rid` 是补类型/城市/爬升及导入字段的更正能力，不能假定它支持任意覆盖手填运动的开始时间、距离与用时；seed 先生成正确 payload。
- 原始记录 source 必须是实际走过的能力：手填创建为 manual；不要直接把 manual 改写为 coros/garmin，或伪造同步时间与外部 activity ID。
- 同一用户的记录时间区间不要重叠，尤其跨午夜及暂停后的实际结束时刻。重叠记录仍可出现在个人运动中，但不会计入团 PK。
- `GET /clubs/:id/mileage?range=today|week|month|year|all` 显示成员排行、分组排行、动态。只有当前成员、counted=1 的记录参与；同一个运动可以按各团规则独立计入多个团，不需为每个团重复创建运动。
- 自动计入需要：road/trail 支持类型；无重叠；越野爬升已知；**startedAt ≥ 原 member.joined_at**；日期 ≥ 规则 effectiveOn；manual/file 需 manualOk；跑步距离和配速达标；越野距离/爬升达标。
- 规则 `PUT /clubs/:id/mileage/rules` 仅团长：例如 `{effectiveOn:D,manualOk:true,runOn:true,runMin:1,runMax:60,paceFast:'3:00',paceSlow:'10:00',trailOn:true,trailMin:3,trailClimb:100,trailClimbAdd:true,flagFemale:50,flagMale:60,observe:true}`。effectiveOn 不能晚于今天，不能通过回拨成员日期“制造老会员”。当前规则变更也不应该抹去已有审定快照。
- 跑量分组 `POST /clubs/:id/mileage/groups {name:'【模拟】晨跑组',capacity:0,sort:1}`，成员指派 `PUT /clubs/:id/mileage/members/:uid {groupId}`。它和活动报名组是两种分组，不能串 ID。
- 质疑 `POST /clubs/:id/mileage/runs/:rid/challenge {reason:'【模拟】待核对运动时段'}`，reason 1–80 字且该条已计入。管理决定 `POST .../decision {counted:false}` 或 true。覆盖“正常计入/待核对/已排除/恢复计入”时留少数明确模拟记录，勿对真人记录发质疑。
- 周/月报 `GET /clubs/:id/mileage/report?kind=week|month&at=...`，导出 `GET .../export?kind=month&at=YYYY-MM&json=1`；today/week/month/year 使用当前北京窗口。本批应同时有当天、近一周、当月和过去月份记录，否则筛选后容易空。
- **里程不直接等于积分**。point_entries 来源包括活动达标、约跑结算、队内赛等业务；不要为填排行榜直接给真人加积分。日常签到 `POST /clubs/:id/checkins {note:'【模拟】今日到场'}` 只支持服务端当日，note ≤40 字，不会接受 day 参数。

建议：200 人各 8–16 条过去 8 周个人记录，其中为团 PK 另安排原 joined_at 之后、真实 now 之前的已结束记录；不同人可同时间，不同记录在同一人内不重叠。root 已选择当天 06:00 或最近两小时的有效区间，但必须逐人核对 joined_at。用不同距离/频次形成真实计算的排名与目标进度，不直接写 summary/rank。

## 6. 赛事集合、成绩召集与自由约跑

| 能力 | 写入契约 | 时间、权限与状态 |
|---|---|---|
| 同团赛事集合 | 用户 `PUT /me/races/:id {status}` | `/clubs/:id` 的 board 从成员 plans/results 汇总；不需要单独插一份“赛事报名名单”。不同合成用户的想跑、抽签、缴费、完赛状态可自然联动。 |
| 成绩召集 | staff `POST /clubs/:id/calls {raceId,title,raceDate,distances:['full','half'],deadline:'<D+7>T22:00',note:'【模拟】成绩统计'}` | raceId 可空，但需要 title 1–80、合法 raceDate 和至少一项标准距离，或 otherKm 1–100；note ≤100。默认截止为比赛日+7天22:00。关联系统赛事时 title/date/distances 可由赛事取得。 |
| 个人提交召集成绩 | `POST /clubs/:id/calls/:cid/rows {distance:'half',time:'01:45:00'}` | 成员填自己；staff 可额外传 userId 为该团成员代填。普通成员过 deadline 不能提交，staff 仍可补录。关联公共 raceId 时 syncCareer 同步旧 results/计划；不要再写第二套冲突的个人成绩。 |
| 开放/已截止召集 | staff `PUT /clubs/:id/calls/:cid {deadline,note}` | closed 是由截止时刻计算，不是可随意设 status 字段；可以准备开放和已截止两份模拟召集。创建接口不限制过去 deadline，但必须有合理过去比赛日期。 |
| 约跑开放/报名 | 成员 `POST /clubs/:id/meetups {date:D,place:'【模拟】河岸入口',note:'轻松恢复'}`；`POST .../:mid/join {}` | 只能约今天或未来；地点 1–40、说明 ≤100。取消报名 DELETE join 释放本人位置，void 后不可再报。未来场用于预报，今天场用于打卡。 |
| 约跑打卡 | `POST .../:mid/check {}`；staff 可带 userId | 本人当日可操作；管理员可以在过去7天窗口补记。先核对目标用户是成员；不得填未来出勤。 |
| 约跑照片与积分 | multipart `POST .../:mid/photos`；staff `POST .../:mid/resettle {}` 或 `/void {}` | 已过当天才结算；至少一张照片且达到最低3人档。同团同一天只选一场有效约跑计分，状态含 open、short、nophoto、held、scored、void。今天现场即使人数够、有合影，仍不能假装已经跨日结算。历史 setup 需明确标记新模拟对象。 |

未来活动/队内赛及其分组、签到、达标积分由 club 场景盘点负责。用户侧只使用其返回的活动/组别 ID，不从跑量分组或另一跑团复制 ID。普通成员不能发布管理类对象，跨团 IDs 不构成授权。

## 7. 共创建议、正常处理流与权限

- `POST /feedback {title:'【模拟】训练模板收藏入口',body:'【模拟】用于展示意见处理进度，不代表真实用户意见或平台承诺。',category:'feature',module:'clubs'}`。title 4–80 字、body 10–3000；category=feature/ui/bug/other，module=races/clubs/sport/profile/other。每用户北京时间每日最多10条、同时最多20条待审。
- `GET /feedback?category=all&sort=hot&page=1`；sort=hot/new/adopted。`?mine=1` 为本人；列表每页12。pending/withdrawn 对其他人不公开，详情仅作者/平台管理员可见。
- 正常状态转换：`pending → published → adopted → building → released`；pending/published 可 declined，作者可将 pending/published withdrawn。终态不能任意跳回。
- 平台管理员 `PATCH /admin/feedback/:id {status,reply,expectedVersion}`；expectedVersion 用当前 revision 防并发覆盖。published 之后转其他状态须公开答复；adopted 首次必须 rewardName 2–80 字，生成 unclaimed 奖励；不能改掉已承诺奖品。
- `PUT /feedback/:id/vote {voted:true}` 可由其他已登录合成用户投 published 建议，作者不能投自己，非 published 不能投。模拟撤票用 false，不制造重复票。
- `POST /feedback/:id/read {revision}` 只确认本人实际已展示的有效版本，可保留一些未读与一些已读；这只改站内 read_version，不需要通知外部人员。
- `POST /feedback/:id/withdraw {}` 展示撤回终态。截图仅 pending 可增删，最多图片/大小等按现有 API 校验；附件使用无真人的合成内容。
- 推荐状态各留至少一条，公开内容/管理员回复都明确为模拟流程。released 的文案不能声称某个真实功能已发布；例如写“【模拟】用于进度展示，此条不代表实际版本发布”。不要向真实用户的建议投票/改状态。
- 奖励收件信息是私密字段；可保留 unclaimed 展示领取入口。`PUT /feedback/:id/reward/claim` 要求 `consent:true`，且会写收件信息使用同意时间，故本次不调用它来冒充真实同意。不得填真实手机号/地址，也不凭假物流单号声称已寄出/已签收。若另行明确授权演示完整物流，仍须全字段清楚标为合成，不能触发真实邮寄或外部物流调用。

## 8. 权限、隐私与明确排除项

| 项目 | 本批处理方式 |
|---|---|
| 注册同意、政策接受记录 | 不调用 `/auth/register` 批量伪装这200人“本人接受”，不写 legal_acceptances；已有管理员创建账号即可填合成业务，不补虚假真实同意。 |
| 微信绑定、手机号、登录验证码 | 不伪造 openid、不调用真实微信 code exchange、不重置真人密码；不从生产验证码表取码冒充登录。CLI 测试的 `/api/session` 只在测试环境存在，生产不可用。 |
| 小程序隐私授权 | 是用户设备原生授权/回调，本地业务数据不能代替；不得设置假“已同意”状态证明真机授权通过。 |
| OCR 跑史识别 | `/me/race-history/recognize` 需本次真实版本同意，会记录 race-history-ocr acceptance；不为模拟填充调用或伪造同意。用手填/文本候选核对即可，无需冒充识别成功。 |
| 设备连接/同步 | `/me/devices/:provider/connect`、`/sync` 当前明确 unavailable；callback/webhook 也未接通。保持真实未接入状态，不写假 token、connected 状态、假厂商同步记录。设备文件导入属于独立能力，若演示用真实有效合成 GPX/TCX/FIT 且 source=file，不冒充厂商授权。 |
| 第三方官方成绩/照片/报名/支付 | 不伪造官方认证、实付记录、外部中签通知、成绩查验结果；不自动提交报名或支付，不抓取第三方敏感资料。成绩页仍标未核验。 |
| 权利申请/注销 | `POST /me/privacy-requests {type,detail}` 支持 access/copy/correct/delete/withdraw/close/other；状态 pending/processing/needs_info/completed/rejected，但生产模拟填充默认**不创建真实权利请求或注销申请**。页面可展示现有空态与表单，无需为了“每页有数据”假冒本人撤回同意或请求删号。 |
| 权利办理完成 | 后台 decision 只是办理记录，并不自动完成数据导出/更正/删除；不能插 completed 声称已履行真实请求。24h最多3条新申请、最多10活跃、同类型needs_info再提交会补充原单；这些仅作为后续隔离测试契约。 |
| 通知与真实社交 | 不发送微信订阅消息、短信、邮件、Slack等；不代表真实成员发言/点赞/投票。可由200合成账号在目标模拟内容内写站内联动，所有需要人工真实操作的能力保留入口。 |

## 9. 验收读侧与完成标准

1. manifest 精确200用户，目标10团；真实用户的 profile/plans/results/runs/race-history 计数与摘要保持不变。seed 新对象 ID、创建方式及历史日期 setup 单独记录。
2. 对代表账号读取 `/me`、`/me/runner`、`/runs?month=M`、`/me/race-history`、`/radar`、`/feedback?mine=1`，确认由真实业务表计算的图表/PB/排行/未读而非预览 mock。
3. 每团读取 mileage 五个range、board、calls及代表详情，覆盖开放/截止、普通成员/管理员、个人与同团汇总联动。组别 IDs 与外键匹配。
4. 所有生成媒体 URL 必须由鉴权接口返回可读取文件；无真人图像、敏感证件、失效占位URL。私密跑史和未公开建议不能被另一合成账号读取。
5. 可操作页面允许保留真实空态：原生隐私授权、设备未接入、真实支付/物流、官方核验等不靠伪造数据填满。

源码依据：`server/src/index.js`（个人资料/计划/旧成绩/签到）、`race-history.js`、`runner-center.js`、`mileage.js`、`radar.js`、`club-ops.js`、`club-gather.js`、`feedback.js`、`legal.js`、`wearable.js`、`history-ocr.js`。可复用验证契约见 `scripts/club-full-acceptance.cjs`、`server/test/race-history.test.js`、`runner-center.test.js`、`mileage-validation.test.js`、`feedback.test.js`；它们的临时数据库setup和法律同意夹具不能复制成生产真实同意。
