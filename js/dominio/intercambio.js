// Exportação e importação em JSON (issue #5). Funções puras: montam o arquivo e o plano de gravações; quem grava é a UI.
// A importação só acrescenta: nunca altera nem apaga o que existe. As regras do Firestore validam de novo cada gravação.
import { CAMPOS, LIMITES_ITENS, normalizarNome, RE_CONTROLE } from './validacao.js';
import { ativos, ocupacao } from './lixeira.js';
import { paraCentesimos, calcularValor, LIMITE_NUMERO } from './calculos.js';
import { isoValido, frequenciaValida, periodoFormatoValido, periodoIniciado } from './periodos.js';

export const FORMATO = 'processos-acao/intercambio';
export const VERSAO = 1;
export const AVISO = 'Contém dados pessoais de servidores — uso restrito';
export const TAMANHO_MAXIMO = 2 * 1024 * 1024;
const MAX_PROCESSOS = 200;
/** Teto de gravações por importação: protege a cota diária gratuita do Firestore (parecer da issue #5, S1). */
export const MAX_GRAVACOES = 1000;

const CAMPOS_ACAO = ['acao', 'responsavel', 'prazo', 'comoSeVerifica', 'status'];
const CAMPOS_INDICADOR = ['nome', 'formula', 'oQueMede', 'responsavel', 'fonte', 'polaridade', 'frequencia', 'unidade',
  'linhaBase', 'linhaBaseReferencia', 'meta', 'prazoMeta'];

// ----- Exportação -----

function exportarProcesso(a) {
  return {
    nome: a.nome,
    dono: a.dono ?? null,
    embaixador: a.embaixador ?? null,
    melhorias: a.melhorias.map((m) => ({
      nome: m.nome,
      acoes: m.acoes.map((x) => Object.fromEntries(CAMPOS_ACAO.map((c) => [c, x[c] ?? null]))),
    })),
    indicadores: a.indicadores.map((i) => ({
      ...Object.fromEntries(CAMPOS_INDICADOR.map((c) => [c, i[c] ?? null])),
      medicoes: i.medicoes.map((m) => ({
        periodo: m.periodo, valor: m.valor, numerador: m.numerador ?? null, denominador: m.denominador ?? null,
      })),
    })),
  };
}

/** Arquivo de exportação a partir de processos já filtrados por ativos() (sem itens excluídos). */
export function montarExportacao(listaAtivos, agora = new Date()) {
  return {
    formato: FORMATO,
    versao: VERSAO,
    aviso: AVISO,
    geradoEm: agora.toISOString(),
    processos: listaAtivos.map(exportarProcesso),
  };
}

/** Nome do arquivo: processos-acao-<todos|nome>-AAAA-MM-DD.json, só com [a-z0-9-]. */
export function nomeDoArquivo(nomeProcesso, hoje) {
  const base = nomeProcesso === null ? 'todos' : normalizarNome(nomeProcesso).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'processo';
  return `processos-acao-${base}-${hoje}.json`;
}

// ----- Leitura e validação do arquivo -----

class ErroArquivo extends Error {}

function falhar(onde, msg) {
  throw new ErroArquivo(`${onde}: ${msg}`);
}

function objeto(v, onde) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) falhar(onde, 'esperado um objeto.');
  return v;
}

function lista(v, onde, max) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) falhar(onde, 'esperada uma lista.');
  if (v.length > max) falhar(onde, `no máximo ${max} itens.`);
  return v;
}

function texto(v, def, onde, obrigatorio) {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (obrigatorio) falhar(onde, 'campo obrigatório vazio.');
    return null;
  }
  if (typeof v !== 'string') falhar(onde, 'esperado um texto.');
  const t = v.trim();
  if (RE_CONTROLE.test(t)) falhar(onde, 'o texto tem caracteres que o painel não aceita.');
  if (t.length > def.max) falhar(onde, `máximo de ${def.max} caracteres (tem ${t.length}).`);
  return t;
}

