const test=require('node:test');const assert=require('node:assert/strict');
const {projectData}=require('./projects');const {eventData}=require('./community-growth');
const {search,tags}=require('./expansion-utils');
test('project and event inputs enforce bounded steps, repository URLs, tags and dates',()=>{
 const project={title:'Estoque',description:'Controlar produtos',repository:'https://github.com/alice/stock',steps:['Modelar produtos','Testar o saldo'],roles:['backend'],tags:['Java','java']};
 assert.deepEqual(projectData({...project,xp:10000}).tags,['java']);assert.equal(projectData(project).xp,undefined);
 assert.throws(()=>projectData({...project,roles:['administrator']}),{status:400});assert.throws(()=>projectData({...project,steps:Array(13).fill('Etapa')}),{status:400});assert.throws(()=>projectData({...project,repository:'https://example.com/test'}),{status:400});assert.throws(()=>tags(['<script>']),{status:400});
 const now=new Date('2026-10-20T12:00:00Z');const event={title:'API do mês',description:'Construa uma API documentada',requirements:['README','Testes'],startsAt:'2026-10-21',endsAt:'2026-10-30',tags:['node']};assert.equal(eventData(event,now).requirements.length,2);
 assert.throws(()=>eventData({...event,endsAt:'2026-10-20'},now),{status:400});assert.throws(()=>eventData({...event,endsAt:'2027-10-20'},now),{status:400});assert.equal(search('.*'),'\\.\\*');
});
