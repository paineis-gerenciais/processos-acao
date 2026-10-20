// Itens ativos, exclusão lógica, desfazer e purga. Funções puras.
// Arquitetura, seção 3.5. Toda função de cálculo, contagem, resumo e métrica recebe dados já filtrados por ativos().
import { paraMs, periodoFormatoValido } from './periodos.js';
import { classificarErro } from './erros.js';

export const PRAZO_DESFAZER_DIAS = 35;
const MS_DIA = 86400000;

function ordenar(lista) {
  return lista.sort((a, b) => {
    const o = (a.ordem ?? 0) - (b.ordem ?? 0);
    if (o !== 0) return o;
    const c = (paraMs(a.criadoEm) ?? 0) - (paraMs(b.criadoEm) ?? 0);
    if (c !== 0) return c;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function comoLista(mapa) {
  return Object.entries(mapa ?? {}).filter(([, v]) => v && typeof v === 'object').map(([id, v]) => ({ ...v, id }));
}

export function estaExcluido(item) {
  return Boolean(item && item.excluido);
}

/** O processo está excluído (logicamente)? */
export function processoExcluido(proc) {
  return estaExcluido(proc);
}

/**
 * Visão ativa de um processo: itens não excluídos. Uma ação está ativa se não está excluída e a
 * melhoria dela existe e não está excluída (mudança M2). Retorna null se o processo está excluído.
 */
export function ativos(proc) {
  if (!proc || estaExcluido(proc)) return null;
  const todasMelhorias = comoLista(proc.melhorias);
  const melhoriasAtivas = ordenar(todasMelhorias.filter((m) => !estaExcluido(m)));
  const idsMelhoriasAtivas = new Set(melhoriasAtivas.map((m) => m.id));
  const acoes = ordenar(comoLista(proc.acoes).filter((a) => !estaExcluido(a) && idsMelhoriasAtivas.has(a.melhoriaId)));
  const melhorias = melhoriasAtivas.map((m) => ({ ...m, acoes: acoes.filter((a) => a.melhoriaId === m.id) }));
  const indicadores = ordenar(comoLista(proc.indicadores).filter((i) => !estaExcluido(i))).map((i) => ({
    ...i,
    medicoes: comoLista(i.medicoes).filter((m) => !estaExcluido(m)).map(({ id, ...resto }) => ({ ...resto, periodo: id }))
      .sort((a, b) => (a.periodo < b.periodo ? -1 : a.periodo > b.periodo ? 1 : 0)),
  }));
  return {
    id: proc.id,
    nome: proc.nome ?? '',
    dono: proc.dono ?? null,
    embaixador: proc.embaixador ?? null,
    origemId: proc.origemId ?? null,
    criadoEm: proc.criadoEm ?? null,
    planoAtualizadoEm: proc.planoAtualizadoEm ?? null,
    indicadoresAtualizadoEm: proc.indicadoresAtualizadoEm ?? null,
    melhorias,
    acoes,
    indicadores,
  };
}

/** Processos ativos (visão filtrada), na ordem recebida. */
export function processosAtivos(docs) {
  return docs.map(ativos).filter(Boolean);
}

/** Contagens do aviso de confirmação de exclusão (sobre itens ativos). */
export function contagemProcesso(ativo) {
  return {
    melhorias: ativo.melhorias.length,
    acoes: ativo.acoes.length,
    indicadores: ativo.indicadores.length,
    medicoes: ativo.indicadores.reduce((s, i) => s + i.medicoes.length, 0),
  };
}

export function contagemMelhoria(melhoria) {
  return { acoes: melhoria.acoes.length };
}

export function contagemIndicador(indicador) {
  return { medicoes: indicador.medicoes.length };
}

/** Número de entradas já ocupadas no mapa (inclui excluídas até a purga). */
export function ocupacao(proc, mapa, indicadorId = null) {
  if (mapa === 'medicoes') return Object.keys(proc.indicadores?.[indicadorId]?.medicoes ?? {}).length;
  return Object.keys(proc[mapa] ?? {}).length;
}

// ----- Lixeira (itens excluídos recentes) -----

/**
 * Medição excluída que não cabe mais no indicador (R2): o período não é do formato da frequência atual, ou o
 * indicador deixou de ser percentual e a medição guarda numerador/denominador. Não pode ser restaurada.
 */
export function medicaoForaDoFormato(indicador, medicao) {
  if (!periodoFormatoValido(indicador.frequencia, medicao.id)) return true;
  const temFracao = (medicao.numerador ?? null) !== null || (medicao.denominador ?? null) !== null;
  return temFracao && indicador.unidade !== 'percentual';
}

function infoExclusao(excluido, agora, prazoDias) {
  const em = paraMs(excluido.em) ?? agora;
  const ate = em + prazoDias * MS_DIA;
  return { em, ate, vencido: agora > ate, lote: excluido.lote ?? null };
}

/**
 * Lista de excluídos que ainda podem ser restaurados, do mais recente ao mais antigo.
 * Cada entrada: { tipo, processoId, processoNome, alvo|null, rotulo, em, ate, lote, restauravel, motivo, acoesJuntas }.
 */
export function excluidosRecentes(docs, agora, prazoDias = PRAZO_DESFAZER_DIAS) {
  const saida = [];
  for (const proc of docs) {
    if (estaExcluido(proc)) {
      const x = infoExclusao(proc.excluido, agora, prazoDias);
      if (!x.vencido) {
        saida.push({
          tipo: 'processo', processoId: proc.id, processoNome: proc.nome, alvo: null, rotulo: proc.nome,
          ...x, restauravel: true, motivo: null,
        });
      }
      continue;
    }
    const melhorias = comoLista(proc.melhorias);
    const melhoriasPorId = new Map(melhorias.map((m) => [m.id, m]));
    const acoesPorMelhoria = new Map();
    for (const a of comoLista(proc.acoes)) {
      if (!estaExcluido(a)) acoesPorMelhoria.set(a.melhoriaId, (acoesPorMelhoria.get(a.melhoriaId) ?? 0) + 1);
    }
    for (const m of melhorias) {
      if (!estaExcluido(m)) continue;
      const x = infoExclusao(m.excluido, agora, prazoDias);
      if (x.vencido) continue;
      saida.push({
        tipo: 'melhoria', processoId: proc.id, processoNome: proc.nome, alvo: { tipo: 'melhoria', id: m.id, periodo: null },
        rotulo: m.nome ?? '', ...x, restauravel: true, motivo: null, acoesJuntas: acoesPorMelhoria.get(m.id) ?? 0,
      });
    }
    for (const a of comoLista(proc.acoes)) {
      if (!estaExcluido(a)) continue;
      const x = infoExclusao(a.excluido, agora, prazoDias);
      if (x.vencido) continue;
      const mel = melhoriasPorId.get(a.melhoriaId);
      const bloqueada = !mel || estaExcluido(mel);
      saida.push({
        tipo: 'acao', processoId: proc.id, processoNome: proc.nome, alvo: { tipo: 'acao', id: a.id, periodo: null },
        rotulo: a.acao ?? '', ...x, restauravel: !bloqueada,
        motivo: bloqueada ? `Restaure antes a melhoria «${mel?.nome ?? ''}».` : null,
      });
    }
    for (const i of comoLista(proc.indicadores)) {
      const indExcluido = estaExcluido(i);
      if (indExcluido) {
        const x = infoExclusao(i.excluido, agora, prazoDias);
        if (!x.vencido) {
          saida.push({
            tipo: 'indicador', processoId: proc.id, processoNome: proc.nome, alvo: { tipo: 'indicador', id: i.id, periodo: null },
            rotulo: i.nome ?? '', ...x, restauravel: true, motivo: null,
            medicoesJuntas: comoLista(i.medicoes).filter((m) => !estaExcluido(m)).length,
          });
        }
      }
      for (const m of comoLista(i.medicoes)) {
        if (!estaExcluido(m)) continue;
        const x = infoExclusao(m.excluido, agora, prazoDias);
        if (x.vencido) continue;
        const foraDoFormato = medicaoForaDoFormato(i, m);
        saida.push({
          tipo: 'medicao', processoId: proc.id, processoNome: proc.nome, alvo: { tipo: 'medicao', id: i.id, periodo: m.id },
          rotulo: `${i.nome ?? ''} · ${m.id}`, ...x, restauravel: !indExcluido && !foraDoFormato,
          motivo: indExcluido ? `Restaure antes o indicador «${i.nome ?? ''}».`
            : foraDoFormato ? 'Esta medição não combina mais com a frequência ou a unidade atual do indicador e não pode ser restaurada. Ela será apagada no fim do prazo.' : null,
        });
      }
    }
  }
  return saida.sort((a, b) => b.em - a.em);
}

/**
 * Operações de purga vencidas, na ordem segura: as ações de uma melhoria vencida antes da melhoria.
 * Cada operação: { tipo: 'item', processoId, alvo } ou { tipo: 'processo', processoId }.
 */
export function purgaveis(docs, agora, prazoDias = PRAZO_DESFAZER_DIAS) {
  const ops = [];
  const vencido = (x) => x && x.excluido && infoExclusao(x.excluido, agora, prazoDias).vencido
    && paraMs(x.excluido.em) !== null;
  for (const proc of docs) {
    if (estaExcluido(proc)) {
      if (vencido(proc)) ops.push({ tipo: 'processo', processoId: proc.id });
      continue;
    }
    const melhorias = comoLista(proc.melhorias);
    const idsMelhorias = new Set(melhorias.map((m) => m.id));
    const venc = new Set(melhorias.filter(vencido).map((m) => m.id));
    const acoes = comoLista(proc.acoes);
    const item = (tipo, id, periodo = null) => ({ tipo: 'item', processoId: proc.id, alvo: { tipo, id, periodo } });
    for (const a of acoes) {
      const orfa = !idsMelhorias.has(a.melhoriaId);
      if (venc.has(a.melhoriaId) || orfa || vencido(a)) ops.push(item('acao', a.id));
    }
    for (const m of melhorias) if (venc.has(m.id)) ops.push(item('melhoria', m.id));
    for (const i of comoLista(proc.indicadores)) {
      if (vencido(i)) {
        ops.push(item('indicador', i.id));
        continue;
      }
      for (const m of comoLista(i.medicoes)) if (vencido(m)) ops.push(item('medicao', i.id, m.id));
    }
  }
  return ops;
}

/**
 * Executa as operações de purga uma a uma com `aplicar(op)` (promessa). Uma falha é registrada e a purga segue (R2);
 * só uma falha geral (limite de cota, sem conexão) interrompe. Retorna { feitas, falhas, interrompida }.
 */
export async function executarPurga(ops, aplicar) {
  const falhas = [];
  let feitas = 0;
  let interrompida = false;
  for (const op of ops) {
    try {
      await aplicar(op);
      feitas += 1;
    } catch (erro) {
      const tipo = classificarErro(erro);
      falhas.push({ op, tipo });
      if (tipo === 'limite' || tipo === 'sem_conexao') {
        interrompida = true;
        break;
      }
    }
  }
  return { feitas, falhas, interrompida };
}