function valorDoCampo(def, v, onde, ctx) {
  if (def.tipo === 'texto') return texto(v, def, onde, def.obrigatorio);
  if (v === undefined || v === null || v === '') return null;
  if (def.tipo === 'data') {
    if (!isoValido(v)) falhar(onde, 'data inválida; use AAAA-MM-DD.');
    if (def.naoFutura && v > ctx.hoje) falhar(onde, 'a data não pode ser no futuro.');
    return v;
  }
  if (def.tipo === 'numero') return numero(v, onde);
  if (def.tipo === 'lista') {
    if (!def.valores.includes(v)) falhar(onde, `valor fora da lista (${def.valores.join(', ')}).`);
    return v;
  }
  return falhar(onde, 'campo desconhecido.');
}

function numero(v, onde) {
  if (typeof v !== 'number' || !Number.isFinite(v)) falhar(onde, 'esperado um número.');
  if (v < 0) falhar(onde, 'o valor não pode ser negativo.');
  if (v > LIMITE_NUMERO) falhar(onde, `o valor máximo é ${LIMITE_NUMERO}.`);
  const arred = paraCentesimos(v) / 100;
  if (Math.abs(arred - v) > 1e-9) falhar(onde, 'no máximo 2 casas decimais.');
  return arred;
}

function lerMedicao(m, ind, onde, hoje) {
  objeto(m, onde);
  const periodo = m.periodo;
  if (!periodoFormatoValido(ind.frequencia, periodo)) falhar(onde, `período «${periodo}» fora do formato da frequência.`);
  if (!periodoIniciado(ind.frequencia, periodo, hoje)) falhar(onde, `o período ${periodo} ainda não começou.`);
  const temFracao = (m.numerador ?? null) !== null || (m.denominador ?? null) !== null;
  if (temFracao) {
    if (ind.unidade !== 'percentual') falhar(onde, 'numerador e denominador só valem para indicador em %.');
    const n = numero(m.numerador, `${onde}, numerador`);
    const d = numero(m.denominador, `${onde}, denominador`);
    if (d <= 0) falhar(onde, 'o denominador precisa ser maior que zero.');
    return { periodo, dados: { numerador: n, denominador: d, valor: calcularValor(n, d) } };
  }
  return { periodo, dados: { numerador: null, denominador: null, valor: numero(m.valor, `${onde}, valor`) } };
}

function lerProcesso(p, onde, hoje) {
  objeto(p, onde);
  const proc = {
    nome: texto(p.nome, CAMPOS.processo.nome, `${onde}, nome`, true),
    dono: texto(p.dono, CAMPOS.processo.dono, `${onde}, dono`, false),
    embaixador: texto(p.embaixador, CAMPOS.processo.embaixador, `${onde}, embaixador`, false),
    melhorias: [],
    indicadores: [],
  };
  const nomesMelhorias = new Set();
  lista(p.melhorias, `${onde}, melhorias`, LIMITES_ITENS.melhorias).forEach((m, k) => {
    const om = `${onde}, melhoria ${k + 1}`;
    objeto(m, om);
    const nome = texto(m.nome, CAMPOS.melhoria.nome, `${om}, nome`, true);
    if (nomesMelhorias.has(normalizarNome(nome))) falhar(om, `melhoria «${nome}» repetida no arquivo.`);
    nomesMelhorias.add(normalizarNome(nome));
    const acoes = lista(m.acoes, `${om}, ações`, LIMITES_ITENS.acoes).map((x, j) => {
      const oa = `${om}, ação ${j + 1}`;
      objeto(x, oa);
      return Object.fromEntries(CAMPOS_ACAO.map((c) => [c, valorDoCampo(CAMPOS.acao[c], x[c], `${oa}, ${c}`, { hoje })]));
    });
    proc.melhorias.push({ nome, acoes });
  });
  lista(p.indicadores, `${onde}, indicadores`, LIMITES_ITENS.indicadores).forEach((i, k) => {
    const oi = `${onde}, indicador ${k + 1}`;
    objeto(i, oi);
    const ind = Object.fromEntries(CAMPOS_INDICADOR.map((c) => [c, valorDoCampo(CAMPOS.indicador[c], i[c], `${oi}, ${c}`, { hoje })]));
    const brutas = lista(i.medicoes, `${oi}, medições`, LIMITES_ITENS.medicoes);
    if (brutas.length && !frequenciaValida(ind.frequencia)) falhar(oi, 'medições exigem a frequência preenchida.');
    const periodos = new Set();
    ind.medicoes = brutas.map((m, j) => {
      const med = lerMedicao(m, ind, `${oi}, medição ${j + 1}`, hoje);
      if (periodos.has(med.periodo)) falhar(`${oi}, medição ${j + 1}`, `período ${med.periodo} repetido.`);
      periodos.add(med.periodo);
      return med;
    });
    proc.indicadores.push(ind);
  });
  return proc;
}

