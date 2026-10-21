import React, { useEffect, useState } from 'react';
import {useChatDock} from './ChatDock';
import CommunityProjects from './CommunityProjects';
import CommunityEvents from './CommunityEvents';
import {CommunityInterests} from './CommunityDiscovery';
import './community-growth.css';
import CommunityFeed from './CommunityFeed';
import SocialDirectory from './SocialDirectory';
import HelpRequests from './HelpRequests';
import { COMMUNITY_API } from './useCommunityData';
export { socialRequest, preparePhoto } from './socialAPI';
export default function CommunitySocial({ me }) {
  const dock=useChatDock();
  const [path,setPath]=useState(window.location.hash);
  useEffect(()=>{const update=()=>setPath(window.location.hash);window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
  const cleanPath=path.split('?')[0];
  const rawPart=cleanPath.startsWith('#community/post/')?'feed':cleanPath.split('/')[1]||'feed'; const part=rawPart==='general'?'feed':rawPart; const helpId=cleanPath.match(/^#community\/help\/([a-f0-9]{24})$/)?.[1]; const groupId=cleanPath.match(/^#community\/groups\/([a-f0-9]{24})$/)?.[1];
  return <div className="ph-community"><nav className="ph-community-nav" aria-label="Comunidade">{[['feed','Publicações'],['general','Chat geral'],['projects','Projetos'],['events','Eventos'],['help','Pedidos de ajuda'],['interests','Interesses'],['groups','Grupos'],['contacts','Contatos'],['invitations','Convites']].map(([id,label])=><a key={id} href={id==='feed'?'#community':`#community/${id}`} aria-current={part===id?'page':undefined} onClick={e=>{if(id==='general'&&dock&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&e.button===0){e.preventDefault();dock.open();}}}>{label}</a>)}</nav>{!me?.connected?<div className="ql-chat-welcome"><h2>Construa junto com a comunidade.</h2><a className="ql-button" href={`${COMMUNITY_API}/auth`}>Entrar com GitHub</a></div>:part==='projects'?<CommunityProjects key={path} me={me} selectedId={cleanPath.match(/^#community\/projects\/([a-f0-9]{24})$/)?.[1]}/>:part==='events'?<CommunityEvents key={path} selectedId={cleanPath.match(/^#community\/events\/([a-f0-9]{24})$/)?.[1]}/>:part==='interests'?<CommunityInterests/>:part==='help'?<HelpRequests key={path} selectedId={helpId}/>:['groups','contacts','invitations'].includes(part)?<SocialDirectory key={path} section={part} groupId={groupId}/>:<CommunityFeed key={path} me={me}/>}</div>;
}
