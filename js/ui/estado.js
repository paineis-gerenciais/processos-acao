// Estado da interface (só em memória) e consultas sobre os dados recebidos.
import { ativos, processosAtivos } from '../dominio/lixeira.js';
import { normalizarNome } from '../dominio/validacao.js';
import { dataSaoPaulo } from '../dominio/periodos.js';
import { acaoAtrasada } from '../dominio/calculos.js';

export const estado = {
  dados: null,                 // camada de dados injetada por main.js
  rota: { tela: 'plano', id: null, ancora: null },
  ambienteTeste: false,
  carregando: true,
  carregandoLento: false,
  erroLeitura: null,           // null | 'sem_conexao' | 'limite' | 'recusado' | 'desconhecido'
  processos: [],               // documentos crus (inclui excluídos)
  recebeuServidor: false,
  doCache: false,
  navegadorOffline: false,
  desdeOffline: null,          // "14:31"
  reconectando: false,
  resultadoReconexao: null,    // null | { tipo: 'ok' | 'erro', quantidade }
  abertos: new Set(),          // `${tela}:${id}`
  busca: '',
  filtro: 'todos',             // 'todos' | 'atrasadas' | 'travadas' (só em memória, sem nome de pessoa)
  sanfonas: new Map(),         // chave de <details> -> aberto (true/false); ausente = padrão da tela
  visiveisCongelados: null,    // ids que passavam no filtro quando a edição começou (mantidos até o foco sair da lista)
  campos: new Map(),           // chave do campo -> estado do campo
  pendencias: new Map(),       // id da gravação -> chave do campo ou rótulo
  confirmacoes: new Set(),     // confirmações no lugar abertas
  formProcesso: null,          // null | { erro }
  formsNovo: new Map(),        // chave do grupo -> { erro }
  formsMedicao: new Map(),     // `${indicadorId}:${periodo}` -> { previa, erros, avisos } (linha do período pendente)
  edicaoMedicao: null,         // { processoId, indicadorId, periodo, modo, erros }
  desfazer: [],                // barras de desfazer: { id, processoId, alvo, rotulo, ate }
  avisosExclusao: new Map(),   // processoId -> { nome } excluídos por outra pessoa
  novos: new Map(),            // processoId -> ms em que apareceu
  valoresAnteriores: new Map(),// chave -> texto do último snapshot
  minhasGravacoes: new Map(),  // chave -> { texto, aceito }
  idsConhecidos: new Set(),
  minhasExclusoes: new Set(),
  ordemCongelada: null,        // ids na ordem exibida enquanto há foco numa lista
  atualizacaoAdiada: 0,
  focoPendente: null,          // seletor a focar após o próximo desenho
  listaExcluidosAberta: false,
  metricasAbertas: new Set(),
  origemImpressao: null,       // tela de onde a impressão foi aberta (volta para ela)
  anuncio: '',
  erroGlobal: null,
  criadosPorMim: new Set(),
  ultimaSincronizacao: null,
  aoRecarregar: null,
};

let agendado = false;
let desenhar = () => {};

export function definirDesenho(fn) {
  desenhar = fn;
}

/** Agenda um redesenho (agrupa várias mudanças no mesmo quadro). */
export function atualizar() {
  if (agendado) return;
  agendado = true;
  queueMicrotask(() => {
    agendado = false;
    desenhar();
  });
}

export function hoje() {
  return dataSaoPaulo(new Date());
}

export function procPorId(id) {
  return estado.processos.find((p) => p.id === id) ?? null;
}

export function ativoPorId(id) {
  const p = procPorId(id);
  return p ? ativos(p) : null;
}

/** Processos ativos em ordem alfabética estável (ou congelada enquanto há foco numa lista). */
export function listaAtiva() {
  const lista = processosAtivos(estado.processos);
  const ordenada = lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) || (a.id < b.id ? -1 : 1));
  if (estado.ordemCongelada) {
    const pos = new Map(estado.ordemCongelada.map((id, i) => [id, i]));
    return ordenada.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
  }
  return ordenada;
}

export function filtrarPorBusca(lista) {
  const q = normalizarNome(estado.busca);
  if (!q) return lista;
  return lista.filter((p) => normalizarNome(p.nome).includes(q));
}

/** Ação atrasada ou travada? Usado pelo filtro "Atrasadas / Travadas" e pelos números dele. */
export function processoTem(p, tipo) {
  const h0 = hoje();
  return p.acoes.some((a) => (tipo === 'atrasadas' ? acaoAtrasada(a, h0).atrasada : a.status === 'travada'));
}

export function contarComAcao(tipo) {
  return processosAtivos(estado.processos).filter((p) => processoTem(p, tipo)).length;
}

/** Aplica o filtro. Enquanto há edição na lista, um cartão que já estava visível permanece (ordem congelada). */
export function filtrarPorEstado(lista) {
  if (estado.filtro === 'todos') return lista;
  return lista.filter((p) => processoTem(p, estado.filtro) || (estado.ordemCongelada && estado.visiveisCongelados?.has(p.id)));
}

/** Nomes dos outros processos ativos (para a regra de unicidade). */
export function outrosNomesDeProcesso(processoId) {
  return processosAtivos(estado.processos).filter((p) => p.id !== processoId).map((p) => p.nome);
}

export function estaOffline() {
  return estado.navegadorOffline || (estado.recebeuServidor && estado.doCache);
}

export function chaveAberto(tela, id) {
  return `${tela}:${id}`;
}

export function anunciar(texto) {
  estado.anuncio = texto;
  atualizar();
}

export function totalNaoGravados() {
  let n = 0;
  for (const e of estado.campos.values()) if (e.tipo === 'nao_gravado') n += 1;
  return n;
}
