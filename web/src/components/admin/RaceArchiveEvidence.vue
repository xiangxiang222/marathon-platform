<template>
  <div class="evidence-editor">
    <details v-if="mode==='route' && edition"><summary>当届身份、状态与分项目规模</summary>
      <label>正式届名<input v-model="edition.editionName" /></label><label>届次标识<input v-model="edition.editionId" /></label>
      <label>举办状态<select v-model="edition.status"><option value="">尚未核实</option><option value="completed">已举办</option><option value="scheduled">已公告待举办</option><option value="postponed">延期</option><option value="cancelled">取消</option></select></label>
      <button type="button" @click="edition.events.push({project:'',distanceKm:'',plannedParticipants:'',fee:'',sourceIds:[]})">添加项目</button>
      <div v-for="(event,index) in edition.events" :key="index" class="evidence-row"><label v-for="f in eventFields" :key="f[0]">{{ f[1] }}<input v-model="event[f[0]]" /></label><label>来源标识<input :value="join(event.sourceIds)" @input="event.sourceIds=split($event.target.value)" /></label><button type="button" @click="edition.events.splice(index,1)">移除项目</button></div>
    </details>
    <details v-if="mode==='route' && edition"><summary>当届资料入口</summary>
      <p>填入当届原图发布页、成绩公示或参赛指南，并选择适用当届的资料来源。</p>
      <div v-for="(item,index) in edition.officialResources || []" :key="index">
        <label>类型 <select v-model="item.category"><option value="route-map">赛道图</option><option value="shirt">参赛服</option><option value="medal">奖牌</option><option value="results">成绩公示</option><option value="guide">参赛指南</option></select></label>
        <label>标题 <input v-model="item.title" /></label><label>链接 <input v-model="item.url" type="url" /></label>
        <label>资料来源 <select v-model="item.sourceIds" multiple><option v-for="source in archive.sources" :key="source.id" :value="source.id">{{ source.title || source.id }}</option></select></label>
        <button type="button" @click="edition.officialResources.splice(index,1)">移除入口</button>
      </div>
      <button type="button" @click="(edition.officialResources ||= []).push({category:'route-map',title:'',url:'',sourceIds:[]})">添加资料入口</button>
    </details>
    <details v-if="mode==='entry' && edition"><summary>该届实用参赛建议</summary>
      <button type="button" @click="edition.logistics.tips.push({title:'',body:'',kind:'editorial-advice',sourceIds:[]})">添加建议</button>
      <div v-for="(tip,index) in edition.logistics.tips" :key="index" class="evidence-row"><label>标题<input v-model="tip.title" /></label><label>内容<textarea v-model="tip.body" rows="3" /></label><label>性质<select v-model="tip.kind"><option value="editorial-advice">编辑建议</option><option value="official">官方要求</option><option value="">未分类</option></select></label><label>来源标识<input :value="join(tip.sourceIds)" @input="tip.sourceIds=split($event.target.value)" /></label><button type="button" @click="edition.logistics.tips.splice(index,1)">移除建议</button></div>
    </details>
    <template v-if="mode==='basic'">
      <details><summary>赛事定位、报名特点与历史</summary>
        <label>赛事定位<textarea v-model="archive.profile.positioning" rows="3" /></label>
        <label>报名特点（变化信息注明年份）<textarea v-model="archive.profile.entryNotes" rows="4" /></label>
        <div class="row-heading"><h4>历史节点</h4><button type="button" @click="archive.history.push({date:'',title:'',body:'',sourceIds:[]})">添加历史节点</button></div>
        <div v-for="(item,index) in archive.history" :key="index" class="evidence-row">
          <label>时间<input v-model="item.date" placeholder="YYYY、YYYY-MM 或 YYYY-MM-DD" /></label>
          <label>标题<input v-model="item.title" /></label><label>说明<textarea v-model="item.body" rows="3" /></label>
          <label>来源标识<input :value="join(item.sourceIds)" @input="item.sourceIds=split($event.target.value)" /></label>
          <button type="button" @click="archive.history.splice(index,1)">移除节点</button>
        </div>
      </details>
    </template>
    <details v-if="mode==='results'" open><summary>赛会纪录（与单届冠军分开维护）</summary>
      <p>只有权威材料确认的赛会纪录才录入。注明创造届次、截至哪届核验；不能从已收录冠军中推算。</p>
      <button type="button" @click="archive.records.push({category:'赛会纪录',project:'马拉松',group:'',athlete:'',time:'',timing:'',editionId:'',achievedAt:'',verifiedThroughEditionId:'',verifiedAt:'',sourceIds:[]})">添加纪录</button>
      <div v-for="(item,index) in archive.records" :key="index" class="evidence-row">
        <label v-for="f in recordFields" :key="f[0]">{{ f[1] }}<input v-model="item[f[0]]" /></label>
        <label>来源标识<input :value="join(item.sourceIds)" @input="item.sourceIds=split($event.target.value)" /></label>
        <button type="button" @click="archive.records.splice(index,1)">移除纪录</button>
      </div>
    </details>
    <template v-if="mode==='evidence'">
      <p>来源标识供各栏引用；适用年与核验日期分别记录。保存会检查失效引用。</p>
      <button type="button" @click="archive.sources.push({id:'source-'+Date.now(),title:'',url:'',publisher:'',publishedAt:'',applicableYears:[],accessedAt:'',verifiedAt:''})">添加来源</button>
      <details v-for="(source,index) in archive.sources" :key="index"><summary>{{ source.title || '新来源' }} · {{ source.id }}</summary>
        <label v-for="f in sourceFields" :key="f[0]">{{ f[1] }}<input v-model="source[f[0]]" /></label>
        <label>适用年份<input :value="join(source.applicableYears)" @input="source.applicableYears=split($event.target.value)" placeholder="2024、2025" /></label>
        <button type="button" @click="archive.sources.splice(index,1)">移除来源</button>
      </details>
      <details><summary>各栏引用关系</summary>
        <label v-for="(target,index) in citationTargets" :key="index">{{ target.label }}<input :value="join(target.object[target.key])" @input="target.object[target.key]=split($event.target.value)" placeholder="多个来源标识用顿号分开" /></label>
      </details>
      <details><summary>收录说明与缺口</summary>
        <button type="button" @click="archive.gaps.push({fields:[],reason:''})">添加缺口</button>
        <div v-for="(gap,index) in archive.gaps" :key="index" class="evidence-row"><label>字段<input :value="join(gap.fields)" @input="gap.fields=split($event.target.value)" /></label><label>说明<textarea v-model="gap.reason" rows="3" /></label><button type="button" @click="archive.gaps.splice(index,1)">移除</button></div>
      </details>
      <details><summary>图片来源与使用依据</summary>
        <p>逐张填写权利人、原文来源及使用依据，新增图片仍须在保存时确认可展示。</p>
        <div v-for="(item,index) in imageTargets" :key="index" class="evidence-row"><h4>{{ item.label }}</h4><label v-for="f in mediaFields" :key="f[0]">{{ f[1] }}<input v-model="item.rights[f[0]]" /></label></div>
        <p v-if="!imageTargets.length">当前没有已上传图片。</p>
      </details>
    </template>
  </div>
