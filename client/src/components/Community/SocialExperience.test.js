import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import CommunitySocial from './CommunitySocial';
import CommunityChat from './CommunityChat';
import Inbox from './Inbox';
import { viewFromHash } from './navigation';
const author={login:'bob',picture:'',profileId:'2'};
const post={id:'123456789012345678901234',text:'Meu projeto',createdAt:'2026-10-17',author,likes:1,liked:true,reaction:'heart',reactions:{heart:1},commentCount:31};
const result=data=>({ok:true,json:async()=>data});
beforeEach(()=>{window.location.hash='community';});
afterEach(()=>{jest.restoreAllMocks();delete global.fetch;});
test('comments open in a compact dialog, paginate, and Escape restores focus',async()=>{
  global.fetch=jest.fn(async url=>result(url.includes('feed/comments')?{comments:[{id:url.includes('before=')?'older':'latest',text:url.includes('before=')?'Comentário antigo':'Comentário recente',author}],hasMore:!url.includes('before=')}:{posts:[post],hasMore:false}));
  await act(async()=>render(<CommunitySocial me={{connected:true}}/>));
  const trigger=screen.getByRole('button',{name:'31 Comentários'});trigger.focus();
  expect(screen.queryByText('Comentário recente')).not.toBeInTheDocument();
  await act(async()=>fireEvent.click(trigger));
  const dialog=screen.getByRole('dialog',{name:'Comentários'});
  expect(await within(dialog).findByText('Comentário recente')).toBeInTheDocument();
  await act(async()=>fireEvent.click(within(dialog).getByRole('button',{name:'Ver comentários anteriores'})));
  expect(within(dialog).getByText('Comentário antigo')).toBeInTheDocument();
  fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(trigger).toHaveFocus();
  expect(screen.getByLabelText('Sua publicação')).toHaveAttribute('maxlength','200');
});
test('reaction picker supports touch/click choices and replacing a reaction',async()=>{
  global.fetch=jest.fn(async(_url,options)=>result(options?.method==='POST'?{ok:true}:{posts:[post],hasMore:false}));
  await act(async()=>render(<CommunitySocial me={{connected:true}}/>));
  fireEvent.click(screen.getByRole('button',{name:'Escolher reação'}));
  const choices=screen.getByRole('group',{name:'Reações'});expect(within(choices).getByRole('button',{name:'Triste'})).toBeInTheDocument();
  await act(async()=>fireEvent.click(within(choices).getByRole('button',{name:'Risada'})));
  expect(global.fetch.mock.calls.some(([,o])=>o?.body&&JSON.parse(o.body).reaction==='laugh'&&JSON.parse(o.body).liked===true)).toBe(true);
});
test('contacts, invitations and groups have independent paths and directory content',async()=>{
  for(const hash of ['#community/contacts','#community/invitations',`#community/groups/${post.id}`])expect(viewFromHash(hash)).toBe('community');
  window.location.hash='community/groups';global.fetch=jest.fn(async()=>result({contacts:[],groups:[]}));
  await act(async()=>render(<CommunitySocial me={{connected:true}}/>));
  expect(screen.getByPlaceholderText('Descrição')).toBeInTheDocument();
  expect(screen.queryByLabelText('Usuário GitHub do contato')).not.toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Contatos'})).toHaveAttribute('href','#community/contacts');expect(screen.getByRole('link',{name:'Convites'})).toHaveAttribute('href','#community/invitations');
});
test('help replaces free chat with accepted requests that open their automatic group',async()=>{
  window.location.hash='community/help';
  global.fetch=jest.fn(async(_url,o)=>result(_url.includes('/social')?{contacts:[],groups:[]}:o?.method==='POST'?{id:post.id}:{requests:[{id:post.id,title:'Preciso de ajuda',description:'Erro na API',status:'open',count:1,limit:3,author:'bob',joined:false}],hasMore:false}));
  await act(async()=>render(<CommunitySocial me={{connected:true}}/>));
  expect(screen.queryByRole('textbox',{name:'Sua mensagem'})).not.toBeInTheDocument();
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Quero ajudar'})));
  expect(window.location.hash).toBe(`#community/groups/${post.id}`);
  expect(global.fetch.mock.calls.some(([,o])=>o?.body&&JSON.parse(o.body).action==='join')).toBe(true);
});
test('mailbox shows unread messages and marks the checked snapshot as read',async()=>{
  const inbox={unread:1,checkedAt:'2026-10-17T17:00:00Z',items:[{id:'n1',title:'Convite de contato',message:'Bob quer adicionar você',path:'#community/invitations',createdAt:'2026-10-17T16:00:00Z',unread:true}],canAnnounce:false};
  global.fetch=jest.fn(async(_url,o)=>result(o?.method==='POST'?{...inbox,unread:0,items:inbox.items.map(n=>({...n,unread:false}))}:inbox));
  await act(async()=>render(<Inbox connected/>));
  fireEvent.click(screen.getByRole('button',{name:'Notificações: 1 não lidas'}));
  expect(screen.getByRole('link',{name:/Convite de contato/})).toHaveAttribute('href','#community/invitations');expect(screen.queryByText('Enviar aviso à comunidade')).not.toBeInTheDocument();
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Marcar todas como lidas'})));
  expect(screen.getByRole('button',{name:'Notificações'})).toBeInTheDocument();
  expect(JSON.parse(global.fetch.mock.calls.find(([,o])=>o?.method==='POST')[1].body)).toEqual({action:'read',checkedAt:inbox.checkedAt});
});
test('group file upload can send an attachment without text and preserves it for retry',async()=>{
  let sends=0;
  global.fetch=jest.fn(async(url,o)=>{
    if(url.includes('/chat/attachments?'))return result({id:'111111111111111111111111',name:'readme.txt',type:'text/plain',size:5});
    if(o?.method==='POST'){sends++;if(sends===1)return {ok:false,status:503,json:async()=>({error:'Falha temporária'})};return result({message:{id:'222222222222222222222222',text:'',createdAt:'2026-10-17',own:true,author,attachment:{id:'111111111111111111111111',name:'readme.txt',type:'text/plain',size:5}}});}
    return result({messages:[],hasOlder:false});
  });
  await act(async()=>render(<CommunityChat connected channel={`group:${post.id}`} title="Equipe"/>));
  const file=new File(['hello'],'readme.txt',{type:'text/plain'});
  fireEvent.change(screen.getByLabelText('Anexar arquivo'),{target:{files:[file]}});
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Enviar'})));
  expect(screen.getByRole('alert')).toHaveTextContent('Falha temporária');
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Enviar'})));
  expect(global.fetch.mock.calls.filter(([url])=>url.includes('/chat/attachments?'))).toHaveLength(1);
  expect(screen.getByRole('link',{name:/readme.txt/})).toHaveAttribute('href',expect.stringContaining('111111111111111111111111'));
  expect(screen.queryByRole('button',{name:'Remover anexo'})).not.toBeInTheDocument();
});
