import { readApiResponse } from './apiResponse';
import { useCallback, useEffect, useRef, useState } from 'react';
export const COMMUNITY_API = `${process.env.REACT_APP_PROD || 'http://localhost:3001/api'}/community`;
export default function useCommunityData(path, enabled, revision) {
  const [data, setRawData] = useState(null);
  const epoch = useRef(0);
  const [error, setError] = useState('');
  const setData = useCallback(value => { epoch.current += 1; setRawData(value); setError(''); }, []);
  useEffect(() => {
    if (!enabled) { setRawData(null); return; }
    const controller = new AbortController(); let active = true; let busy = false;
    async function load() {
      if (busy || document.visibilityState === 'hidden') return;
      const version = epoch.current;
      busy = true;
      try {
        const response = await fetch(`${COMMUNITY_API}${path}`, { credentials: 'include', signal: controller.signal });
        const value = await readApiResponse(response);
        if (active && version === epoch.current) { setRawData(value); setError(''); }
      } catch (err) { if (active && version === epoch.current && err.name !== 'AbortError') setError(err.message); }
      finally { busy = false; }
    }
    load(); const timer = window.setInterval(load, 60000);
    let lastResume = 0;
    const resume = () => { if (document.visibilityState === 'visible' && Date.now() - lastResume > 10000) { lastResume = Date.now(); load(); } };
    document.addEventListener('visibilitychange', resume);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [path, enabled, revision]);
  return { data, setData, error };
}
