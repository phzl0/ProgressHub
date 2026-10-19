import React,{useState} from 'react';
import {render,screen,fireEvent,waitFor,act,within,cleanup} from '@testing-library/react';
import '@testing-library/jest-dom';
import XPHistory from './XPHistory';
import {ChatDockProvider,useChatDock} from './ChatDock';
import CommunitySocial from './CommunitySocial';
import {socialRequest} from './socialAPI';
jest.mock('./socialAPI',()=>({...jest.requireActual('./socialAPI'),socialRequest:jest.fn()}));
jest.mock('./CommunityFeed',()=>()=> <p>Publicações da comunidade</p>);
const result=data=>({ok:true,json:async()=>data});
const message=(id='000000000000000000000001',text='Mensagem da comunidade')=>({id,text,createdAt:'2026-10-18T22:00:00Z',author:{login:'bob',githubId:'2'},own:false});
const row=i=>({id:`row-${i}`,source:'commits',label:`Crédito ${i}`,xp:10,at:'2026-10-18T00:00:00Z',period:'2026-10',precision:'day',description:'Detalhe disponível sob demanda.'});
beforeEach(()=>{window.location.hash='progress';socialRequest.mockReset();global.fetch=jest.fn(async()=>result({messages:[message()],hasOlder:false}));});
afterEach(()=>{cleanup();jest.useRealTimers();jest.restoreAllMocks();delete global.fetch;});
test('XP defaults to five table rows, pages without appending, and restores the previous page from cache',async()=>{
 socialRequest.mockImplementation(path=>Promise.resolve({items:Array.from({length:5},(_,i)=>row(i+(path.includes('before=')?5:0))),periods:['2026-10'],filteredXP:100,hasMore:!path.includes('before='),nextCursor:'next-page',note:'Commits agrupados por dia UTC.'}));
 render(<XPHistory/>);const table=await screen.findByRole('table');await screen.findByText('Crédito 0');expect(within(table).getAllByRole('row')).toHaveLength(6);expect(screen.getByLabelText('Lançamentos por página')).toHaveValue('5');
 fireEvent.click(screen.getByLabelText('Próxima página do extrato'));await screen.findByText('Crédito 5');expect(screen.queryByText('Crédito 0')).toBeNull();expect(within(table).getAllByRole('row')).toHaveLength(6);
 const calls=socialRequest.mock.calls.length;fireEvent.click(screen.getByLabelText('Página anterior do extrato'));expect(screen.getByText('Crédito 0')).toBeInTheDocument();expect(socialRequest.mock.calls).toHaveLength(calls);
 fireEvent.change(screen.getByLabelText('Lançamentos por página'),{target:{value:'20'}});await waitFor(()=>expect(socialRequest).toHaveBeenCalledWith('xp-history?source=all&limit=20'));expect(screen.getByLabelText('Página anterior do extrato')).toBeDisabled();
 fireEvent.click(await screen.findByLabelText('Ver detalhes: Crédito 0'));expect(screen.getByRole('dialog',{name:'Detalhes do crédito'})).toHaveTextContent('Detalhe disponível sob demanda.');fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();
});
test('a failed next page keeps current rows and can be retried without losing the page',async()=>{
 let attempts=0;socialRequest.mockImplementation(path=>{if(path.includes('before=')){if(!attempts++)return Promise.reject(new Error('Falha temporária'));return Promise.resolve({items:[row(6)],hasMore:false});}return Promise.resolve({items:[row(1)],hasMore:true,nextCursor:'next',periods:[]});});render(<XPHistory/>);await screen.findByText('Crédito 1');fireEvent.click(screen.getByLabelText('Próxima página do extrato'));await screen.findByRole('alert');expect(screen.getByText('Crédito 1')).toBeInTheDocument();fireEvent.click(screen.getByLabelText('Próxima página do extrato'));await screen.findByText('Crédito 6');expect(screen.queryByText('Crédito 1')).toBeNull();
});
function Content(){const chat=useChatDock();const [page,setPage]=useState('Tela atual');return <><button onClick={chat.open}>Abrir conversa</button><button onClick={()=>setPage('Outra página')}>Navegar</button><p>{page}</p></>;}
test('the game chat overlays the right side, preserves draft across navigation and close, and pauses polling when closed',async()=>{
 jest.useFakeTimers();render(<ChatDockProvider connected><Content/></ChatDockProvider>);expect(global.fetch).not.toHaveBeenCalled();await act(async()=>fireEvent.click(screen.getByText('Abrir conversa')));
 const dock=screen.getByRole('complementary',{name:'Chat geral lateral'});expect(dock).toHaveClass('ph-chat-dock');fireEvent.change(within(dock).getByLabelText('Sua mensagem'),{target:{value:'Meu rascunho'}});fireEvent.click(screen.getByText('Navegar'));expect(screen.getByText('Outra página')).toBeInTheDocument();expect(within(dock).getByLabelText('Sua mensagem')).toHaveValue('Meu rascunho');
 fireEvent.click(screen.getByLabelText('Ampliar chat geral'));expect(dock).toHaveClass('is-wide');fireEvent.click(screen.getByLabelText('Fechar chat geral'));expect(screen.queryByRole('complementary')).toBeNull();const count=global.fetch.mock.calls.length;await act(async()=>jest.advanceTimersByTime(10000));expect(global.fetch).toHaveBeenCalledTimes(count);
 await act(async()=>fireEvent.click(screen.getByLabelText('Abrir chat geral')));expect(within(screen.getByRole('complementary')).getByLabelText('Sua mensagem')).toHaveValue('Meu rascunho');expect(global.fetch.mock.calls.length).toBeGreaterThan(count);
});
test('a message acknowledged while the drawer is closed clears its draft and is not posted twice',async()=>{
 let finish;global.fetch.mockImplementation((_url,options)=>options?.method==='POST'?new Promise(resolve=>{finish=resolve;}):Promise.resolve(result({messages:[]})));
 render(<ChatDockProvider connected><Content/></ChatDockProvider>);await act(async()=>fireEvent.click(screen.getByText('Abrir conversa')));fireEvent.change(screen.getByLabelText('Sua mensagem'),{target:{value:'Minha entrega'}});await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Enviar'})));fireEvent.click(screen.getByLabelText('Fechar chat geral'));await act(async()=>finish(result({message:message('000000000000000000000002','Minha entrega')})));await act(async()=>fireEvent.click(screen.getByLabelText('Abrir chat geral')));expect(screen.getByLabelText('Sua mensagem')).toHaveValue('');expect(screen.getAllByText('Minha entrega')).toHaveLength(1);expect(global.fetch.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(1);
});
test('new messages do not move the scroll while reading old messages',async()=>{
 jest.useFakeTimers();let reads=0;global.fetch.mockImplementation(async()=>result({messages:++reads===1?[message()]:[message(),message('000000000000000000000002','Mensagem nova')]}));render(<ChatDockProvider connected><Content/></ChatDockProvider>);await act(async()=>fireEvent.click(screen.getByText('Abrir conversa')));const stream=screen.getByLabelText('Histórico: Chat geral');Object.defineProperties(stream,{scrollHeight:{configurable:true,value:1000},clientHeight:{configurable:true,value:200}});stream.scrollTop=100;fireEvent.scroll(stream);await act(async()=>jest.advanceTimersByTime(5000));expect(stream.scrollTop).toBe(100);fireEvent.click(screen.getByRole('button',{name:'Novas mensagens'}));expect(stream.scrollTop).toBe(1000);expect(screen.getByRole('button',{name:'Ir às recentes'})).toBeInTheDocument();
});
test('the general-chat navigation keeps the feed visible and legacy direct links open the drawer',async()=>{
 window.location.hash='community';render(<ChatDockProvider connected><CommunitySocial me={{connected:true}}/></ChatDockProvider>);await act(async()=>fireEvent.click(screen.getByRole('link',{name:'Chat geral'})));expect(window.location.hash).toBe('#community');expect(screen.getByText('Publicações da comunidade')).toBeInTheDocument();expect(screen.getByRole('complementary')).toBeVisible();fireEvent.click(screen.getByLabelText('Fechar chat geral'));await act(async()=>{window.location.hash='community/general';window.dispatchEvent(new HashChangeEvent('hashchange'));});expect(window.location.hash).toBe('#community');expect(screen.getByRole('complementary')).toBeVisible();
});
