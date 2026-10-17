const fail = message => Object.assign(new Error(message), { status: 400 });
function normalizeLines(value) {
  return value.replace(/\r\n?|[\u2028\u2029]/g,'\n').replace(/[ \t]+$/gm,'').replace(/\n(?:[ \t]*\n){2,}/g,'\n\n').trim();
}
function boundedText(value,max,lines=1,optional=false) {
  if(typeof value!=='string')throw fail('Informe um texto válido.');
  const clean=normalizeLines(value);
  if((!optional&&!clean)||[...clean].length>max||clean.split('\n').length>lines||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(clean))throw fail(`Use até ${max} caracteres e ${lines} ${lines===1?'linha':'linhas'}, sem linhas vazias repetidas.`);
  return clean;
}
module.exports={normalizeLines,boundedText};
