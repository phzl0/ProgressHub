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
test('inventory shows one basic option per category while stored collections remain untouched',async()=>{
 const library=require('./cosmeticLibrary.json');const catalog={frames:[{id:'essential',name:'Essencial',owned:true},...library.frames],cards:[{id:'essential',name:'Original',owned:true},...library.cards],chats:[{id:'standard',name:'Clássico',owned:true},...library.chats]};
 global.fetch=jest.fn(async()=>({ok:true,json:async()=>({catalog,welcomeClaimed:true})}));
 const {container}=render(<Cosmetics me={me}/>);await screen.findByRole('button',{name:'Essencial'});expect(container.querySelectorAll('.ql-cosmetic-item')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Cards de perfil'}));expect(screen.getByRole('button',{name:'Original'})).toBeInTheDocument();expect(container.querySelectorAll('.ql-cosmetic-item')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Chat'}));expect(screen.getByRole('button',{name:'Clássico'})).toBeInTheDocument();
});
test('paused cosmetics render the basic profile and chat while the expiry engine remains safe',()=>{
 const stored={frame:'energy',title:'energy',card:'energy',chat:'energy',expiresAt:{frame:'2000-01-01',title:'2000-01-01',card:'2000-01-01',chat:'2000-01-01'}};
 expect(activeAppearance(stored).frame).toBe('essential');const {container}=render(<ProfileCard appearance={stored}><CosmeticAvatar src="github.png" alt="Avatar" appearance={stored}/><CosmeticTitle appearance={stored}/><CosmeticChatFrame as="div" appearance={stored}>Mensagem</CosmeticChatFrame></ProfileCard>);
 expect(container.querySelector('.ph-skin-essential')).toBeInTheDocument();expect(container.querySelector('.ph-chat-skin-standard')).toBeInTheDocument();expect(screen.getByRole('img',{name:'Avatar'})).toHaveAttribute('src','github.png');expect(screen.queryByText('Energia em código')).not.toBeInTheDocument();expect(stored.frame).toBe('energy');
});
