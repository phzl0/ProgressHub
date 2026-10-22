import React,{useEffect} from 'react';
import './styles/progress-hub-base.css';
import Community from './components/Community/Community';
// Original task/Google/AI screens stay in source; the public entry is Progress Hub.
export default function ProgressHubApp(){const target={'/legal/privacy':'/community#privacy','/legal/terms':'/community#information'}[window.location.pathname];useEffect(()=>{if(target)window.location.replace(target)},[target]);return target?null:<Community/>;}
