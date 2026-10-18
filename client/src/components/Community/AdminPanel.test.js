import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import AdminPanel from './AdminPanel';
import {socialRequest} from './socialAPI';
jest.mock('./socialAPI',()=>({socialRequest:jest.fn(),requestId:()=> 'admin-fixed-request-001'}));
const report={id:'012345678901234567890123',label:'Publicação',type:'post',targetId:'012345678901234567890124',reason:'spam',status:'received',revision:null,createdAt:'2026-10-18T12:00:00Z'};
beforeEach(()=>{jest.clearAllMocks();socialRequest.mockImplementation(path=>{if(path==='admin?view=access')return Promise.resolve({role:'admin'});if(path.startsWith('admin?view=reports'))return Promise.resolve({items:[report]});if(path.startsWith('admin?view=report&'))return Promise.resolve({report:{...report,excerpt:'Conteúdo registrado',note:'Explicação privada'},content:{hidden:false,deleted:false,text:'Conteúdo atual',revision:null},author:{githubId:'2',login:'bob',revision:null}});return Promise.resolve({items:[]});});});
test('ordinary users cannot open administrative controls',async()=>{
 socialRequest.mockRejectedValue(new Error('Acesso exclusivo à administração.'));render(<AdminPanel connected/>);await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'Usuários'})).toBeNull();expect(screen.queryByText('Ocultar conteúdo')).toBeNull();
});
test('reports require justified confirmation and preserve failed attempts',async()=>{
 render(<AdminPanel connected/>);fireEvent.click(await screen.findByRole('button',{name:/Publicação/}));await screen.findByText('Conteúdo registrado');fireEvent.click(screen.getByText('Ocultar conteúdo'));
 expect(screen.getByText('Confirmar ação').disabled).toBe(true);fireEvent.change(screen.getByLabelText('Justificativa administrativa'),{target:{value:'Publicação contém spam.'}});
 socialRequest.mockRejectedValueOnce(new Error('Falha temporária'));fireEvent.click(screen.getByText('Confirmar ação'));await screen.findByRole('alert');expect(screen.getByLabelText('Justificativa administrativa').value).toBe('Publicação contém spam.');
 fireEvent.click(screen.getByText('Confirmar ação'));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());const writes=socialRequest.mock.calls.filter(([p])=>p==='admin');expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1]);expect(writes[0][1]).toMatchObject({action:'hide',targetId:report.targetId,targetType:'post',expectedRevision:null,reason:'Publicação contém spam.'});
});
test('official notices are previewed before sending and include an audit reason',async()=>{
 render(<AdminPanel connected/>);fireEvent.click(await screen.findByRole('button',{name:'Avisos'}));fireEvent.change(screen.getByLabelText('Título do aviso oficial'),{target:{value:'Manutenção'}});fireEvent.change(screen.getByLabelText('Mensagem do aviso oficial'),{target:{value:'Retornaremos em breve.'}});fireEvent.click(screen.getByText('Revisar envio'));expect(screen.getByRole('dialog').textContent).toContain('Retornaremos em breve.');expect(socialRequest.mock.calls.some(([p])=>p==='admin')).toBe(false);
 fireEvent.change(screen.getByLabelText('Justificativa administrativa'),{target:{value:'Informar manutenção agendada.'}});fireEvent.click(screen.getByText('Confirmar ação'));await waitFor(()=>expect(socialRequest).toHaveBeenCalledWith('admin',expect.objectContaining({action:'announce',title:'Manutenção',message:'Retornaremos em breve.',reason:'Informar manutenção agendada.'})));
});
test('a moderator can choose a temporary suspension from user search',async()=>{
 socialRequest.mockImplementation(p=>Promise.resolve(p==='admin?view=access'?{role:'moderator'}:p.startsWith('admin?view=users')?{items:[{githubId:'2',login:'bob',revision:null}]}:{items:[]}));render(<AdminPanel connected/>);fireEvent.click(await screen.findByRole('button',{name:'Usuários'}));fireEvent.change(screen.getByLabelText('Pesquisar usuário GitHub'),{target:{value:'bob'}});fireEvent.click(screen.getByRole('button',{name:'Pesquisar'}));await screen.findByText('@bob');fireEvent.click(screen.getByText('Suspender'));fireEvent.change(screen.getByLabelText('Duração da suspensão'),{target:{value:'7'}});fireEvent.change(screen.getByLabelText('Justificativa administrativa'),{target:{value:'Assédio reincidente confirmado.'}});fireEvent.click(screen.getByText('Confirmar ação'));await waitFor(()=>expect(socialRequest).toHaveBeenCalledWith('admin',expect.objectContaining({action:'suspend',days:7,targetId:'2',expectedRevision:null})));
});
