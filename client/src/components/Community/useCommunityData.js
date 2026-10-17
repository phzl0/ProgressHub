import { useEffect, useState } from 'react';
export const COMMUNITY_API = `${process.env.REACT_APP_PROD || 'http://localhost:3001/api'}/community`;
export default function useCommunityData(path, enabled, revision) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) { setData(null); return; }
    const controller = new AbortController(); let active = true; let busy = false;
    async function load() {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const response = await fetch(`${COMMUNITY_API}${path}`, { credentials: 'include', signal: controller.signal });
        if (!response.ok) throw new Error('Não foi possível atualizar. Tente novamente em instantes.');
        const value = await response.json();
        if (active) { setData(value); setError(''); }
      } catch (err) { if (active && err.name !== 'AbortError') setError(err.message); }
      finally { busy = false; }
    }
    load(); const timer = window.setInterval(load, 60000);
    const resume = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', resume);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [path, enabled, revision]);
  return { data, setData, error };
}
