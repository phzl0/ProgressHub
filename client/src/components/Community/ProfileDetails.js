import React from 'react';
import { ArrowUpRight } from 'lucide-react';
export default function ProfileDetails({ profile }) {
  if (!profile?.bio && !profile?.links?.length) return null;
  return <div className="ql-profile-details">{profile.bio && <p className="ql-profile-bio">{profile.bio}</p>}{Boolean(profile.links?.length) && <div className="ql-profile-links">{profile.links.map((link, index) => <a key={index} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight size={14} /></a>)}</div>}</div>;
}
