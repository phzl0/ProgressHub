import React from 'react';
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react';
import '@testing-library/jest-dom';
import ActionToasts from './ActionToasts';
import {mutationRequest,feedbackSnapshot,dismissFeedback} from './actionFeedback';
import CommentsDialog from './CommentsDialog';
import HeaderSearch from './HeaderSearch';
import CommunityFeed from './CommunityFeed';
import {viewFromHash} from './navigation';
const parent='123456789012345678901234';const author={login:'alice',profileId:'10',picture:''};const root={id:'10:comment-0000000001',text:'Uma dúvida',author,replies:[],replyCount:0};
const response=data=>({ok:true,json:async()=>data});
beforeEach(()=>{feedbackSnapshot().forEach(n=>dismissFeedback(n.id));window.location.hash='community';});
afterEach(()=>{cleanup();jest.useRealTimers();jest.restoreAllMocks();feedbackSnapshot().forEach(n=>dismissFeedback(n.id));delete global.fetch;});
test('mutation feedback waits for server acknowledgement, deduplicates clicks and invalidates relevant data',async()=>{
  let resolve;global.fetch=jest.fn(()=>new Promise(r=>{resolve=r;}));const changed=jest.fn();window.addEventListener('ph-data-changed',changed);
  render(<ActionToasts/>);let first,second;
  await act(async()=>{first=mutationRequest('/api/community/feed',{method:'POST',body:JSON.stringify({action:'publish',text:'Hello'})});second=mutationRequest('/api/community/feed',{method:'POST',body:JSON.stringify({action:'publish',text:'Hello'})});});
  expect(global.fetch).toHaveBeenCalledTimes(1);expect(first).toBe(second);expect(screen.getByRole('status')).toHaveTextContent('Publicando…');expect(screen.queryByText('Publicação criada.')).not.toBeInTheDocument();
  await act(async()=>{resolve(response({ok:true}));await first;});expect(screen.getByRole('status')).toHaveTextContent('Publicação criada.');expect(changed.mock.calls[0][0].detail.domains).toContain('feed');window.removeEventListener('ph-data-changed',changed);
});
test('failed writes show an error, are not automatically replayed and permit an explicit retry',async()=>{
  global.fetch=jest.fn().mockImplementationOnce(()=>{throw new Error('Falha de conexão');}).mockResolvedValue(response({ok:true}));render(<ActionToasts/>);
  const opts={method:'POST',body:JSON.stringify({action:'group-update',id:parent})};
  await act(async()=>{await expect(mutationRequest('/api/community/social',opts)).rejects.toThrow('Falha de conexão');});
  expect(screen.getByRole('alert')).toHaveTextContent('Falha de conexão');expect(global.fetch).toHaveBeenCalledTimes(1);
  await act(async()=>{await mutationRequest('/api/community/social',opts);});expect(global.fetch).toHaveBeenCalledTimes(2);expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.getByRole('status')).toHaveTextContent('Detalhes do grupo salvos.');
});
test('replies preserve draft and retry identity on error, then appear grouped without nesting indefinitely',async()=>{
  let sent=false;let failed=false;const child={id:'20:reply-00000000001',text:'Tente esta solução',author:{login:'bob'},rootId:root.id,replyTo:root.id,replyToAuthor:'alice'};
  global.fetch=jest.fn(async(_url,o)=>{if(o?.method==='POST'){if(!failed){failed=true;return {ok:false,status:503,json:async()=>({error:'Tente novamente'})};}sent=true;return response({ok:true});}return response({comments:[{...root,replies:sent?[child]:[],replyCount:sent?1:0}],hasMore:false});});
  await act(async()=>render(<CommentsDialog post={{id:parent,text:'Meu projeto',author}} onClose={()=>{}}/>));
  fireEvent.click(screen.getByRole('button',{name:'Responder'}));fireEvent.change(screen.getByLabelText('Escrever comentário'),{target:{value:'Tente esta solução'}});
  const submit=screen.getByLabelText('Escrever comentário').closest('form').querySelector('button');
  await act(async()=>fireEvent.click(submit));expect(screen.getByLabelText('Escrever comentário')).toHaveValue('Tente esta solução');
  await act(async()=>fireEvent.click(submit));expect(screen.getByLabelText('Escrever comentário')).toHaveValue('');
  const posts=global.fetch.mock.calls.filter(([,o])=>o?.method==='POST').map(([,o])=>JSON.parse(o.body));expect(posts[0].replyTo).toBe(root.id);expect(posts[0].requestId).toBe(posts[1].requestId);
  expect(screen.getByText('Tente esta solução').closest('.ph-comment')).toHaveClass('ph-comment-reply');
});
test('successful reply with failed refresh is not sent again and offers a read retry',async()=>{
  let posted=false;global.fetch=jest.fn(async(_url,o)=>{if(o?.method==='POST'){posted=true;return response({ok:true});}if(posted)return {ok:false,status:503,json:async()=>({error:'Offline'})};return response({comments:[root],hasMore:false});});
  await act(async()=>render(<CommentsDialog post={{id:parent,text:'Post',author}} onClose={()=>{}}/>));
  fireEvent.change(screen.getByLabelText('Escrever comentário'),{target:{value:'Meu comentário'}});
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Comentar'})));
  expect(screen.getByLabelText('Escrever comentário')).toHaveValue('');expect(screen.getByRole('alert')).toHaveTextContent('Comentário enviado, mas a conversa não atualizou.');expect(global.fetch.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(1);
});
test('search results support keyboard navigation and direct links to resources',async()=>{
  jest.useFakeTimers();global.fetch=jest.fn(async()=>response({results:[{id:'page:ranking',type:'Página',label:'Ranking',description:'Classificação da comunidade',path:'#ranking'},{id:'achievement:first',type:'Conquista',label:'Primeiro commit',description:'300 XP',path:'#progress/achievements?achievement=commits-1'}]}));
  render(<HeaderSearch connected/>);fireEvent.change(screen.getByLabelText('Pesquisar na comunidade'),{target:{value:'clas'}});await act(async()=>jest.advanceTimersByTime(350));
  fireEvent.keyDown(screen.getByLabelText('Pesquisar na comunidade'),{key:'ArrowDown'});expect(screen.getByRole('link',{name:/Ranking/})).toHaveFocus();
  fireEvent.keyDown(document.activeElement,{key:'ArrowDown'});expect(screen.getByRole('link',{name:/Primeiro commit/})).toHaveFocus();
  expect(viewFromHash('#progress/achievements?achievement=commits-1')).toBe('achievements');expect(viewFromHash(`#community/post/${parent}?comment=${encodeURIComponent(root.id)}`)).toBe('community');
});
test('reply notification opens the comment dialog in its original publication',async()=>{
  window.location.hash=`community/post/${parent}?comment=${encodeURIComponent(root.id)}`;
  global.fetch=jest.fn(async url=>response(url.includes('/feed/comments')?{comments:[root],hasMore:false}:{posts:[{id:parent,text:'Post original',author,createdAt:'2026-10-17',likes:0,commentCount:1}],hasMore:false}));
  await act(async()=>render(<CommunityFeed me={{connected:true}}/>));expect(screen.getByRole('dialog',{name:'Comentários'})).toBeInTheDocument();expect(screen.getByText('Uma dúvida')).toBeInTheDocument();
});
