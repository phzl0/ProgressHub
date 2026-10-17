const PAGES=[
 ['home','Tela inicial','Resumo da sua jornada e destaques.','inicio dashboard painel resumo principal'],
 ['ranking','Ranking','Classificação da comunidade.','classificacao posicao colocado colocacao competicao arena lideres top global'],
 ['ranking/seasons','Temporadas','Resultados e histórico de temporadas.','temporada meses historico classificacoes anteriores'],
 ['missions','Missões','Objetivos e bônus de XP.','missao missoes tarefas bonus recompensa diario semanal mensal objetivos'],
 ['progress','Progresso','Acompanhe XP, níveis e contribuições.','exp xp experiencia nivel niveis evolucao estatisticas atividade contribuicoes sincronizar atualizar'],
 ['progress/achievements','Conquistas','Sua coleção de conquistas.','conquista medalha trofeu emblema desbloqueio colecao'],
 ['goals','Metas pessoais','Planeje o próximo projeto.','meta roteiro projeto pessoal plano construir ecommerce estoque pagamento'],
 ['community','Publicações da comunidade','Projetos, ideias e conversas no feed.','feed post posts publicacao publicar comunidade discussao'],
 ['community/general','Chat geral','Converse com a comunidade.','chat conversar conversa mensagem geral'],
 ['community/help','Pedidos de ajuda','Peça ajuda ou contribua com uma solução.','ajuda ajudar duvida pergunta problema suporte sugestao resolver'],
 ['community/groups','Grupos','Seus espaços de conversa e colaboração.','grupo equipe time membros sala'],
 ['community/contacts','Contatos','Sua rede de contatos.','amigo amizade contato pessoas rede'],
 ['community/invitations','Convites','Convites enviados e recebidos.','convite solicitacao amizade aceitar pendente'],
 ['me','Meu perfil','Seu perfil, projetos e personalização.','perfil foto avatar banner capa descricao bio cosmetico moldura aparencia titulo meus pedidos salvos'],
 ['settings','Configurações','Ajuste suas preferências.','configuracao preferencias animacao personalizar'],
 ['account','Conta','Informações da conta GitHub conectada.','conta github login acesso conexao conectado identificacao'],
 ['privacy','Privacidade','Controle sua participação e visibilidade.','privacidade publico privado participacao visibilidade'],
 ['information','Regras e ajuda','Entenda as regras da plataforma.','regra pontuacao funcionamento termos informacoes creditos servico servicos recurso recursos funcionalidades']
].map(([path,label,description,aliases])=>({id:`page:${path}`,type:'Página',label,description,aliases,path:`#${path}`}));
const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const STOP=new Set(['a','o','as','os','e','em','de','do','da','dos','das','no','na','nos','nas','um','uma','meu','minha','meus','minhas','quero','ver','vejo','posso','consultar','buscar','mostrar','como','onde','para','esta','estao']);
function tokensFor(value){const tokens=normalize(value.trim()).split(/\s+/).filter(t=>!STOP.has(t));return tokens.length?tokens.slice(0,6):[normalize(value.trim())];}
function near(a,b){if(a.length<4||Math.abs(a.length-b.length)>1)return false;let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return edits+(a.length-i)+(b.length-j)<=1;}
function scoreEntry(entry,tokens){
  const label=normalize(entry.label||'');const description=normalize(entry.description||'');const aliases=normalize(entry.aliases||'');const words=`${label} ${aliases}`.split(/\s+/);
  let score=0;for(const token of tokens){if(label===token)score+=100;else if(label.startsWith(token))score+=65;else if(label.includes(token))score+=45;else if(aliases.split(/\s+/).some(w=>w.startsWith(token)))score+=35;else if(aliases.includes(token))score+=22;else if(description.includes(token))score+=12;else if(words.some(w=>near(token,w)))score+=8;else return 0;}return score;
}
function catalogSearch(query){const tokens=tokensFor(query);return PAGES.map(entry=>({...entry,score:scoreEntry(entry,tokens)})).filter(e=>e.score>0).sort((a,b)=>b.score-a.score).slice(0,5);}
module.exports={PAGES,normalize,tokensFor,scoreEntry,catalogSearch};
