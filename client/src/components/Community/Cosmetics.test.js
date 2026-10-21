import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Cosmetics from './Cosmetics';
import { CosmeticAvatar, CosmeticTitle } from './Appearance';
const appearance = { frame: 'essential', cover: 'custom', title: 'none' };
const catalog = {
  frames: [{ id: 'essential', name: 'Essencial' }, { id: 'circuit', name: 'Circuito' }, { id: 'terminal', name: 'Terminal' }, { id: 'crystal', name: 'Cristal' }, { id: 'prestige', name: 'Prestígio' }],
  covers: [{ id: 'custom', name: 'Meu banner' }, { id: 'aurora', name: 'Aurora' }, { id: 'matrix', name: 'Malha digital' }, { id: 'orbit', name: 'Órbita' }],
  titles: [{ id: 'none', name: 'Sem título cosmético' }, { id: 'building', name: 'Ideias em código' }]
};
afterEach(() => { delete global.fetch; });
test('only the basic cosmetic is offered and existing GitHub identity is preserved',async()=>{
 global.fetch=jest.fn(async()=>({ok:true,json:async()=>({catalog,appearance,welcomeClaimed:true})}));
 const {container}=render(<Cosmetics me={{connected:true,login:'dev',appearance:{frame:'crystal',cover:'orbit',title:'building'}}}/>);
 await screen.findByRole('button',{name:'Essencial'});expect(screen.queryByRole('button',{name:'Cristal'})).not.toBeInTheDocument();expect(container.querySelectorAll('.ql-cosmetic-item')).toHaveLength(1);
});
test('avatars use the GitHub photo with the basic frame and retain the earned career title',()=>{
 const {container}=render(<><CosmeticAvatar src="https://avatars.githubusercontent.com/u/42" frame="terminal" alt="Meu avatar"/><CosmeticTitle title="building"/><span>Explorador · Nível 2</span></>);
 expect(screen.getByRole('img',{name:'Meu avatar'})).toHaveAttribute('src','https://avatars.githubusercontent.com/u/42');expect(container.querySelector('.ql-frame-essential')).toBeInTheDocument();expect(screen.queryByText('Ideias em código')).not.toBeInTheDocument();expect(screen.getByText('Explorador · Nível 2')).toBeInTheDocument();
});
