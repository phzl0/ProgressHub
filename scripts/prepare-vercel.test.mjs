import test from 'node:test';
import assert from 'node:assert/strict';
import {configuration} from './prepare-vercel.mjs';
test('proxy preserves API paths and disables automatic publishing',()=>{const c=configuration('https://api.example.com');assert.equal(c.rewrites[0].destination,'https://api.example.com/api/:path*');assert.equal(c.git.deploymentEnabled,false);assert.equal(c.outputDirectory,'build');});
test('reject unsafe API origins',()=>{for(const value of ['http://api.example.com','https://x:y@api.example.com','https://api.example.com/path','https://localhost'])assert.throws(()=>configuration(value));});