/**
 * Lê o texto do arquivo. Retorna { ok: true, processos } (valores já normalizados) ou { ok: false, erro }.
 * Aceita só o formato de intercâmbio desta versão.
 */
export function lerArquivo(conteudo, hoje) {
  let dados;
  try {
    dados = JSON.parse(conteudo);
  } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido.' };
  }
  try {
    objeto(dados, 'Arquivo');
    if (dados.formato !== FORMATO) falhar('Arquivo', 'não é uma exportação deste painel (campo "formato").');
    if (dados.versao !== VERSAO) falhar('Arquivo', `versão ${dados.versao} não suportada (esperada ${VERSAO}).`);
    const brutos = lista(dados.processos, 'Arquivo, processos', MAX_PROCESSOS);
    if (!brutos.length) falhar('Arquivo', 'nenhum processo no arquivo.');
    const processos = brutos.map((p, k) => lerProcesso(p, `Processo ${k + 1}`, hoje));
    const nomes = new Set();
    for (const p of processos) {
      const n = normalizarNome(p.nome);
      if (nomes.has(n)) falhar('Arquivo', `processo «${p.nome}» repetido.`);
      nomes.add(n);
    }
    return { ok: true, processos };
  } catch (e) {
    if (e instanceof ErroArquivo) return { ok: false, erro: e.message };
    throw e;
  }
}

// ----- Plano de gravações -----

function contagemVazia() {
  return { processos: 0, melhorias: 0, acoes: 0, indicadores: 0, medicoes: 0, pessoas: 0 };
}

function dadosDoIndicador(ind, ordem) {
  const d = Object.fromEntries(CAMPOS_INDICADOR.map((c) => [c, ind[c]]));
  return { ...d, ordem };
}

function contarTextos(acoes) {
  const mapa = new Map();
  for (const x of acoes) mapa.set(normalizarNome(x.acao), (mapa.get(normalizarNome(x.acao)) ?? 0) + 1);
  return mapa;
}

function maiorOrdem(mapa, filtro = () => true) {
  let max = 0;
  for (const v of Object.values(mapa ?? {})) if (v && filtro(v) && typeof v.ordem === 'number') max = Math.max(max, v.ordem);
  return max;
}

