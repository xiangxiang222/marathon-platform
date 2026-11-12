const fs=require('node:fs');
const path=require('node:path');
const {getText,parsePerson}=require('./content-sync.cjs');
const {biographyFromRecords,buildAthleteArticle}=require('./athlete-biography.cjs');
const ROOT=path.resolve(__dirname,'..');
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');fs.renameSync(temp,file);}
async function enrich(options={}){
  const dir=options.dir||process.env.CONTENT_DATA_DIR||path.join(ROOT,'server/data/content'),snapshot=path.join(ROOT,'shared/elite-athletes.json'),runtime=path.join(dir,'elite-athletes.json');
  const file=fs.existsSync(runtime)?runtime:snapshot,data=JSON.parse(fs.readFileSync(file,'utf8')),cacheDir=path.join(dir,'athlete-biography-cache'),asOf=data.asOf;
  fs.mkdirSync(cacheDir,{recursive:true});const report={asOf,startedAt:new Date().toISOString(),enriched:0,cached:0,failed:[],profiles:[]};
  let next=0;
  await Promise.all(Array.from({length:4},async()=>{for(;;){const index=next++;if(index>=data.athletes.length||options.limit&&index>=options.limit)return;const profile=data.athletes[index],id=String(Number(profile.worldAthleticsId)),cache=path.join(cacheDir,id+'.json');let competitor;
    try{if(fs.existsSync(cache)){const raw=JSON.parse(fs.readFileSync(cache,'utf8'));competitor=raw.competitor||raw;report.cached++;}else{await new Promise(r=>setTimeout(r,200));const source=profile.sources.find(s=>s.url.includes('worldathletics.org/athletes/'))?.url;if(!source)throw new Error('No official athlete source');competitor=parsePerson(await getText(source),id);write(cache,{checkedAt:asOf,competitor});}
      if(Number(competitor._id)!==Number(id))throw new Error('Identity mismatch');const enrichment=biographyFromRecords(profile,competitor,{asOf,year:data.seasonYear});Object.assign(profile,enrichment);report.enriched++;report.profiles.push({id:profile.id,name:profile.name,...enrichment.biographyCoverage});
    }catch(e){report.failed.push({id:profile.id,name:profile.name,error:e.message});const fallback=biographyFromRecords(profile,null,{asOf,year:data.seasonYear});if(!profile.biographySections?.length)Object.assign(profile,fallback);else profile.article=buildAthleteArticle(profile,{asOf,year:data.seasonYear});}
  }}));
  const articleLengths=data.athletes.map(a=>(a.article?.lead?.length||0)+(a.article?.body?.length||0)).sort((a,b)=>a-b);
  data.biographyCoverage={enriched:report.enriched,failed:report.failed.length,withSections:data.athletes.filter(a=>a.biographySections?.length).length,withDetailedProfiles:data.athletes.filter(a=>a.biographyCoverage?.characters>=300).length,withArticles:data.athletes.filter(a=>a.article?.body).length,articleCharacters:articleLengths.reduce((n,v)=>n+v,0),articleMedianCharacters:articleLengths[Math.floor(articleLengths.length/2)]||0};
  write(runtime,data);write(snapshot,data);report.finishedAt=new Date().toISOString();report.coverage=data.biographyCoverage;write(path.join(dir,'athlete-biography-status.json'),report);
  console.log(JSON.stringify({enriched:report.enriched,cached:report.cached,failed:report.failed.length,coverage:report.coverage,characters:report.profiles.map(p=>p.characters).sort((a,b)=>a-b).filter((_,i,a)=>[0,Math.floor(a.length/2),a.length-1].includes(i))},null,2));return report;
}
if(require.main===module)enrich({limit:Number(process.argv.find(a=>a.startsWith('--limit='))?.slice(8))||0}).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={enrich};
