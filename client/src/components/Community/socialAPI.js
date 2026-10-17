import { mutationRequest } from './actionFeedback';
import React from 'react';
import { CosmeticAvatar } from './Appearance';
import { COMMUNITY_API } from './useCommunityData';
import { readApiResponse } from './apiResponse';
export const socialRequest = async (path, body, options={}) => body!==undefined ? mutationRequest(`${COMMUNITY_API}/${path}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},{path,...options}) : readApiResponse(await fetch(`${COMMUNITY_API}/${path}`,{credentials:'include'}));
export const requestId = () => window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
export function Author({ author }) { return <div className="ph-social-author"><CosmeticAvatar src={author?.picture} frame={author?.appearance?.frame} size={32} />{author?.profileId ? <a href={`#profile/${author.profileId}`}>@{author.login}</a> : <strong>@{author?.login || 'Participante'}</strong>}</div>; }
export async function preparePhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Escolha uma foto JPG, PNG ou WebP de até 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.6, 0.4]) { const value = canvas.toDataURL('image/webp', quality); if (value.startsWith('data:image/webp;') && value.length <= 400000) return value; }
    throw new Error('Esta foto ainda está grande. Escolha uma imagem menor.');
  } finally { bitmap.close(); }
}
