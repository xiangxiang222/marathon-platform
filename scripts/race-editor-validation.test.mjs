import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRaceEditor,validEditorDay,raceEditorNodeTime} from '../web/src/components/admin/race-editor.js';
const base={name:'节点顺序验收',raceDate:'2027-04-20',city:'杭州',distances:['half'],kinds:[],groups:'',nodeSource:'验收资料'};
const changed=row=>validateRaceEditor({...base,...row},{nodesTouched:true});
test('known registration nodes remain chronological when intermediate nodes are missing',()=>{
 assert.equal(changed({regStart:'2027-03-20',drawAt:'2027-03-10'}).field,'drawAt');
 assert.equal(changed({deadline:'2027-03-20',payDeadline:'2027-03-10'}).field,'payDeadline');
 assert.equal(changed({deadline:'2027-03-20',drawAt:'2027-03-19'}).field,'drawAt');
 assert.equal(changed({regStart:'2027-03-10',deadline:'2027-03-10',drawAt:'2027-03-10',payDeadline:'2027-03-10'}),null);
});
test('blank fields retain original dates in published and matched review validation',()=>{
 const originalNodes={deadline:'2027-03-20',drawAt:'2027-03-22'};
 assert.equal(validateRaceEditor({...base,regStart:'2027-03-21'},{nodesTouched:true,originalNodes}).field,'deadline');
 assert.equal(validateRaceEditor({...base,submissionId:1,province:'浙江',payDeadline:'2027-03-21'},{nodesTouched:true,originalNodes}).field,'payDeadline');
});
test('offline nodes respect race day while online events keep cross-day capability',()=>{
 assert.equal(changed({deadline:'2027-04-21'}).field,'deadline');
 assert.equal(changed({deadline:'2027-04-21',meet:'online'}),null);
});
test('real calendar validation and independent project dimensions reject no valid groups',()=>{
 assert.equal(validEditorDay('2026-02-30'),false);assert.equal(validEditorDay('2028-02-29'),true);
 assert.equal(changed({raceDate:'2026-02-30'}).field,'raceDate');
 for(const project of [{distances:['full'],kinds:[],groups:''},{distances:[],kinds:['fun'],groups:''},{distances:[],kinds:[],groups:'亲子体验组'}])assert.equal(validateRaceEditor({...base,...project}),null);
});
test('preview preserves existing exact times and uses calendar defaults for edited dates',()=>{
 const day='2027-03-10',start=day+'T10:00:00+08:00',deadline=day+'T18:00:00+08:00';
 assert.equal(raceEditorNodeTime('regStart',day,start),Date.parse(start));
 assert.equal(raceEditorNodeTime('deadline',day,deadline),Date.parse(deadline));
 assert.equal(raceEditorNodeTime('regStart','2027-03-11',start),Date.parse('2027-03-11T00:00:00+08:00'));
 assert.equal(raceEditorNodeTime('deadline','2027-03-11',deadline),Date.parse('2027-03-11T23:59:59+08:00'));
 assert.equal(raceEditorNodeTime('deadline',day),Date.parse(day+'T23:59:59+08:00'));
 assert.ok(Number.isNaN(raceEditorNodeTime('regStart','2027-02-30',start)));
});
