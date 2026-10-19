import React from 'react';
import '@testing-library/jest-dom';
import {render,screen,fireEvent,waitFor,within} from '@testing-library/react';
import Mailbox from './Mailbox';
import XPHistory from './XPHistory';
import CommunityFeed from './CommunityFeed';
import {AdminDashboard} from './AdminInsights';
import {socialRequest} from './socialAPI';
jest.mock('./socialAPI',()=>({socialRequest:jest.fn(),requestId:()=> 'request-decision-001',Author:({author})=><span>@{author?.login}</span>}));
const message={id:'notice',title:'Aviso oficial',message:'Mensagem completa para ler.',path:'#community',createdAt:'2026-10-18T12:00:00Z',unread:true,starred:false,archived:false};
beforeEach(()=>{jest.clearAllMocks();window.location.hash='mail';});
test('opening a mail message marks only that message read and supports favorites and archive',async()=>{
 socialRequest.mockImplementation((path,body)=>Promise.resolve(body?{ok:true}:{items:[message],unread:1,hasMore:false}));render(<Mailbox connected/>);fireEvent.click(await screen.findByRole('button',{name:/Aviso oficial/}));await screen.findByRole('article',{name:'Leitura da mensagem'});await waitFor(()=>expect(socialRequest).toHaveBeenCalledWith('inbox',{action:'set-read',id:'notice',value:false}));
 expect(within(screen.getByRole('article')).getByText(message.message)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Favoritar'}));await screen.findByRole('button',{name:'Remover favorita'});expect(socialRequest).toHaveBeenCalledWith('inbox',{action:'star',id:'notice',value:true});
 fireEvent.click(screen.getByRole('button',{name:'Arquivar'}));await screen.findByRole('button',{name:'Mover para entrada'});expect(socialRequest).toHaveBeenCalledWith('inbox',{action:'archive',id:'notice',value:true});
});
test('mail opened from the notification link loads its full content and errors remain visible',async()=>{
 window.location.hash='mail?message=notice';socialRequest.mockImplementation(path=>path.includes('id=notice')?Promise.reject(new Error('Mensagem indisponível.')):Promise.resolve({items:[]}));render(<Mailbox connected/>);expect(await screen.findByRole('alert')).toHaveTextContent('Mensagem indisponível.');
});
test('XP history distinguishes daily records and consolidated balances and filters the API',async()=>{
 socialRequest.mockResolvedValue({items:[{id:'daily',source:'commits',label:'3 commits elegíveis',xp:30,at:'2026-10-18T00:00:00Z',precision:'day',period:'2026-10'},{id:'old',source:'previous',label:'Saldo anterior consolidado',xp:500,at:'2026-09-01T00:00:00Z',precision:'month',period:'2026-09'}],periods:['2026-10','2026-09'],filteredXP:530,note:'Commits agrupados por dia UTC.'});render(<XPHistory/>);await screen.findByText('3 commits elegíveis');expect(screen.getByText(/mês consolidado/)).toBeTruthy();fireEvent.change(screen.getByLabelText('Origem do XP'),{target:{value:'missions'}});await waitFor(()=>expect(socialRequest).toHaveBeenCalledWith('xp-history?source=missions&limit=5'));
});
test('a post is deleted only after the options menu and explicit dialog confirmation',async()=>{
 window.location.hash='community';const post={id:'012345678901234567890123',text:'Minha publicação',own:true,author:{githubId:'1',login:'alice'},createdAt:'2026-10-18',commentCount:0};let deleted=false;socialRequest.mockImplementation((path,body)=>{if(body){deleted=true;return Promise.resolve({ok:true});}return Promise.resolve({posts:deleted?[]:[post]});});
 render(<CommunityFeed me={{connected:true}}/>);await screen.findByText('Minha publicação');expect(screen.queryByRole('button',{name:'Excluir publicação'})).toBeNull();fireEvent.click(screen.getByLabelText('Opções de publicação'));fireEvent.click(screen.getByLabelText('Excluir publicação'));expect(screen.getByRole('dialog')).toBeTruthy();expect(socialRequest.mock.calls.some(([,body])=>body)).toBe(false);fireEvent.click(screen.getByText('Cancelar'));expect(screen.queryByRole('dialog')).toBeNull();expect(screen.getByText('Minha publicação')).toBeTruthy();
 fireEvent.click(screen.getByLabelText('Opções de publicação'));fireEvent.click(screen.getByLabelText('Excluir publicação'));fireEvent.click(screen.getByText('Sim, excluir publicação'));await waitFor(()=>expect(screen.queryByText('Minha publicação')).toBeNull());expect(socialRequest).toHaveBeenCalledWith('feed',{action:'delete-post',postId:post.id});
});
test('administrative dashboard exposes decision metrics and date filters',async()=>{
 socialRequest.mockResolvedValue({totalUsers:30,active:12,returning:8,newUsers:4,pendingReports:2,waitingHelp:1,chart:[{day:'2026-10-18',active:12}],kinds:{post:5},rewards:[{source:'missions',count:2,xp:1000}],oldestHelp:[],note:'Atividade observada.'});render(<AdminDashboard/>);await screen.findByText('Usuários cadastrados');expect(screen.getByRole('img',{name:'Gráfico de usuários ativos por dia'})).toBeTruthy();fireEvent.change(screen.getByLabelText('Período dos indicadores'),{target:{value:'7'}});await waitFor(()=>expect(socialRequest).toHaveBeenCalledWith('admin?view=dashboard&days=7'));
});
