import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import CommunityChat from './CommunityChat';
const message = (id='000000000000000000000001', own=false, text='Olá comunidade') => ({id,own,text,deleted:false,createdAt:'2026-10-17T17:00:00Z',author:{login:own?'dev':'peer',profileId:own?'42':null,picture:'',appearance:{frame:'essential'}}});
beforeEach(()=>{jest.useFakeTimers();});
afterEach(()=>{cleanup();jest.useRealTimers();delete global.fetch;});
test('chat requires GitHub and does not fetch when disconnected',()=>{
  global.fetch=jest.fn();render(<CommunityChat connected={false}/>);
  expect(screen.getByRole('link',{name:'Entrar com GitHub'})).toBeInTheDocument();expect(global.fetch).not.toHaveBeenCalled();
});
test('chat polls only while open, renders text safely, and respects private profile visibility',async()=>{
  global.fetch=jest.fn(async()=>({ok:true,json:async()=>({messages:[message(undefined,false,'<img src=x onerror=alert(1)>')],hasOlder:false})}));
  const view=render(<CommunityChat connected/>);
  expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(screen.queryByRole('link',{name:'@peer'})).not.toBeInTheDocument();
  expect(view.container.querySelector('img[onerror]')).toBeNull();
  await act(async()=>{jest.advanceTimersByTime(5000);});expect(global.fetch).toHaveBeenCalledTimes(2);
  view.unmount();await act(async()=>{jest.advanceTimersByTime(5000);});expect(global.fetch).toHaveBeenCalledTimes(2);
});
test('send retains the draft on failure, reuses its retry ID and merges the successful message once',async()=>{
  let attempts=0;
  global.fetch=jest.fn(async(url,options)=>{
    if(options?.method==='POST') {attempts++;return attempts===1?{ok:false,status:503,json:async()=>({error:'Tente novamente.'})}:{ok:true,json:async()=>({message:message('000000000000000000000002',true,'Meu projeto')})};}
    return {ok:true,json:async()=>({messages:[],hasOlder:false})};
  });
  await act(async()=>{render(<CommunityChat connected/>);});
  fireEvent.change(screen.getByRole('textbox',{name:'Sua mensagem'}),{target:{value:'Meu projeto'}});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Enviar'}));});
  expect(screen.getByRole('textbox')).toHaveValue('Meu projeto');expect(screen.getByRole('alert')).toHaveTextContent('Tente novamente.');
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Enviar'}));});
  expect(screen.getByRole('textbox')).toHaveValue('');expect(screen.getAllByText('Meu projeto')).toHaveLength(1);
  const posts=global.fetch.mock.calls.filter(([,opts])=>opts?.method==='POST');expect(JSON.parse(posts[0][1].body).requestId).toBe(JSON.parse(posts[1][1].body).requestId);
  expect(screen.getByRole('button',{name:'Aguarde…'})).toBeDisabled();
});
test('older messages load separately and only own messages offer deletion with a confirmation',async()=>{
  global.fetch=jest.fn(async(url,opts)=>({ok:true,json:async()=>opts?.method==='POST'?{deleted:true,id:'000000000000000000000002'}:url.includes('before=')?{messages:[message()],hasOlder:false}:{messages:[message('000000000000000000000002',true,'Minha mensagem')],hasOlder:true}}));
  await act(async()=>{render(<CommunityChat connected/>);});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Carregar anteriores'}));});
  expect(screen.getByText('Olá comunidade')).toBeInTheDocument();
  expect(screen.getAllByRole('button',{name:'Apagar minha mensagem'})).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Apagar minha mensagem'}));
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Apagar',exact:true}));});
  expect(screen.getByText('Mensagem apagada')).toBeInTheDocument();expect(screen.queryByText('Minha mensagem')).not.toBeInTheDocument();
});
