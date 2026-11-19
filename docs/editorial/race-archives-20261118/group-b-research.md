# B组赛事档案采集与核验记录

核验日期：2026-11-18。负责太原、长沙、成都、大连、兰州、深圳、杭州，共7场。

## 方法与口径

- 先尝试网页浏览工具，工具服务返回404，改用Python/PowerShell直读政府、体育主管部门、赛事官网与世界田联原文；检索引擎仅作线索，不将搜索摘要写成事实。
- 中国田协各赛事逐一在线POST searchById，核对名称、举办日期、项目、认证等级和主办单位；源记录内保留请求方法、官方ID和观察值。目录标注为2026年A类，未将A擅写为A1。
- 世界田联读取公开日历原始页面的__NEXT_DATA__事件数据，按赛事名、城市与日期匹配。太原/兰州/深圳/杭州Gold，成都Label，大连Elite；长沙未检出本届主赛事条目，等级留空。不能把未检出解释为没有认证。
- 兰州官网页面为动态载入，读取其页面自身调用的公开新闻detail.json正文；source.evidence保存接口地址。图片形式的竞赛规程未自动OCR填数。
- 正式赛名、城市和主办单位共同用于身份核验。深圳主赛事不混入南山半马、深圳宝安马拉松；成都不混入都江堰世遗马拉松；杭州不混入西湖半马和建德马拉松。
- 赛前计划人数、新闻报道规模、实际起跑人数、完赛人数分开记录。不用名额/报名总数推算中签率；未取得官方精确分母的中签率留空。
- 成绩未标明计时类型时timing留空。历史当届破纪录与现行纪录分别标注；2024历史纪录的verifiedThroughEditionId仍为2024，不暗示保持至2026。
- 所有source均有publisher、适用年份、核验日期；发表日期只记原文明确值，无法确认则留空。正式名、状态与年份均以中国北京时间为准。
- 图片及地图未取得转载许可，imageUrl与mapUrl为空；不下载或公开无许可图片。

## 站点异常及取舍

- 深圳旧猜测域名www.sz-marathon.com及长沙旧域名www.changsha-marathon.com现返回无关内容，已排除。长沙使用读到主办/运营主体的www.marathonchangsha.com；深圳采用政府官方专题和其规程明确的入口。
- 部分深圳政府HTTPS连接出现TLS BAD_ECPOINT；相同官方域名HTTP原文可读，因此来源如实保留HTTP。部分成都旧官网或政府页面无法访问，选用省体育局、省地方志办公室转载和权威媒体发布会报道补充。
- 成都创办年份以北京日报报业集团明确写明2017年的回顾为补充，并交叉读取2017国家体育总局筹备原文；未仅凭记忆填写。
- 兰州赛事简介show_time为2021年，正文含2021未举办等后续更新迹象，因此只采用其中明确年份的历史事实，不将九届等累计数字当作2026最新值。
- 深圳2024历史稿将进入全马时代表述为首次设置全程，存在措辞歧义；仅采用进入全马时代，不宣称2023首次引入全马。
- 杭州2025早期报名计划36000人含欢乐跑，2026政府回顾32000人是后续规模口径；分别保存，不改成实际起跑数。尚缺最终项目调整正式通知。

## 太原马拉松

- 已归档年度：2026, 2025, 2024。
- 世界田联：金标（2026）；中国田协：A类（2026）。
- 状态：2026=completed；2025=completed；2024=completed。
- 缺口：
  - records.男子, editions.results.timing：未取得完整历届纪录表及成绩计时类型；2024男子破纪录作为历史节点，不补写为截至2026年的现行纪录。
  - editions.2024.registration, editions.2026.registration, editions.logistics.collection：2024、2026报名规程和领物指南尚未取得可核验原文；2025费用亦未由本轮来源确认。
  - images, editions.route.mapUrl：未取得官方图片、路线图的明确转载许可，暂不展示图片；可通过资料来源查看官方原图。

资料来源：