</template>
<script setup>
import { computed } from 'vue';
const props=defineProps({archive:{type:Object,required:true},mode:String,edition:Object});
const eventFields=[['project','项目名称'],['distanceKm','距离（公里）'],['plannedParticipants','计划人数'],['fee','当届费用及适用人群']];
const recordFields=[['category','纪录类别'],['project','项目'],['group','组别'],['athlete','运动员'],['time','成绩 HH:MM:SS'],['timing','计时口径'],['editionId','创造届次标识'],['achievedAt','创造日期或年份'],['verifiedThroughEditionId','截至哪届核验'],['verifiedAt','核验日期 YYYY-MM-DD']];
const sourceFields=[['id','来源标识'],['title','原文标题'],['url','原文链接'],['publisher','发布主体'],['publishedAt','发布日期（未知留空）'],['accessedAt','访问日期'],['verifiedAt','核验日期']];
const mediaFields=[['title','作品名称'],['holder','作者或权利人'],['sourceUrl','原始来源链接'],['licenseUrl','许可证明链接'],['usageTerms','使用依据与条件'],['attribution','署名文字']];
const join=value=>(value||[]).join('、'),split=value=>value.split(/[,，、\s]+/).filter(Boolean);
const citationTargets=computed(()=>{
 const a=props.archive,targets=[];
 const add=(label,object,key='sourceIds')=>{if(object)targets.push({label,object,key})};
 add('简介',a,'introSourceIds');add('创办年份',a.profile,'foundingYearSourceIds');add('赛事定位',a.profile,'positioningSourceIds');add('报名特点',a.profile,'entrySourceIds');
 for(const [i,item] of a.highlights.entries())add('看点 '+(i+1),item);
 for(const e of a.editions){add(e.year+' 日期',e,'dateSourceIds');for(const [key,label] of [['route','赛道'],['registration','报名'],['participation','统计']])add(e.year+' '+label,e[key]);for(const [key,obj] of Object.entries(e.logistics||{}))if(!Array.isArray(obj))add(e.year+' '+key,obj);for(const item of [...(e.results||[]),...(e.gear||[]),...(e.logistics?.tips||[])])add(e.year+' '+(item.group||item.title||item.category),item);}
 return targets;
});
const imageTargets=computed(()=>{
 const result=[];const add=(label,item,key)=>{if(!item?.[key])return;item.mediaEvidence??={...item.mediaRights};result.push({label,rights:item.mediaEvidence})};const many=(label,list)=>{for(const [i,item] of (list||[]).entries())add(label+' '+(i+1),item,'url')};
 add('封面',props.archive.hero,'imageUrl');
 for(const e of props.archive.editions){add(e.year+' 路线图',e.route,'mapUrl');many(e.year+' 路线',e.route?.images);for(const g of e.gear||[]){add(e.year+' '+g.category,g,'imageUrl');many(e.year+' '+g.category,g.images)}}
 for(const album of props.archive.photoAlbums||[])many(album.title,album.media);
 for(const key of ['stories','updates','news'])for(const item of props.archive[key]||[])many(item.title,item.images);
 return result;
});
</script>
<style scoped>
.evidence-editor{font-size:14px;line-height:1.8}.evidence-editor details{border-top:1px solid #eee;margin:16px 0;padding:12px 0}.evidence-editor summary{min-height:44px;cursor:pointer;color:#555;overflow-wrap:anywhere}.evidence-editor label{display:flex;flex-direction:column;gap:8px;margin:14px 0;color:#777;font-size:12px}.evidence-editor p{color:#777;font-size:13px;margin:12px 0}.evidence-editor input,.evidence-editor textarea{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #ddd;border-radius:6px;padding:10px;font:inherit;font-size:14px;color:#1a1a1a}.evidence-editor button{min-height:44px;border:1px solid #eee;background:white;color:#ff1838;padding:8px 12px;border-radius:6px;cursor:pointer}.evidence-row{padding:16px 0;border-bottom:1px solid #eee}.row-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}
</style>
