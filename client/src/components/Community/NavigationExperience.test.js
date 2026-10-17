import React from 'react';
import {render,screen,fireEvent,act,within,cleanup} from '@testing-library/react';
import '@testing-library/jest-dom';
import HeaderSearch from './HeaderSearch';
import CommunityFeed from './CommunityFeed';
import SocialDirectory from './SocialDirectory';
import GroupRoom from './GroupRoom';
import HelpRequests from './HelpRequests';
import CommunityChat from './CommunityChat';
import {viewFromHash} from './navigation';
const id='123456789012345678901234';const author={login:'bob',picture:'https://avatars.githubusercontent.com/u/12',profileId:'12'};
const post={id,text:'Meu projeto',kind:'feed',createdAt:'2026-10-17',author,likes:0,comments:[],commentCount:1};
const group={id,name:'Equipe',description:'Descrição interna',cover:'',owner:true,joined:true,type:'group',members:[{githubId:'11',...author}]};
const result=d=>({ok:true,json:async()=>d});
afterEach(()=>{cleanup();jest.useRealTimers();jest.restoreAllMocks();delete global.fetch;});
test('header search debounces, displays scoped links and closes on Escape',async()=>{
  jest.useFakeTimers();global.fetch=jest.fn(async()=>result({results:[{id:'g:1',type:'Grupo',label:'Equipe',path:`#community/groups/${id}`}]}));
  render(<HeaderSearch connected/>);fireEvent.change(screen.getByLabelText('Pesquisar na comunidade'),{target:{value:'Eq'}});
  expect(global.fetch).not.toHaveBeenCalled();await act(async()=>jest.advanceTimersByTime(350));
  expect(screen.getByRole('link',{name:/Equipe/})).toHaveAttribute('href',`#community/groups/${id}`);
  fireEvent.keyDown(screen.getByLabelText('Pesquisar na comunidade'),{key:'Escape'});expect(screen.queryByRole('link',{name:/Equipe/})).not.toBeInTheDocument();
});
test('group listing shows only cover, name and entry; configuration stays in the room',async()=>{
  global.fetch=jest.fn(async()=>result({contacts:[],groups:[group]}));
  await act(async()=>render(<SocialDirectory/>));
  const row=screen.getByRole('article');expect(within(row).getByRole('link',{name:'Entrar'})).toHaveAttribute('href',`#community/groups/${id}`);
  expect(within(row).queryByText('Descrição interna')).not.toBeInTheDocument();expect(within(row).queryByText('Convidar membro')).not.toBeInTheDocument();
});
test('help status control is only inside the owner room details',async()=>{
  global.fetch=jest.fn(async url=>result(url.includes('/chat')?{messages:[],hasOlder:false}:{requests:[{id,title:'Meu pedido',description:'Detalhes',status:'open',author:'bob',joined:true,own:true,count:1,limit:6,helpers:[]}]}));
  const view=render(<GroupRoom group={{...group,type:'help',helpStatus:'open'}} contacts={[]}/>);
  await screen.findByText('A conversa começa com um olá.');expect(screen.queryByLabelText('Estado do pedido')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Detalhes'}));expect(screen.getByLabelText('Estado do pedido')).toBeInTheDocument();
  view.unmount();await act(async()=>render(<HelpRequests/>));expect(screen.queryByLabelText(/Estado do pedido/)).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Salvar pedido'})).toBeInTheDocument();
});
test('help profile history separates created, helped and private saved collections',async()=>{
  global.fetch=jest.fn(async()=>result({requests:[],hasMore:false}));
  await act(async()=>render(<HelpRequests history/>));
  expect(global.fetch.mock.calls[0][0]).toContain('help?tab=mine');
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Salvos'})));
  expect(global.fetch.mock.calls.at(-1)[0]).toContain('help?tab=saved');
  expect(viewFromHash(`#community/help/${id}`)).toBe('community');
});
test('feed defaults to Feed, filters categories and opens actual comments with avatar',async()=>{
  global.fetch=jest.fn(async url=>result(url.includes('/feed/comments')?{comments:[{id:'comment-1',text:'Comentário existente',author}],hasMore:false}:url.includes('/reactions')?{}:{posts:[post],hasMore:false}));
  window.location.hash='community';await act(async()=>render(<CommunityFeed me={{connected:true}}/>));
  expect(screen.getByLabelText('Categoria opcional')).toHaveValue('feed');
  await act(async()=>fireEvent.change(screen.getByLabelText('Filtrar publicações'),{target:{value:'learning'}}));expect(global.fetch.mock.calls.at(-1)[0]).toContain('kind=learning');
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'1 Comentários'})));
  const dialog=screen.getByRole('dialog',{name:'Comentários'});expect(within(dialog).getByText('Comentário existente')).toBeInTheDocument();
  expect(dialog.querySelector('.ql-cosmetic-avatar')).toHaveStyle('--avatar-size: 32px');
  const options=within(dialog).getByRole('button',{name:'Escolher reação'});fireEvent.click(options);
  await act(async()=>fireEvent.click(within(dialog).getByRole('button',{name:'Joia'})));
  expect(global.fetch.mock.calls.some(([,o])=>o?.body&&JSON.parse(o.body).kind==='comment')).toBe(true);
});
test('group messages send continuously while retaining server confirmed delivery',async()=>{
  let count=0;global.fetch=jest.fn(async(_url,o)=>result(o?.method==='POST'?{message:{id:(++count).toString().padStart(24,'0'),text:JSON.parse(o.body).text,author,createdAt:'2026-10-17',own:true}}:{messages:[],hasOlder:false}));
  await act(async()=>render(<CommunityChat connected channel={`group:${id}`} title="Equipe"/>));
  for(const text of ['Primeira','Segunda']){fireEvent.change(screen.getByLabelText('Sua mensagem'),{target:{value:text}});await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Enviar'})));}
  expect(screen.getByText('Primeira')).toBeInTheDocument();expect(screen.getByText('Segunda')).toBeInTheDocument();expect(screen.queryByText(/Você pode enviar outra mensagem/)).not.toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Chat coletivo'})).toHaveClass('ph-group-chat');
});