- `ty-preview-2025` [赛事规模4万人 2025太原马拉松赛今日开启报名](https://www.taiyuan.gov.cn/tytt/20250623/30227473.html)；太原市人民政府／太原新闻网；发布日期2025-06-23；适用年份 2010, 2013, 2019, 2025；核验 2026-11-18。
- `ty-report-2025` [2025年太原马拉松赛起跑](https://tyj.shanxi.gov.cn/syxw/jrtt/sjtt/202509/t20250922_9962932.shtml)；山西省体育局／省体育发展中心；发布日期2025-09-21；适用年份 2025；核验 2026-11-18。
- `ty-report-2024` [2024太原马拉松赛举行](https://www.taiyuan.gov.cn/tytt/20240923/30162297.html)；太原市人民政府／太原新闻网；发布日期2024-09-23；适用年份 2024；核验 2026-11-18。
- `ty-route-2024` [2024太原马拉松全新线路图发布](https://www.shanxi.gov.cn/ywdt/zwlb/gsdt/202407/t20240729_9618418.shtml)；山西省人民政府／山西日报；发布日期2024-07-29；适用年份 2024；核验 2026-11-18。
- `ty-preview-2026` [太原马拉松赛“定档”9月27日](https://www.taiyuan.gov.cn/zwyw/20260708/30308189.html)；太原市人民政府；发布日期2026-07-08；适用年份 2010, 2026；核验 2026-11-18。
- `ty-report-2026` [2026太原马拉松赛刷新多项赛会纪录](https://tyj.shanxi.gov.cn/syxw/jrtt/sjtt/202609/t20260928_10228226.shtml)；山西省体育局／省体育发展中心；发布日期2026-09-28；适用年份 2026；核验 2026-11-18。
- `taiyuan-caa-2026` [中国马拉松：2026太原马拉松](https://www.runchina.org.cn/#/race/v/detail/1000447000)；中国田径协会；发布日期未载明；适用年份 2026；核验 2026-11-18。
- `taiyuan-wa-2026` [World Athletics Label Road Races 2026 Calendar](https://worldathletics.org/competitions/world-athletics-label-road-races/calendar-results)；世界田联；发布日期未载明；适用年份 2026；核验 2026-11-18。

## 长沙马拉松

- 已归档年度：2026, 2025, 2024。
- 世界田联：待核实（未填写）；中国田协：A类（2026）。
- 状态：2026=completed；2025=archived；2024=completed。
- 缺口：
  - records, editions.results：未取得可核对的官方完整成绩和历届赛会纪录表；不以新闻中未附成绩的冠军姓名补造纪录。
  - worldAthletics：本轮世界田联2026日历未检出长沙主赛事条目，未确认当届等级；历史“双金”宣传不代替当届核验。
  - editions.2024.registration, editions.2025.results, editions.2026.registration.fee：2024报名须知、2025赛后原文及2026费用等细则尚待补充。
  - images, editions.route.mapUrl：未取得官方图片、路线图的明确转载许可，暂不展示图片；可通过资料来源查看官方原图。

资料来源：

- `cs-history-2024` [长沙马拉松激发城市发展新活力](https://www.sport.gov.cn/n20001280/n20001265/n20067664/c28195692/content.html)；国家体育总局／中国体育报；发布日期2024-10-23；适用年份 2015, 2017, 2023, 2024；核验 2026-11-18。
- `cs-report-2024` [十年长马跑出新天地](https://www.changsha.gov.cn/bmrl/bmrlwhzx/202410/t20241021_11626898.html)；长沙市人民政府／长沙晚报；发布日期2024-10-21；适用年份 2015, 2024；核验 2026-11-18。
- `cs-preview-2025` [长沙银行·2025长沙马拉松新闻发布会](https://www.changsha.gov.cn/jdhy/xwfbh/zxbd/202507/t20250730_11935305.html)；长沙市人民政府／长沙市体育局；发布日期2025-07-30；适用年份 2024, 2025；核验 2026-11-18。
- `cs-preview-2026` [总报名人数达192052人，2026长沙马拉松11月15日开跑](https://www.changsha.gov.cn/bmrl/bmrlbsfw/202610/t20261019_12591874.html)；长沙市人民政府／长沙晚报；发布日期2026-10-19；适用年份 2026；核验 2026-11-18。
- `cs-collection-2026` [为期三天，2026长沙马拉松领物工作12日开启](https://www.changsha.gov.cn/bmrl/bmrlbsfw/202611/t20261110_12612883.html)；长沙市人民政府／长沙晚报；发布日期2026-11-10；适用年份 2026；核验 2026-11-18。
- `cs-report-2026` [一江秋色，满城热爱｜2026长沙马拉松鸣枪开跑](http://csty.changsha.gov.cn/zfxxgk/zwyw/202611/t20261117_12618443.html)；长沙市体育局／长沙马拉松；发布日期2026-11-17；适用年份 2026；核验 2026-11-18。
- `cs-official` [长沙马拉松官方网站](https://www.marathonchangsha.com/)；长沙马拉松组委会；发布日期未载明；适用年份 2026；核验 2026-11-18。
- `changsha-caa-2026` [中国马拉松：2026长沙马拉松](https://www.runchina.org.cn/#/race/v/detail/1000418247)；中国田径协会；发布日期未载明；适用年份 2026；核验 2026-11-18。

## 成都马拉松

- 已归档年度：2026, 2025, 2024。
- 世界田联：标牌（2026）；中国田协：A类（2026）。
- 状态：2026=completed；2025=completed；2024=completed。
- 缺口：
  - records.现行纪录, editions.2025.results：2024纪录仅确认到该届；2025冠军报道未给出成绩，故不能断言2024成绩仍为截至2026年的现行纪录。
  - editions.2024.registration, editions.2025.registration, editions.2026.registration.fee, editions.logistics.collection：尚未取得三届完整规程和领物公告，缺失字段留空。
  - images, editions.route.mapUrl：未取得官方图片、路线图的明确转载许可，暂不展示图片；可通过资料来源查看官方原图。

资料来源：

- `cd-history-2017` [爱聚成都 成都国际马拉松9月“耿直”开跑](https://www.sport.gov.cn/n20001280/n20745751/n20767239/c21696757/content.html)；国家体育总局／中国体育报；发布日期2017-08-17；适用年份 2017；核验 2026-11-18。
- `cd-founding` [成都马拉松组委会公布处罚决定](https://news.bjd.com.cn/2026/10/28/12009287.shtml)；北京日报报业集团／长安街知事；发布日期2026-10-28；适用年份 2017, 2026；核验 2026-11-18。
- `cd-report-2024` [2024成都马拉松冠军出炉！男子全马刷新赛会纪录](http://scdfz.sc.gov.cn/gzdt/zyhy/content_161580)；四川省地方志工作办公室／四川在线；发布日期2024-10-27；适用年份 2024；核验 2026-11-18。
- `cd-report-2025` [乐跑公园城市，畅游金秋成马！2025成都马拉松鸣枪开跑](https://tyj.sc.gov.cn/sctyj/qzty/2025/10/26/f20a14b8cdaf43c981a40211bd25cf81.shtml)；四川省体育局；发布日期2025-10-26；适用年份 2025；核验 2026-11-18。
- `cd-preview-2026` [今起报名！2026年成都马拉松定档10月25日](https://scnews.newssc.org/system/20260610/001618616.html)；四川新闻网／川观新闻；发布日期2026-06-10；适用年份 2026；核验 2026-11-18。
- `cd-report-2026` [刚刚，2026成马冠军诞生！](https://focus.scol.com.cn/zgsz/202610/83345377.html)；四川在线／成都发布；发布日期2026-10-25；适用年份 2026；核验 2026-11-18。
- `chengdu-caa-2026` [中国马拉松：2026成都马拉松](https://www.runchina.org.cn/#/race/v/detail/1000419219)；中国田径协会；发布日期未载明；适用年份 2026；核验 2026-11-18。
- `chengdu-wa-2026` [World Athletics Label Road Races 2026 Calendar](https://worldathletics.org/competitions/world-athletics-label-road-races/calendar-results)；世界田联；发布日期未载明；适用年份 2026；核验 2026-11-18。

## 大连马拉松

- 已归档年度：2026, 2025, 2024。
- 世界田联：精英标牌（2026）；中国田协：A类（2026）。
- 状态：2026=completed；2025=completed；2024=archived。
- 缺口：
  - records, editions.2024.results, editions.2026.results：未获得官方历届纪录表及2024、2026完整成绩原文，赛会纪录暂不填。
  - editions.registration, editions.route.finish, editions.logistics.collection.requirements：三届报名规程、精确终点及领物身份要求尚待原始公告补充；不将往届规则沿用到2026。
  - images, editions.route.mapUrl：未取得官方图片、路线图的明确转载许可，暂不展示图片；可通过资料来源查看官方原图。

资料来源：

- `dl-preview-2024` [大连马拉松赛10月20日开跑](https://www.ln.gov.cn/web/ywdt/zymtkln/2024101409121848634/index.shtml)；辽宁省人民政府／新华网；发布日期2024-10-14；适用年份 2024；核验 2026-11-18。
- `dl-report-2025` [第35届大连马拉松赛昨日起跑](https://www.dldj.gov.cn/art/2025/5/12/art_9266_2439060.html)；大连党建网／大连日报；发布日期2025-05-12；适用年份 1987, 2025；核验 2026-11-18。
- `dl-preview-2026` [2026大连马拉松赛4月26日鸣枪起跑](https://www.dl.gov.cn/art/2026/4/16/art_1438_2508615.html)；大连市人民政府／大连日报；发布日期2026-04-16；适用年份 2026；核验 2026-11-18。
- `dl-report-2026` [解码辽宁｜“老牌”马拉松如何跑好人气经济“新赛道”](https://www.ln.gov.cn/web/ywdt/zymtkln/2026042809122866254/index.shtml)；辽宁省人民政府／新华网；发布日期2026-04-28；适用年份 1987, 2026；核验 2026-11-18。
- `dalian-caa-2026` [中国马拉松：2026大连马拉松](https://www.runchina.org.cn/#/race/v/detail/1000388027)；中国田径协会；发布日期未载明；适用年份 2026；核验 2026-11-18。
- `dalian-wa-2026` [World Athletics Label Road Races 2026 Calendar](https://worldathletics.org/competitions/world-athletics-label-road-races/calendar-results)；世界田联；发布日期未载明；适用年份 2026；核验 2026-11-18。

## 兰州马拉松

- 已归档年度：2026, 2025, 2024。
- 世界田联：金标（2026）；中国田协：A类（2026）。
- 状态：2026=completed；2025=completed；2024=completed。
- 缺口：
  - editions.2026.registration, editions.2026.route.finish, editions.2026.participation：2026竞赛规程和路线以图片为主，本轮未人工逐页核读，费用、名额及完整道路不依赖OCR臆填。
  - records.现行公开组纪录, editions.2025.results, editions.2024.registration：尚未取得完整历届纪录及2025成绩原始表，公开组现行纪录暂缺；2024纪录只确认至2024届。
  - images, editions.route.mapUrl：未取得官方图片、路线图的明确转载许可，暂不展示图片；可通过资料来源查看官方原图。

资料来源：

- `lz-history` [赛事简介](https://www.lzmarathon.com/news/detailNews.html?id=705)；兰州马拉松组委会；发布日期2021-06-25；适用年份 2011, 2017, 2019, 2020, 2021；核验 2026-11-18。
- `lz-report-2024` [“兰州银行杯”2024兰州马拉松今日鸣枪开跑](https://www.lzmarathon.com/news/detailNews.html?id=2936)；兰州马拉松组委会；发布日期2024-05-26；适用年份 2024；核验 2026-11-18。
- `lz-registration-2025` [报名启动｜“兰州银行杯”2025兰州马拉松报名今日10:00正式开启](https://www.lzmarathon.com/news/detailNews.html?id=3579)；兰州马拉松组委会；发布日期2025-03-06；适用年份 2025；核验 2026-11-18。
- `lz-applicants-2025` [31万+！2025兰马预报名人数创历史新高！](https://www.lzmarathon.com/news/detailNews.html?id=3607)；兰州马拉松组委会；发布日期2025-03-16；适用年份 2025；核验 2026-11-18。
- `lz-report-2025` [2025兰州马拉松正式开跑，奇瑞风云A9L携手跑者共赴热爱征程](https://www.lzmarathon.com/news/detailNews.html?id=3927)；兰州马拉松组委会官网；发布日期2025-05-26；适用年份 2025；核验 2026-11-18。
- `lz-report-2026` [2026兰州马拉松今日开赛](https://www.lzmarathon.com/news/detailNews.html?id=5135)；兰州马拉松组委会；发布日期2026-05-24；适用年份 2026；核验 2026-11-18。
- `lz-transport-2026` [交通保障｜2026兰马开赛在即，这份出行指南请收好！](https://www.lzmarathon.com/news/detailNews.html?id=5131)；兰州马拉松组委会；发布日期2026-05-21；适用年份 2026；核验 2026-11-18。
- `lz-regulations-2026` [2026「兰州银行」兰州马拉松竞赛规程](https://www.lzmarathon.com/news/detailNews.html?id=4776)；兰州马拉松组委会；发布日期2026-02-25；适用年份 2026；核验 2026-11-18。
- `lanzhou-caa-2026` [中国马拉松：2026兰州马拉松](https://www.runchina.org.cn/#/race/v/detail/1000396024)；中国田径协会；发布日期未载明；适用年份 2026；核验 2026-11-18。
- `lanzhou-wa-2026` [World Athletics Label Road Races 2026 Calendar](https://worldathletics.org/competitions/world-athletics-label-road-races/calendar-results)；世界田联；发布日期未载明；适用年份 2026；核验 2026-11-18。

## 深圳马拉松

- 已归档年度：2026, 2025, 2024。
- 世界田联：金标（2026）；中国田协：A类（2026）。
- 状态：2026=scheduled；2025=archived；2024=completed。
- 缺口：
  - records：2025规程列破纪录奖励门槛，但未附纪录运动员、创造日期与完整纪录表，不据奖励门槛补造赛会纪录。
  - editions.2026.registration, editions.2026.route, editions.2026.participation：2026届尚未举办，且本轮未取得当届完整规程；不复制2025日期以外的安排。
  - editions.2025.results, editions.2025.logistics.collection, editions.2024.registration：2025赛后成绩与最终领物公告、2024报名规程仍待补齐。
  - images, editions.route.mapUrl：未取得官方图片、路线图的明确转载许可，暂不展示图片；可通过资料来源查看官方原图。

资料来源：

- `sz-history-2024` [深圳：马拉松蝉联世界田联金标赛事](https://tyj.gd.gov.cn/qmjs_qmjs/content/post_4380840.html)；广东省体育局／深圳晚报；发布日期2024-02-23；适用年份 2013, 2023, 2024；核验 2026-11-18。
- `sz-report-2024` [2024深圳马拉松顺利完赛 感受南山城区与美丽自然相互交融](http://www.sz.gov.cn/cn/xxgk/zfxxgj/gqdt/content/post_11836143.html)；深圳市人民政府／南山区；发布日期2024-12-02；适用年份 2024；核验 2026-11-18。
- `sz-preview-2025` [2025深马12月7日开跑 “新深马”全面升级报名即将启动](http://www.sz.gov.cn/cn/xxgk/zfxxgj/zwdt/content/post_12414440.html)；深圳市人民政府／深圳特区报；发布日期2025-09-28；适用年份 2024, 2025；核验 2026-11-18。
- `sz-regulations-2025` [2025深圳马拉松竞赛规程](http://wtl.sz.gov.cn/ztzl_78228/tszl/2025marathon/content/post_12489345.html)；深圳市文化广电旅游体育局／深圳马拉松组委会；发布日期2025-11-13；适用年份 2025；核验 2026-11-18。
- `sz-official-2025` [2025深圳马拉松政府专题](http://wtl.sz.gov.cn/ztzl_78228/tszl/2025marathon/index.html)；深圳市文化广电旅游体育局；发布日期未载明；适用年份 2025；核验 2026-11-18。
- `shenzhen-caa-2026` [中国马拉松：2026深圳马拉松](https://www.runchina.org.cn/#/race/v/detail/1000454026)；中国田径协会；发布日期未载明；适用年份 2026；核验 2026-11-18。
- `shenzhen-wa-2026` [World Athletics Label Road Races 2026 Calendar](https://worldathletics.org/competitions/world-athletics-label-road-races/calendar-results)；世界田联；发布日期未载明；适用年份 2026；核验 2026-11-18。

## 杭州马拉松

- 已归档年度：2026, 2025, 2024。
- 世界田联：金标（2026）；中国田协：A类（2026）。
- 状态：2026=completed；2025=archived；2024=completed。
- 缺口：
  - records, editions.2024.results, editions.2025.results：2024报道称多人打破赛会纪录，但未给出完整运动员和成绩；缺少2025及完整历届纪录表，当前纪录与缺失成绩留空。
  - editions.2025.events.欢乐跑, editions.2025.participation.finalPlan：8月公告含欢乐跑，2026政府回顾称2025规模3.2万人；最终项目调整公告未核得原文，保留早期计划与回顾口径，待补正式通知。
  - editions.2026.registration.fee, editions.2026.registration.closes, editions.logistics.collection：2026收费、最终报名截止和各届领物指南尚待完整公告。
  - images, editions.route.mapUrl：未取得官方图片、路线图的明确转载许可，暂不展示图片；可通过资料来源查看官方原图。

资料来源：

- `hz-report-2024` [37岁的杭州马拉松跑向更美赛道](https://www.sport.gov.cn/n20001280/n20001265/n20067664/c28232150/content.html)；国家体育总局／中国体育报；发布日期2024-11-06；适用年份 1987, 2011, 2014, 2024；核验 2026-11-18。
- `hz-registration-2025` [吉利汽车·2025杭州马拉松报名须知来啦！直通、金点子……你想知道的都在这里！](https://tyj.zj.gov.cn/art/2025/8/26/art_1229557709_59142871.html)；浙江省体育局；发布日期2025-08-26；适用年份 2025；核验 2026-11-18。
- `hz-preview-2025` [2025杭马11月2日鸣枪开跑](https://www.hangzhou.gov.cn/col/col812270/art/2025/art_3d79af22005d4fb4a2c2db0b264de061.html)；杭州市人民政府／杭州日报；发布日期2025-10-29；适用年份 2025；核验 2026-11-18。
- `hz-registration-2026` [2026年杭马报名开启](https://www.hangzhou.gov.cn/col/col812270/art/2026/art_fca1930c042d4efdb72cc9ded8d8ee89.html)；杭州市人民政府／杭州日报；发布日期2026-06-24；适用年份 1987, 2025, 2026；核验 2026-11-18。
- `hz-report-2026` [一路嚞桂，燃动金秋｜2026吉利汽车杭州马拉松圆满收官](https://tyj.zj.gov.cn/col/col1347253/art/2026/art_ac03fd6fd03a4e998ec8e6c6aa963d10.html)；浙江省体育局；发布日期2026-11-04；适用年份 2026；核验 2026-11-18。
- `hz-route-2026` [新线路的杭马，更多元的体验](https://tyj.zj.gov.cn/col/col1347213/art/2026/art_626dce84ad834392800c63ebfa624f31.html)；浙江省体育局；发布日期2026-11-02；适用年份 2026；核验 2026-11-18。
- `hangzhou-caa-2026` [中国马拉松：2026杭州马拉松](https://www.runchina.org.cn/#/race/v/detail/1000454064)；中国田径协会；发布日期未载明；适用年份 2026；核验 2026-11-18。
- `hangzhou-wa-2026` [World Athletics Label Road Races 2026 Calendar](https://worldathletics.org/competitions/world-athletics-label-road-races/calendar-results)；世界田联；发布日期未载明；适用年份 2026；核验 2026-11-18。

## 本组数据检查

- 7份档案JSON与目录JSON成功解析；sourceId引用闭合；每届保留route/registration/participation/results/gear/logistics/notes结构。
- 2026深圳仍未举办，状态scheduled，成绩与实际起跑/完赛人数为空；部分仅取得赛前资料的历史届次标archived，并写明证据覆盖范围。
- 发布前仍需由集成端运行全项目档案校验、后端测试和前端构建；本组仅负责上述数据文件。
