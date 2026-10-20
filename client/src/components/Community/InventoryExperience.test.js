import React from 'react';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import '@testing-library/jest-dom';
import CommunityHeader from './CommunityHeader';
import Cosmetics from './Cosmetics';
import {activeAppearance,ProfileCard,CosmeticAvatar,CosmeticTitle,CosmeticChatFrame} from './Appearance';
const appearance={frame:'essential',cover:'custom',title:'none'};
const me={connected:true,githubId:'42',login:'dev',appearance};
afterEach(()=>{delete global.fetch;jest.useRealTimers();});
test('profile menu opens only by click, stays open on mouse leave and opens the inventory',async()=>{
 global.fetch=jest.fn(async url=>({ok:true,json:async()=>url.includes('/cosmetics')?{catalog:{frames:[]},welcomeClaimed:true}:{contacts:[],notifications:[]}}));
 render(<CommunityHeader me={me} tab="home" navigate={jest.fn()}/>);
 const trigger=screen.getByRole('button',{name:'Perfil e contatos'});
 fireEvent.mouseEnter(trigger);expect(screen.queryByText('Meu baú')).not.toBeInTheDocument();
 fireEvent.click(trigger);fireEvent.mouseLeave(trigger);expect(screen.getByText('Meu baú')).toBeInTheDocument();
 fireEvent.click(screen.getByText('Meu baú'));
 expect(screen.getByRole('dialog',{name:'Meu baú'})).toHaveClass('ph-inventory-dialog');
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('locked temporary item can be inspected but must be received before equip',async()=>{
 const expiresAt=new Date(Date.now()+7*86400000).toISOString();
 const catalog={frames:[{id:'essential',name:'Essencial',owned:true},{id:'energy',name:'Energia',temporary:true,owned:false}]};
 global.fetch=jest.fn(async(url,options)=>({ok:true,json:async()=>url.endsWith('/welcome')?{catalog:{frames:[catalog.frames[0],{...catalog.frames[1],owned:true,expiresAt}]},welcomeClaimed:true}:options?.method==='POST'?{appearance:JSON.parse(options.body)}:{catalog,welcomeClaimed:false}}));
 const onEquipped=jest.fn();render(<Cosmetics me={me} onEquipped={onEquipped}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Energia'}));expect(screen.getByRole('button',{name:'Item indisponível'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Receber coleção'}));await screen.findByText(/Coleção Energia recebida/);
 fireEvent.click(screen.getByRole('button',{name:'Energia'}));fireEvent.click(screen.getByRole('button',{name:'Equipar aparência'}));
 await waitFor(()=>expect(onEquipped).toHaveBeenCalledWith(expect.objectContaining({frame:'energy'})));
 expect(global.fetch.mock.calls.filter(([url])=>url.endsWith('/welcome'))).toHaveLength(1);
});
test('expiry removes every temporary effect and rank decoration cannot be selected through appearance',()=>{
 const expired={frame:'energy',title:'energy',card:'energy',chat:'energy',rank:1,expiresAt:{frame:'2000-01-01',title:'2000-01-01',card:'2000-01-01',chat:'2000-01-01'}};
 expect(activeAppearance(expired).frame).toBe('essential');
 const {container}=render(<ProfileCard appearance={expired}><CosmeticAvatar appearance={expired} src="github.png" alt="Avatar"/><CosmeticTitle appearance={expired}/><CosmeticChatFrame as="div" appearance={expired}>Mensagem</CosmeticChatFrame></ProfileCard>);
 expect(container.querySelector('.ph-skin-essential')).toBeInTheDocument();expect(container.querySelector('.ph-chat-skin-standard')).toBeInTheDocument();expect(screen.queryByText('Energia em código')).not.toBeInTheDocument();expect(screen.queryByLabelText(/Top 1/)).not.toBeInTheDocument();
 expect(screen.getByRole('img',{name:'Avatar'})).toHaveAttribute('src','github.png');
});
test('an already open profile, banner and chat drop expired effects without a new response',()=>{
 jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-20T12:00:00Z'));
 const expiresAt=new Date(Date.now()+1000).toISOString();const appearance={frame:'energy',title:'energy',card:'energy',chat:'energy',expiresAt:{frame:expiresAt,title:expiresAt,card:expiresAt,chat:expiresAt}};
 const {container,unmount}=render(<ProfileCard appearance={appearance}><CosmeticAvatar appearance={appearance}/><CosmeticTitle appearance={appearance}/><CosmeticChatFrame as="div" appearance={appearance}>Mensagem</CosmeticChatFrame></ProfileCard>);
 expect(container.querySelector('.ph-skin-energy')).toBeInTheDocument();
 act(()=>jest.advanceTimersByTime(30000));
 expect(container.querySelector('.ph-skin-essential')).toBeInTheDocument();expect(container.querySelector('.ql-frame-essential')).toBeInTheDocument();expect(container.querySelector('.ph-chat-skin-standard')).toBeInTheDocument();expect(screen.queryByText('Energia em código')).not.toBeInTheDocument();
 unmount();jest.useRealTimers();
});
