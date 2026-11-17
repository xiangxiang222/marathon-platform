# 中国马拉松人物专题：名单与证据审计

资料截止：2026-11-17。活动窗口：2024-11-17—2026-11-17（含首尾日）。状态：`official_pb_with_documented_activity_scope`。

## 采用口径

本项目旧库 `shared/elite-athletes.json` 是2026赛季最佳男女各100人的年度榜，快照日为2026-11-12，原`rank/seasonRank`不能当作历史PB排名。此次人物专题独立选篇，按世界田联认可的合法全程马拉松个人最好成绩排序，赛季最佳另列。当前PB前20选篇门槛为男子2:10:06、女子2:28:16。

沿用项目既有CHN代表队登记范围。世界田联的`countryCode=CHN`及历史榜Nat列证明的是体育登记归属；这不是护照查验，也不能自动覆盖另以HKG、MAC、TPE注册的选手。中文同名者使用WAID与出生日期区分，尤其两位王佳丽、两位刘敏不得合并。

现役筛选按用户确认：近24个月在任一正式田径或路跑项目有实际参赛记录，且本轮公开来源未发现退出竞技的公告。离开专业队、转向商业或大众赛事中的竞技组，不自动排除。DNF、DQ可证明实际参赛；DNS不能。PB本身仍须为认可的合法完赛成绩。任秀娟依据2024-12-15中国田协10公里正式记录纳入；这不等于她近24个月跑过全马。

同PB者具有相同PB名次，例如男子桑吉东知与蒋发坤均并列第14。若20篇边界遇到同PB，选篇按PB达成日期较早者优先；同日按WAID稳定排序。该规则只固定选篇人数，不表示战术或竞技实力高下。本轮最终女子边界没有同PB并列。

## 官方全历史榜与抓取陷阱