/** Gravações de itens de um processo do arquivo sobre um documento (existente ou vazio). Muta `total`, `ignorados` e `avisos`. */
function planoDeItens(proc, doc, ref, novoId, total, ignorados, avisos) {
  const ops = [];
  const a = doc ? ativos(doc) : { melhorias: [], indicadores: [] };
  const ocup = {
    melhorias: doc ? ocupacao(doc, 'melhorias') : 0,
    acoes: doc ? ocupacao(doc, 'acoes') : 0,
    indicadores: doc ? ocupacao(doc, 'indicadores') : 0,
  };
  const limite = (mapa, nome) => {
    ocup[mapa] += 1;
    if (ocup[mapa] > LIMITES_ITENS[mapa]) {
      throw new ErroArquivo(`«${proc.nome}»: o limite de ${LIMITES_ITENS[mapa]} ${nome} por processo seria ultrapassado (itens excluídos ocupam vaga por até 35 dias).`);
    }
  };
  let ordemMelhoria = maiorOrdem(doc?.melhorias);
  for (const m of proc.melhorias) {
    const existente = a.melhorias.find((x) => normalizarNome(x.nome) === normalizarNome(m.nome));
    let mid;
    let ordemAcao;
    let textos;
    if (existente) {
      mid = existente.id;
      ordemAcao = maiorOrdem(doc.acoes, (x) => x.melhoriaId === mid);
      textos = contarTextos(existente.acoes);
    } else {
      limite('melhorias', 'melhorias');
      mid = novoId();
      ordemMelhoria += 1;
      ops.push({ ref, rotulo: `melhoria «${m.nome}»`, alvo: { tipo: 'melhoria', id: mid, periodo: null }, dados: { nome: m.nome, ordem: ordemMelhoria } });
      total.melhorias += 1;
      ordemAcao = 0;
      textos = new Map();
    }
    for (const x of m.acoes) {
      // Cada ação existente "consome" uma do arquivo com o mesmo texto: ações repetidas de propósito sobrevivem à ida e volta.
      const n = normalizarNome(x.acao);
      if ((textos.get(n) ?? 0) > 0) {
        textos.set(n, textos.get(n) - 1);
        ignorados.push(`Ação «${x.acao}» já existe na melhoria «${m.nome}».`);
        continue;
      }
      limite('acoes', 'ações');
      ordemAcao += 1;
      ops.push({ ref, rotulo: `ação «${x.acao}»`, alvo: { tipo: 'acao', id: novoId(), periodo: null }, dados: { melhoriaId: mid, ...x, ordem: ordemAcao } });
      total.acoes += 1;
    }
  }
  let ordemIndicador = maiorOrdem(doc?.indicadores);
  for (const ind of proc.indicadores) {
    const existente = a.indicadores.find((x) => normalizarNome(x.nome) === normalizarNome(ind.nome));
    let iid;
    let ocupMed;
    let medidos;
    if (existente) {
      iid = existente.id;
      if (ind.medicoes.length && (existente.frequencia !== ind.frequencia || existente.unidade !== ind.unidade)) {
        ignorados.push(`Medições do indicador «${ind.nome}»: frequência ou unidade diferente da do painel.`);
        continue;
      }
      ocupMed = ocupacao(doc, 'medicoes', iid);
      medidos = new Set(Object.keys(doc.indicadores[iid].medicoes ?? {}).filter((p) => !doc.indicadores[iid].medicoes[p]?.excluido));
      // Período com medição excluída na lixeira: a regra aceita recriar por cima (substitui a excluída).
    } else {
      limite('indicadores', 'indicadores');
      iid = novoId();
      ordemIndicador += 1;
      ops.push({ ref, rotulo: `indicador «${ind.nome}»`, alvo: { tipo: 'indicador', id: iid, periodo: null }, dados: dadosDoIndicador(ind, ordemIndicador) });
      total.indicadores += 1;
      ocupMed = 0;
      medidos = new Set();
    }
    const ocupadosAntes = existente ? new Set(Object.keys(doc.indicadores[iid].medicoes ?? {})) : new Set();
    for (const med of ind.medicoes) {
      if (medidos.has(med.periodo)) {
        ignorados.push(`Medição de ${med.periodo} do indicador «${ind.nome}»: o período já tem medição.`);
        continue;
      }
      if (ocupadosAntes.has(med.periodo)) {
        avisos.push(`Medição de ${med.periodo} do indicador «${ind.nome}» substitui uma medição excluída, que deixa de poder ser restaurada.`);
      } else {
        ocupMed += 1;
        if (ocupMed > LIMITES_ITENS.medicoes) throw new ErroArquivo(`«${ind.nome}»: o limite de ${LIMITES_ITENS.medicoes} medições seria ultrapassado.`);
      }
      ops.push({ ref, rotulo: `medição ${med.periodo} de «${ind.nome}»`, alvo: { tipo: 'medicao', id: iid, periodo: med.periodo }, dados: med.dados });
      total.medicoes += 1;
    }
  }
  return ops;
}

