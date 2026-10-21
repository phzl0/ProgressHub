import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import CommunityProjects from './CommunityProjects';
import CommunityEvents from './CommunityEvents';
import CommunityTools from './CommunityTools';
import {FirstSteps} from './CommunityDiscovery';
import {viewFromHash,parentView} from './navigation';
const me={connected:true,githubId:'1',login:'alice'};
const response=data=>({ok:true,json:async()=>data});
afterEach(()=>{delete global.fetch;window.location.hash='';});
test('community expansion keeps its own deep links under the existing community navigation',()=>{
 for(const hash of ['#community/projects','#community/events','#community/interests','#community/projects/012345678901234567890123','#community/events/012345678901234567890123'])expect(viewFromHash(hash)).toBe('community');expect(parentView('community')).toBe('community');
});
test('project creation submits bounded fields and reusable goal import navigates to the project',async()=>{
 const id='012345678901234567890123';global.fetch=jest.fn(async(_,options)=>response(options?.method==='POST'?{id}:{items:[],hasMore:false}));render(<CommunityProjects me={me}/>);
 fireEvent.click(screen.getByRole('button',{name:'Novo projeto'}));fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Estoque'}});fireEvent.change(screen.getByLabelText('Objetivo'),{target:{value:'Aprender construindo'}});fireEvent.change(screen.getByLabelText('Repositório GitHub'),{target:{value:'https://github.com/alice/stock'}});fireEvent.change(screen.getByLabelText(/Etapas \(/),{target:{value:'Modelar dados\nTestar saldo'}});fireEvent.click(screen.getByLabelText('Backend'));fireEvent.click(screen.getByRole('button',{name:'Salvar projeto'}));
 await waitFor(()=>expect(window.location.hash).toBe(`#community/projects/${id}`));const body=JSON.parse(global.fetch.mock.calls.find(([,o])=>o?.method==='POST')[1].body);expect(body).toEqual(expect.objectContaining({action:'create',roles:['backend'],steps:['Modelar dados','Testar saldo']}));expect(body.xp).toBeUndefined();
});
test('first steps persist the XP acknowledgment and can be dismissed without changing XP',async()=>{
 let data={dismissed:false,steps:{github:true,goal:false,xp:false,interaction:false}};
 global.fetch=jest.fn(async(_,o)=>{if(o?.method==='POST'){const body=JSON.parse(o.body);data=body.step==='dismiss'?{...data,dismissed:true}:{...data,steps:{...data.steps,xp:true}};}return response(data);});render(<FirstSteps connected/>);
 fireEvent.click(await screen.findByRole('button',{name:'Como funciona o XP?'}));fireEvent.click(screen.getByRole('button',{name:'Entendi a pontuação'}));await screen.findByText('✓ Entender sua pontuação');fireEvent.click(screen.getByRole('button',{name:'Dispensar'}));expect(await screen.findByRole('button',{name:'Reabrir primeiros passos'})).toBeInTheDocument();
 expect(global.fetch.mock.calls.filter(([,o])=>o?.method==='POST').map(([,o])=>JSON.parse(o.body).step)).toEqual(['xp-read','dismiss']);
});
test('event publishing requires explicit confirmation and carries the displayed version',async()=>{
 const event={id:'012345678901234567890123',title:'API da comunidade',description:'Uma API simples',requirements:['README'],tags:[],startsAt:'2026-10-20',endsAt:'2026-10-30',phase:'draft',status:'draft',version:2,entries:[]};global.fetch=jest.fn(async(_,o)=>response(o?.method==='POST'?{id:event.id}:{items:[event]}));render(<CommunityEvents admin/>);
 fireEvent.click(await screen.findByRole('button',{name:'Publicar evento'}));expect(global.fetch.mock.calls.some(([,o])=>o?.method==='POST')).toBe(false);fireEvent.click(screen.getByRole('button',{name:'Confirmar',exact:true}));await waitFor(()=>expect(global.fetch.mock.calls.some(([,o])=>o?.method==='POST')).toBe(true));const body=JSON.parse(global.fetch.mock.calls.find(([,o])=>o?.method==='POST')[1].body);expect(body).toEqual(expect.objectContaining({action:'publish',version:2,id:event.id}));
});
test('staff tools show unanswered requests and existing schedule status',async()=>{
 global.fetch=jest.fn(async()=>response({metrics:{activeProjects:3,pendingEntries:2},unanswered:[{id:'012345678901234567890123',title:'Como testar uma API?',createdAt:'2026-10-20',category:'backend'}],schedules:[{id:'012345678901234567890124',title:'Encontro',message:'Venha construir',status:'sent',dueAt:'2026-10-20'}]}));render(<CommunityTools/>);expect(await screen.findByRole('link',{name:/Como testar uma API/})).toHaveAttribute('href','#community/help/012345678901234567890123');expect(screen.getByText(/Enviado/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Cancelar agendamento'})).not.toBeInTheDocument();
});
test('staff header refresh reloads engagement data without leaving its tab',async()=>{
 let activeProjects=3;
 global.fetch=jest.fn(async()=>response({metrics:{activeProjects},unanswered:[],schedules:[]}));
 const {rerender}=render(<CommunityTools revision={0}/>);
 expect(await screen.findByText('3',{exact:true})).toBeInTheDocument();
 activeProjects=4;rerender(<CommunityTools revision={1}/>);
 expect(await screen.findByText('4',{exact:true})).toBeInTheDocument();
});