- [男子CHN全马历史PB榜](https://worldathletics.org/records/all-time-toplists/road-running/marathon/outdoor/men/senior?regionType=countries&region=chn&bestResultsOnly=true&maxResultsByCountry=all&firstDay=1899-12-31&lastDay=2026-11-17&page=1&topListView=all)：2026-11-17获取，首100名已完整解析至`evidence/men-all-time-table.json`，覆盖本轮选篇门槛。
- [女子CHN全马历史PB榜](https://worldathletics.org/records/all-time-toplists/road-running/marathon/outdoor/women/senior?regionType=countries&region=chn&bestResultsOnly=true&maxResultsByCountry=all&firstDay=1899-12-31&lastDay=2026-11-17&page=1&topListView=all)：2026-11-17获取，首100名已完整解析至`evidence/women-all-time-table.json`，覆盖本轮选篇门槛。

不能使用`/records/toplists/.../all-time`冒充全历史榜：实测该路径仍给出2026年度成绩（如何杰2:08:15），而正确`/records/all-time-toplists/...`为历史PB2:06:57。解析还必须支持`/athletes/athlete=ID`和`/athletes/.../slug-ID`两种人物链接，否则会遗漏王佳浩、李大林、洪跃等人。

部分人物页返回HTTP202空正文，不代表此人不存在或没有参赛。依次使用`pr-of-china`、`athlete=ID`、`china`路径及带查询参数的官方入口复查。原始NEXT_DATA中的`competitor._id`和`basicData.countryCode`与目标比对；成功证据保留在`evidence/`或`sources/`。

## 40人研究名单

下表PB由本轮2026-11-17全历史榜核对。近24月参赛有些来自本轮人物页，有些沿用11-12已抓取的官方人物页记录；每条证据都保留自己的checkedAt，不能把旧快照标成11-17重新抓取。张新艳另有2025厦门赛事报道交叉核验。

|组别|PB名次|姓名|WAID|PB|PB日期|近24月参赛示例|
|---|---:|---|---|---|---|---|
|男子|1|丰配友|14913520|2:05:58|2026-03-01|[2026-09-26 20th Asian Games, Municipal Mizuho Stadium, Nagoya 2:12:13](https://worldathletics.org/athletes/pr-of-china/peiyou-feng-14913520)|
|男子|2|何杰|14795227|2:06:57|2024-03-24|[2026-09-27 BMW Berlin Marathon, Berlin 2:16:16](https://worldathletics.org/athletes/pr-of-china/jie-he-14795227)|
|男子|3|杨绍辉|14523268|2:07:09|2023-12-03|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:10:42](https://worldathletics.org/athletes/pr-of-china/shaohui-yang-14523268)|
|男子|4|毛金虎|14913625|2:07:36|2026-03-22|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:10:39](https://worldathletics.org/athletes/pr-of-china/jinhu-mao-14913625)|
|男子|5|吴向东|14430085|2:07:55|2026-09-27|[2026-09-27 BMW Berlin Marathon, Berlin 2:07:55](https://worldathletics.org/athletes/pr-of-china/xiangdong-wu-14430085)|
|男子|6|陈天宇|14694073|2:08:11|2023-10-29|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:09:09](https://worldathletics.org/athletes/pr-of-china/tianyu-chen-14694073)|
|男子|7|董国建|14172732|2:08:12|2024-02-25|[2026-10-18 Xi'an Marathon, Xi'an 2:13:29](https://worldathletics.org/athletes/pr-of-china/guojian-dong-14172732)|
|男子|8|索朗才仁|14694176|2:08:20|2026-03-22|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:14:03](https://worldathletics.org/athletes/pr-of-china/cairen-suolang-14694176)|
|男子|9|王佳浩|15111707|2:08:21|2026-09-27|[2026-09-27 BMW Berlin Marathon, Berlin 2:08:21](https://worldathletics.org/athletes/china/jiahao-wang-15111707)|
|男子|10|李大林|15182213|2:08:30|2026-10-18|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:08:30](https://worldathletics.org/athletes/china/dalin-li-15182213)|
|男子|11|贾俄仁加|14821206|2:08:32|2024-09-29|[2026-10-31 Chinese Athletics Association 10Km Elite Series Wuxi Liangxi, Wuxi 30:08](https://worldathletics.org/athletes/pr-of-china/erenjia-jia-14821206)|
|男子|12|杨克古|14754426|2:08:48|2026-03-22|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:14:08](https://worldathletics.org/athletes/pr-of-china/kegu-yang-14754426)|
|男子|13|洪跃|15058848|2:08:50|2026-03-22|[2026-09-13 Harbin Marathon, Harbin 2:12:46](https://worldathletics.org/athletes/pr-of-china/yue-hong-15058848)|
|男子|14|桑吉东知|14714456|2:09:29|2024-03-24|[2026-10-18 Xi'an Marathon, Xi'an 2:14:03](https://worldathletics.org/athletes/pr-of-china/jidongzhi-sang-14714456)|
|男子|14|蒋发坤|14839796|2:09:29|2026-10-18|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:09:29](https://worldathletics.org/athletes/pr-of-china/fakun-jiang-14839796)|
|男子|16|高鹏|14750614|2:09:34|2023-10-29|[2026-11-01 Hangzhou Marathon, Hangzhou 2:13:19](https://worldathletics.org/athletes/pr-of-china/peng-gao-14750614)|
|男子|17|扎西次仁|15136844|2:09:43|2026-03-22|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:11:13](https://worldathletics.org/athletes/pr-of-china/ciren-zhaxi-15136844)|
|男子|18|谢运策|15073011|2:09:47|2026-10-18|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:09:47](https://worldathletics.org/athletes/pr-of-china/yunce-xie-15073011)|
|男子|19|彭建华|14750662|2:09:57|2019-12-08|[2026-09-13 Harbin Marathon, Harbin 2:34:16](https://worldathletics.org/athletes/pr-of-china/jianhua-peng-14750662)|
|男子|20|苏飞|14811588|2:10:06|2026-03-15|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:15:10](https://worldathletics.org/athletes/pr-of-china/fei-su-14811588)|
|女子|1|张德顺|14693572|2:20:53|2025-03-02|[2026-09-27 BMW Berlin Marathon, Berlin 2:23:37](https://worldathletics.org/athletes/pr-of-china/deshun-zhang-14693572)|
|女子|2|魏亚楠|14264959|2:23:12|2007-03-18|[2026-09-13 Harbin Marathon, Harbin 2:46:33](https://worldathletics.org/athletes/pr-of-china/yanan-wei-14264959)|
|女子|3|白雪|14266777|2:23:27|2008-01-05|[2025-08-31 Harbin Marathon, Harbin 2:54:21](https://worldathletics.org/athletes/pr-of-china/xue-bai-14266777)|
|女子|4|次仁措姆|14663881|2:23:48|2026-10-18|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:23:48](https://worldathletics.org/athletes/pr-of-china/cuomu-ciren-14663881)|
|女子|5|朱晓琳|14264209|2:23:57|2002-10-13|[2025-11-02 Beijing Marathon, Beijing 2:42:13](https://worldathletics.org/athletes/athlete=14264209)|
|女子|6|任秀娟|14265419|2:24:22|2001-10-14|[2024-12-15 Chinese Athletics Association 10Km Elite Series Yangzhou, Yangzhou 36:30](https://worldathletics.org/athletes/athlete=14265419)|
|女子|7|路颖|14752711|2:24:24|2026-10-18|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:24:24](https://worldathletics.org/athletes/pr-of-china/ying-lu-14752711)|
|女子|8|李美珍|14702479|2:25:06|2026-03-22|[2026-10-31 Chinese Athletics Association 10Km Elite Series Wuxi Liangxi, Wuxi 33:37](https://worldathletics.org/athletes/china/meizhen-li-14702479)|
|女子|9|夏雨雨|14714417|2:25:45|2024-03-10|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:27:33](https://worldathletics.org/athletes/pr-of-china/yuyu-xia-14714417)|
|女子|10|吴冰|14811652|2:26:01|2025-03-30|[2026-09-26 20th Asian Games, Municipal Mizuho Stadium, Nagoya 2:32:09](https://worldathletics.org/athletes/china/bing-wu-14811652)|
|女子|11|李芷萱|14376349|2:26:15|2019-03-10|[2026-10-25 MDC FINAL supported by On, Komazawa Olympic Park Athletic Stadium, Tokyo 16:20.47](https://worldathletics.org/athletes/pr-of-china/zhixuan-li-14376349)|
|女子|12|丁常琴|14334270|2:26:29|2026-03-22|[2026-03-22 Wuxi Marathon, Wuxi 2:26:29](https://worldathletics.org/athletes/pr-of-china/changqin-ding-14334270)|
|女子|13|白丽|14702490|2:26:33|2023-03-19|[2026-10-18 Xi'an Marathon, Xi'an 2:46:36](https://worldathletics.org/athletes/china/li-bai-14702490)|
|女子|14|张新艳|14488655|2:26:56|2022-04-17|[2026-01-11 C&D Xiamen Marathon, Xiamen 2:47:48](https://worldathletics.org/athletes/china/xinyan-zhang-14488655)|
|女子|15|李丹|14607905|2:26:59|2020-11-29|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:37:38](https://worldathletics.org/athletes/china/dan-li-14607905)|
|女子|16|徐冰洁|14913613|2:27:11|2025-03-23|[2026-10-18 Xi'an Marathon, Xi'an 2:33:35](https://worldathletics.org/athletes/china/bingjie-xu-14913613)|
|女子|17|马秀珍|14977274|2:27:12|2026-03-22|[2026-08-16 Chinese Championships, Sports Center, Quzhou 34:23.69](https://worldathletics.org/athletes/china/xiuzhen-ma-14977274)|
|女子|18|朱卿|15123187|2:27:26|2026-10-18|[2026-10-18 Bank of China Beijing Marathon, Beijing 2:27:26](https://worldathletics.org/athletes/china/qing-zhu-15123187)|
|女子|19|孙腊梅|14265279|2:27:55|2012-11-25|[2024-12-22 Shantou Marathon, Shantou 3:03:45](https://worldathletics.org/athletes/china/lamei-sun-14265279)|
|女子|20|刘敏|14908056|2:28:16|2025-03-23|[2026-11-01 ChangZhou West Taihu Lake Half Marathon, Changzhou 1:13:42](https://worldathletics.org/athletes/china/min-liu-14908056)|

## 比选篇边界更快、但未入选的历史PB候选

逐人检查官方人物页的activeYears及默认最后参赛年赛事记录。表中“未发现窗口内记录”是对已检查官方资料的限定结论，不能写成“已经退役”，也不是穷尽所有中国地方赛事。外部新证据出现后，应重新运行筛选。

|组别|官方姓名/WAID|PB|官方最后记录年|最近收录的正式记录|排除依据|
|---|---|---|---|---|---|
|男子|[Longyun REN / 14171607](https://worldathletics.org/athletes/pr-of-china/longyun-ren-14171607)|2:08:15|2013|2013-09-10 10,000 Metres 29:03.83|未见活动窗口内正式参赛记录|
|男子|[Han GANG / 14172632](https://worldathletics.org/athletes/pr-of-china/han-gang-14172632)|2:08:56|2013|2013-05-31 5000 Metres 15:04.05|未见活动窗口内正式参赛记录|
|男子|[Guangyu HU / 14172461](https://worldathletics.org/athletes/pr-of-china/guangyu-hu-14172461)|2:09:18|2001|2001-10-14 Marathon 2:12:30|未见活动窗口内正式参赛记录|
|女子|[Yingjie SUN / 14265236](https://worldathletics.org/athletes/athlete=14265236)|2:19:39|2009|2009-05-21 10,000 Metres 36:07.45|未见活动窗口内正式参赛记录|
|女子|[Chunxiu ZHOU / 14264260](https://worldathletics.org/athletes/athlete=14264260)|2:19:51|2013|2013-03-23 Half Marathon 1:15:19|未见活动窗口内正式参赛记录|
|女子|[Yingying ZHANG / 14264358](https://worldathletics.org/athletes/pr-of-china/yingying-zhang-14264358)|2:22:38|2017|2017-04-29 Marathon  - |未见活动窗口内正式参赛记录|
|女子|[Jiali WANG / 14265125](https://worldathletics.org/athletes/pr-of-china/jiali-wang-14265125)|2:22:41|2017|2017-06-27 10,000 Metres 33:29.29|未见活动窗口内正式参赛记录|
|女子|[Shujing ZHANG / 14264390](https://worldathletics.org/athletes/athlete=14264390)|2:23:17|2017|2017-04-09 Marathon 2:57:36|未见活动窗口内正式参赛记录|
|女子|[Min LIU / 14265772](https://worldathletics.org/athletes/athlete=14265772)|2:23:37|2019|2019-01-06 Marathon 2:52:44|未见活动窗口内正式参赛记录|
|女子|[Junxia WANG / 14265107](https://worldathletics.org/athletes/athlete=14265107)|2:24:07|1996|1996-08-02 10,000 Metres 31:02.58|未见活动窗口内正式参赛记录|
|女子|[Yunxia QU / 14265434](https://worldathletics.org/athletes/athlete=14265434)|2:24:32|1997|1997-10-23 5000 Metres 15:26.89|未见活动窗口内正式参赛记录|
|女子|[Yuanyuan HU / 14266300](https://worldathletics.org/athletes/pr-of-china/yuanyuan-hu-14266300)|2:24:39|2002|2002-10-13 Marathon 2:24:39|未见活动窗口内正式参赛记录|
|女子|[Yanyan DAI / 14266579](https://worldathletics.org/athletes/athlete=14266579)|2:24:41|2009|2009-10-21 5000 Metres 16:24.78|未见活动窗口内正式参赛记录|
|女子|[Linli ZHANG / 14344470](https://worldathletics.org/athletes/athlete=14344470)|2:24:42|1994|1994-10-31 Marathon 2:29:42|未见活动窗口内正式参赛记录|
|女子|[Li-rong ZHANG / 14432524](https://worldathletics.org/athletes/athlete=14432524)|2:24:52|1994|1994-10-31 Marathon 2:29:45|未见活动窗口内正式参赛记录|
|女子|[Weiwei SUN / 14265257](https://worldathletics.org/athletes/athlete=14265257)|2:25:15|2018|2018-11-18 Marathon 2:46:51|未见活动窗口内正式参赛记录|
|女子|[Huandi ZHONG / 14352900](https://worldathletics.org/athletes/athlete=14352900)|2:25:36|1994|1994-10-09 Marathon 2:29:32|未见活动窗口内正式参赛记录|
|女子|[Liyan MA / 14343355](https://worldathletics.org/athletes/athlete=14343355)|2:25:46|1993|1993-10-31 Marathon 2:30:44|未见活动窗口内正式参赛记录|
|女子|[Li JIN / 14266168](https://worldathletics.org/athletes/athlete=14266168)|2:25:48|2004|2004-03-27 Marathon 2:46:45|未见活动窗口内正式参赛记录|
|女子|[Xueqin WANG / 14265022](https://worldathletics.org/athletes/athlete=14265022)|2:25:53|2018|2018-11-11 Marathon DNF|未见活动窗口内正式参赛记录|
|女子|[Guixia ZHENG / 14264303](https://worldathletics.org/athletes/athlete=14264303)|2:25:55|2003|2003-03-09 Half Marathon 1:10:21|未见活动窗口内正式参赛记录|
|女子|[Ruihuan LIU / 14445727](https://worldathletics.org/athletes/china/ruihuan-liu-14445727)|2:26:13|2016|2016-05-14 10,000 Metres 32:15.40|未见活动窗口内正式参赛记录|
|女子|[Yanfang WANG / 14265017](https://worldathletics.org/athletes/athlete=14265017)|2:26:36|2000|2000-01-01 Marathon 2:45:04|未见活动窗口内正式参赛记录|
|女子|[Lihua XIE / 14347139](https://worldathletics.org/athletes/athlete=14347139)|2:26:38|1993|1993-04-04 Marathon 2:26:38|未见活动窗口内正式参赛记录|
|女子|[Jinhong PAN / 14265513](https://worldathletics.org/athletes/athlete=14265513)|2:26:39|2000|2000-04-09 Marathon 2:41:47|未见活动窗口内正式参赛记录|
|女子|[Jie WEI / 14483323](https://worldathletics.org/athletes/athlete=14483323)|2:26:41|2012|2012-11-25 Marathon 2:37:08|未见活动窗口内正式参赛记录|
|女子|[Rong CHEN / 14266668](https://worldathletics.org/athletes/pr-of-china/rong-chen-14266668)|2:26:49|2013|2013-09-11 10,000 Metres 36:41.20|未见活动窗口内正式参赛记录|
|女子|[Jianfen WANG / 14265122](https://worldathletics.org/athletes/athlete=14265122)|2:26:58|1998|1998-04-11 Marathon 2:33:20|未见活动窗口内正式参赛记录|
|女子|[Helan LI / 14266046](https://worldathletics.org/athletes/china/helan-li-14266046)|2:26:59|2005|2005-10-17 10,000 Metres 33:19.35|未见活动窗口内正式参赛记录|
|女子|[Youfeng ZHAO / 14347009](https://worldathletics.org/athletes/china/youfeng-zhao-14347009)|2:27:06|1990|1990-09-30 Marathon 2:35:19|未见活动窗口内正式参赛记录|
|女子|[Dongmei AI / 14266790](https://worldathletics.org/athletes/china/dongmei-ai-14266790)|2:27:30|2001|2001-05-13 5000 Metres 16:10.0h|未见活动窗口内正式参赛记录|
|女子|[Yinli HE / 14264580](https://worldathletics.org/athletes/pr-of-china/yinli-he-14264580)|2:27:35|2021|2021-04-11 Marathon 2:36:42|未见活动窗口内正式参赛记录|
|女子|[Cui LU / 14265700](https://worldathletics.org/athletes/china/cui-lu-14265700)|2:27:37|2006|2006-06-29 5000 Metres 17:06.50|未见活动窗口内正式参赛记录|
|女子|[Chaofeng JIA / 14266236](https://worldathletics.org/athletes/pr-of-china/chaofeng-jia-14266236)|2:27:40|2015|2015-09-23 5000 Metres 16:46.01|未见活动窗口内正式参赛记录|
|女子|[YuanYuan YIN / 14388887](https://worldathletics.org/athletes/china/yuanyuan-yin-14388887)|2:27:55|2017|2017-04-29 Marathon 2:57:24|未见活动窗口内正式参赛记录|
|女子|[Jingbo LU / 14265694](https://worldathletics.org/athletes/china/jingbo-lu-14265694)|2:28:00|2002|2002-03-03 3000 Metres Short Track 9:37.80|未见活动窗口内正式参赛记录|
|女子|[Yanmei DONG / 14266534](https://worldathletics.org/athletes/china/yanmei-dong-14266534)|2:28:09|2002|2002-06-10 10,000 Metres 32:58.28|未见活动窗口内正式参赛记录|
|女子|[Tian MEI / 14265602](https://worldathletics.org/athletes/china/tian-mei-14265602)|2:28:15|2007|2007-08-04 1500 Metres 4:21.92|未见活动窗口内正式参赛记录|

## 关键更正与剩余边界

- 魏亚楠：PB2:23:12，2026哈尔滨2:46:33，按相同规则纳入。不能因年龄、当下成绩慢于巅峰或离开专业队而剔除。
- 白雪：PB2:23:27，2025-08-31哈尔滨2:54:21第19，按正式参赛口径纳入；不因此称其仍在国家队或恢复到PB水平。
- 朱晓琳：PB2:23:57，2025石家庄2:38:12、2025北京2:42:13，纳入。
- 任秀娟：PB2:24:22，2024-12-15扬州中国田协10公里精英赛36:30第6，纳入；活动依据为10公里而非全马，必须公开说明。
- 孙腊梅：PB2:27:55，2024-12-22汕头3:03:45。官方记录remark为UNC、得分0，表明该次成绩有认证限制；只用于实际参赛证据，绝不把该次UNC成绩当作合规PB。
- 刘瑞环：历史PB2:26:13，但官方最后记录在2016年；CCTV搜索出现拆词假命中，所读候选报道未包含她的姓名，不作为参赛证据。
- 原2026赛季前20中的张水华、张珊珊等具有现役证据，但PB慢于本轮最终选篇门槛，不能为迁就旧名单保留。

退役检索记录在`retirement-searches.json`，为逐人央视索引查询，存在拆词、同名和返回空页；不能把结果数量当作证明。2019北京青年报报道使用“已退役”描述李芷萱等转向职业公路跑者，说明必须区分专业队身份和退出竞技。该文已保存`evidence/retirement-context.json`。本轮未获取对40名入选者“退出全部竞技”的明确公告，但没有统一公开登记能证明一个负面事实；状态只描述本轮所核公开材料。

截至本审计，所有入选者有明确活动窗口证据，所有PB来自官方认可全历史榜。仍须保留的资料边界是：世界田联并非覆盖全部地方正式赛事；部分活动记录沿用11-12快照；国籍依据是CHN体育登记；未宣告退出竞技的判断限于本轮检索。专题应写明这些条件，而不标注实时综合实力排名。

正文、事实卡与资料清单应分开保存。`men-secondary.json`的十篇各有独立中心问题，成绩、时间、名次映射至官方事实项，平均配速和差值是作者换算，不被写成比赛分段。缺乏成长或训练采访时留白，不从成绩反推伤病、家境与训练量。
