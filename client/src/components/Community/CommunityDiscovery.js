import React,{useState} from 'react';
import useCommunityData from './useCommunityData';
import {useGrowthAction,splitTags} from './growthUI';
export function CommunityInterests(){
 const {data,error,setData}=useCommunityData('/discovery',true);const [draft,setDraft]=useState(null);const action=useGrowthAction('discovery',setData);
 return <section className="ph-growth-interest"><h3>Seus interesses</h3><p>Use tecnologias para filtrar o feed e encontre as pessoas que você acompanha.</p><form className="ph-growth-filters" onSubmit={e=>{e.preventDefault();action.act({action:'interests',tags:splitTags(draft??data?.interests?.join(', ')??'')});}}><input aria-label="Tecnologias de interesse" maxLength={124} value={draft??data?.interests?.join(', ')??''} onChange={e=>setDraft(e.target.value)} placeholder="Até cinco: python, java, react…"/><button disabled={action.busy}>Salvar interesses</button></form>{(error||action.error)&&<p role="alert">{action.error||error}</p>}<div className="ph-growth-tags">{data?.following?.map(p=><span key={p.githubId}>{p.profileId?<a href={`#profile/${p.profileId}`}>@{p.login}</a>:<>@{p.login}</>}<button aria-label={`Deixar de seguir ${p.login}`} disabled={action.busy} onClick={()=>action.act({action:'follow-user',githubId:p.githubId,following:false})}>×</button></span>)}</div></section>;
}
export function FollowUser({githubId,connected}){
 const {data,error,setData}=useCommunityData('/discovery',connected);const action=useGrowthAction('discovery',setData);if(!connected)return null;
 const following=data?.following?.some(p=>p.githubId===githubId);
 return <span className="ph-follow-control"><button className="ql-button ql-button-secondary" disabled={!data||action.busy} aria-pressed={Boolean(following)} onClick={()=>action.act({action:'follow-user',githubId,following:!following})}>{following?'Seguindo':'Seguir desenvolvedor'}</button>{(error||action.error)&&<small role="alert">{action.error||error}</small>}</span>;
}
export function FirstSteps({connected}){
 const {data,error,setData}=useCommunityData('/discovery',connected);const [expanded,setExpanded]=useState(false);const action=useGrowthAction('discovery',setData);
 if(!connected||!data?.steps)return null;
 if(data.dismissed)return <button className="ph-guide-resume" onClick={()=>action.act({action:'onboarding',step:'resume'})}>Reabrir primeiros passos</button>;
 const steps=[['github','Conectar GitHub','#account'],['goal','Escolher uma meta','#goals'],['xp','Entender sua pontuação','#progress'],['interaction','Compartilhar ou ajudar alguém','#community']];
 return <section className="ph-first-steps"><div className="ph-growth-heading"><h2>Seu próximo passo</h2><small>{steps.filter(([id])=>data.steps[id]).length}/4</small><button onClick={()=>action.act({action:'onboarding',step:'dismiss'})}>Dispensar</button></div><div className="ph-growth-actions">{steps.map(([id,label,path])=><a key={id} href={path}>{data.steps[id]?'✓ ':''}{label}</a>)}</div><button onClick={()=>setExpanded(v=>!v)}>Como funciona o XP?</button>{expanded&&<div><p>Commits e PRs elegíveis rendem XP com limites. Missões e conquistas dão bônus extras, e a carreira acumula sua evolução. Confira os critérios e cada crédito na aba Progresso. Publicações, curtidas e projetos cadastrados não geram XP.</p><button disabled={action.busy} onClick={()=>action.act({action:'onboarding',step:'xp-read'})}>Entendi a pontuação</button></div>}{(error||action.error)&&<p role="alert">{action.error||error}</p>}</section>;
}
