import React,{useState} from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {SafetyProvider} from './SafetyContext';
import SafetyMenu,{ReportDialog} from './SafetyControls';
import SafetyCenter from './SafetyCenter';
import CompactDialog from './CompactDialog';
import {socialRequest} from './socialAPI';
jest.mock('./socialAPI',()=>({socialRequest:jest.fn(),requestId:()=> 'report-request-fixed'}));
const empty={blocked:[],muted:[],reports:[]};
beforeEach(()=>{jest.clearAllMocks();socialRequest.mockResolvedValue(empty);});
test('only connected users see actions on another author',async()=>{
 const {rerender}=render(<SafetyProvider connected={false} viewerId="1"><SafetyMenu type="post" targetId="post" author={{githubId:'2'}}/></SafetyProvider>);
 expect(screen.queryByLabelText('Opções de publicação')).toBeNull();
 rerender(<SafetyProvider connected viewerId="1"><SafetyMenu type="post" targetId="post" author={{githubId:'1'}}/></SafetyProvider>);
 await waitFor(()=>expect(socialRequest).toHaveBeenCalled());expect(screen.queryByLabelText('Opções de publicação')).toBeNull();
});
test('failed reports keep the explanation and retry with the same request identifier',async()=>{
 socialRequest.mockRejectedValueOnce(new Error('Falha temporária')).mockResolvedValueOnce({id:'report'});const close=jest.fn();
 render(<ReportDialog type="post" targetId="post-2" onClose={close}/>);
 expect(screen.getByText('Enviar denúncia').disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Motivo da denúncia'),{target:{value:'spam'}});fireEvent.change(screen.getByLabelText('Descrição da denúncia'),{target:{value:'Explicação'}});
 fireEvent.click(screen.getByText('Enviar denúncia'));await screen.findByRole('alert');
 expect(screen.getByLabelText('Descrição da denúncia').value).toBe('Explicação');expect(close).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Enviar denúncia'));await waitFor(()=>expect(close).toHaveBeenCalledTimes(1));
 expect(socialRequest.mock.calls[0]).toEqual(socialRequest.mock.calls[1]);expect(socialRequest.mock.calls[1][1]).toMatchObject({targetType:'post',targetId:'post-2',reason:'spam',note:'Explicação',requestId:'report-request-fixed'});
});
test('confirmed safety events update blocked users and muted groups in settings',async()=>{
 render(<SafetyProvider connected viewerId="1"><SafetyCenter/></SafetyProvider>);await screen.findByText('Nenhum usuário bloqueado.');
 socialRequest.mockResolvedValue({blocked:[{githubId:'2',login:'bob'}],muted:[{id:'group',name:'Estudos',available:true}],reports:[]});
 fireEvent(window,new CustomEvent('ph-data-changed',{detail:{domains:['safety'],action:'block',targetId:'2'}}));
 await screen.findByText('@bob');await screen.findByText('Estudos');
 fireEvent.click(screen.getByText('Desbloquear'));await waitFor(()=>expect(socialRequest).toHaveBeenCalledWith('safety',{action:'unblock',githubId:'2'}));
 await waitFor(()=>expect(screen.getByText('Reativar notificações').disabled).toBe(false));
 fireEvent.click(screen.getByText('Reativar notificações'));await waitFor(()=>expect(socialRequest).toHaveBeenCalledWith('safety',{action:'unmute-group',groupId:'group'}));
});
test('Escape closes a nested report and keeps the comments dialog open',async()=>{
 function Nested(){const [report,setReport]=useState(false);return <CompactDialog title="Comentários" onClose={jest.fn()}><button onClick={()=>setReport(true)}>Denunciar</button>{report&&<ReportDialog type="comment" targetId="comment" onClose={()=>setReport(false)}/>}</CompactDialog>;}
 render(<Nested/>);fireEvent.click(screen.getByText('Denunciar'));expect(screen.getAllByRole('dialog',{hidden:true})).toHaveLength(2);
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.getAllByRole('dialog')).toHaveLength(1);expect(screen.getByRole('dialog').textContent).toContain('Comentários');
});