/**
 * Plano para "Importar JSON" (topo): cada processo do arquivo vira um processo novo. Processo com nome igual a um
 * existente é ignorado (para completar um existente, usa-se "Importar para este processo").
 * ctx: { existentes: documentos ativos (visão ativos()), novoId }.
 * Retorna { ok, novos: [{ ref, nome, dono, embaixador }], ops, total, ignorados } ou { ok: false, erro }.
 */
export function planejarNovos(processos, ctx) {
  const nomesExistentes = new Set(ctx.existentes.map((p) => normalizarNome(p.nome)));
  const total = contagemVazia();
  const ignorados = [];
  const avisos = [];
  const novos = [];
  const ops = [];
  try {
    processos.forEach((p, k) => {
      if (nomesExistentes.has(normalizarNome(p.nome))) {
        ignorados.push(`Processo «${p.nome}»: já existe um processo com este nome. Use "Importar para este processo" nele.`);
        return;
      }
      const ref = `novo:${k}`;
      novos.push({ ref, nome: p.nome, dono: p.dono, embaixador: p.embaixador });
      total.processos += 1;
      ops.push(...planoDeItens(p, null, ref, ctx.novoId, total, ignorados, avisos));
    });
  } catch (e) {
    if (e instanceof ErroArquivo) return { ok: false, erro: e.message };
    throw e;
  }
  return comTeto({ ok: true, novos, ops, total, ignorados, avisos });
}

/** Total de gravações do plano (processos novos, campos de pessoa e itens) e recusa acima do teto. */
export function totalDeGravacoes(plano) {
  return (plano.novos?.length ?? 0) + (plano.pessoas?.length ?? 0) + plano.ops.length;
}

function comTeto(plano) {
  const n = totalDeGravacoes(plano);
  if (n > MAX_GRAVACOES) {
    return { ok: false, erro: `O arquivo geraria ${n} gravações; o máximo por importação é ${MAX_GRAVACOES}, para não esgotar a cota diária do serviço. Divida o arquivo (por exemplo, um processo por vez).` };
  }
  return { ...plano, gravacoes: n };
}

/**
 * Plano para "Importar para este processo": usa o único processo do arquivo ou, se houver vários, o de mesmo nome
 * deste processo (assim o arquivo de "Importar JSON" completa um processo que ficou pela metade). Acrescenta
 * melhorias, ações, indicadores e medições; preenche dono e embaixador só se estiverem vazios. Nada existente é alterado.
 * ctx: { doc: documento cru do processo, novoId }.
 */
export function planejarAcrescimo(processos, ctx) {
  const doc = ctx.doc;
  const p = processos.length === 1 ? processos[0] : processos.find((x) => normalizarNome(x.nome) === normalizarNome(doc.nome));
  if (!p) {
    return { ok: false, erro: `O arquivo tem ${processos.length} processos e nenhum se chama «${doc.nome}». Use um arquivo com um só processo ou com um de mesmo nome.` };
  }
  const total = contagemVazia();
  const ignorados = [];
  const avisos = [];
  const pessoas = [];
  for (const campo of ['dono', 'embaixador']) {
    if (!p[campo]) continue;
    if (doc[campo]) {
      if (normalizarNome(doc[campo]) !== normalizarNome(p[campo])) ignorados.push(`${campo === 'dono' ? 'Dono' : 'Embaixador'} «${p[campo]}»: o processo já tem «${doc[campo]}».`);
    } else {
      pessoas.push({ campo, valor: p[campo] });
      total.pessoas += 1;
    }
  }
  try {
    const ops = planoDeItens(p, doc, doc.id, ctx.novoId, total, ignorados, avisos);
    return comTeto({ ok: true, nomeNoArquivo: p.nome, pessoas, ops, total, ignorados, avisos });
  } catch (e) {
    if (e instanceof ErroArquivo) return { ok: false, erro: e.message };
    throw e;
  }
}
