// Resumos por tela (RF-10) e métricas M1 a M3 (modelo de dados, seção 6). Funções puras sobre dados já filtrados por ativos().
import { dataSaoPaulo, diasEntre, paraMs } from './periodos.js';
import { acaoAtrasada, apuracao, situacaoMeta, STATUS } from './calculos.js';

export const JANELA_M1_DIAS = 35;
export const METAS = { m1: 80, m2: 100, m3: 80 };
export const VERSAO_REGRAS = 1;

/** Percentual inteiro, meio para cima; null se o denominador for zero (nunca 0% nem 100%). */
export function percentual(x, y) {
  if (!y) return null;
  return Math.floor((x * 200 + y) / (2 * y));
}

export const ROTULO_PENDENCIA = {
  formula: 'fórmula', oQueMede: 'o que mede', responsavel: 'responsável', fonte: 'fonte', polaridade: 'polaridade',
  frequencia: 'frequência', unidade: 'unidade', linhaBase: 'linha de base', linhaBaseReferencia: 'referência da linha de base',
  meta: 'meta',
};

/** Campos da ficha vazios (QD-15). */
export function pendenciasDoIndicador(ind) {
  return Object.keys(ROTULO_PENDENCIA).filter((c) => ind[c] === null || ind[c] === undefined || ind[c] === '');
}

/** Contagens do Plano (RF-10, 4.1). */
export function resumoPlano(procs, hoje) {
  const r = {
    processos: procs.length, acoes: 0, porStatus: Object.fromEntries(STATUS.map((s) => [s, 0])),
    semStatus: 0, atrasadas: 0, semResponsavel: 0, melhoriasSemAcao: 0,
  };
  for (const p of procs) {
    for (const a of p.acoes) {
      r.acoes += 1;
      if (STATUS.includes(a.status)) r.porStatus[a.status] += 1;
      else r.semStatus += 1;
      if (acaoAtrasada(a, hoje).atrasada) r.atrasadas += 1;
      if (!a.responsavel) r.semResponsavel += 1;
    }
    r.melhoriasSemAcao += p.melhorias.filter((m) => m.acoes.length === 0).length;
  }
  return r;
}

/** Situação e pendências de um indicador ativo, reaproveitadas pelo card e pelos resumos. */
export function analiseIndicador(ind, hoje) {
  return {
    situacao: situacaoMeta(ind, ind.medicoes),
    apuracao: apuracao(ind, ind.medicoes, hoje),
    pendencias: pendenciasDoIndicador(ind),
    semMedicao: ind.medicoes.length === 0,
  };
}

/** Contagens de Indicadores (RF-10, 4.2). */
export function resumoIndicadores(procs, hoje) {
  const r = {
    processos: procs.length, indicadores: 0, atingida: 0, naoAtingida: 0, semDado: 0,
    semLinhaBase: 0, semMeta: 0, semFrequencia: 0, semPolaridade: 0, semMedicao: 0, apuracaoAtrasada: 0,
  };
  for (const p of procs) {
    for (const i of p.indicadores) {
      const a = analiseIndicador(i, hoje);
      r.indicadores += 1;
      if (a.situacao.codigo === 'atingida') r.atingida += 1;
      else if (a.situacao.codigo === 'nao_atingida') r.naoAtingida += 1;
      else r.semDado += 1;
      if (a.pendencias.includes('linhaBase')) r.semLinhaBase += 1;
      if (a.pendencias.includes('meta')) r.semMeta += 1;
      if (a.pendencias.includes('frequencia')) r.semFrequencia += 1;
      if (a.pendencias.includes('polaridade')) r.semPolaridade += 1;
      if (a.semMedicao) r.semMedicao += 1;
      if (a.apuracao.atrasada) r.apuracaoAtrasada += 1;
    }
  }
  return r;
}

/** M1: processos com plano atualizado nos últimos 35 dias / todos os processos. */
export function metricaM1(procs, hoje) {
  const linhas = procs.map((p) => {
    const ms = paraMs(p.planoAtualizadoEm);
    const data = ms === null ? null : dataSaoPaulo(ms);
    const dias = data === null ? null : diasEntre(data, hoje);
    return { processoId: p.id, nome: p.nome, data, dias, ok: dias !== null && dias <= JANELA_M1_DIAS };
  });
  const x = linhas.filter((l) => l.ok).length;
  const pendentes = linhas.filter((l) => !l.ok).sort((a, b) => {
    if (a.data === null && b.data === null) return a.nome.localeCompare(b.nome, 'pt-BR');
    if (a.data === null) return -1;
    if (b.data === null) return 1;
    return a.data < b.data ? -1 : a.data > b.data ? 1 : 0;
  });
  return { x, y: procs.length, pct: percentual(x, procs.length), meta: METAS.m1, pendentes };
}

/** M2: indicadores com linha de base e meta preenchidas (zero vale) / todos os indicadores. */
export function metricaM2(procs) {
  let x = 0;
  let y = 0;
  const pendentes = [];
  for (const p of procs) {
    for (const i of p.indicadores) {
      y += 1;
      const falta = ['linhaBase', 'meta'].filter((c) => i[c] === null || i[c] === undefined);
      if (falta.length === 0) x += 1;
      else pendentes.push({ processoId: p.id, processo: p.nome, indicador: i.nome, falta: falta.map((c) => ROTULO_PENDENCIA[c]) });
    }
  }
  return { x, y, pct: percentual(x, y), meta: METAS.m2, pendentes };
}

/** M3: indicadores exigíveis cujo período vencido mais recente tem medição. */
export function metricaM3(procs, hoje) {
  let x = 0;
  let y = 0;
  let semFrequencia = 0;
  const pendentes = [];
  for (const p of procs) {
    for (const i of p.indicadores) {
      const ap = apuracao(i, i.medicoes, hoje);
      if (!ap.calculavel) { semFrequencia += 1; continue; }
      if (!ap.exigivel) continue;
      y += 1;
      if (ap.medidoNoMaisRecente) x += 1;
      else pendentes.push({ processoId: p.id, processo: p.nome, indicador: i.nome, periodo: ap.periodo, dias: ap.dias, frequencia: i.frequencia });
    }
  }
  pendentes.sort((a, b) => b.dias - a.dias);
  return { x, y, pct: percentual(x, y), meta: METAS.m3, semFrequencia, pendentes };
}

/** Conteúdo do retrato diário (arquitetura, seção 3.3). */
export function calcularRetrato(procs, hoje) {
  const m1 = metricaM1(procs, hoje);
  const m2 = metricaM2(procs);
  const m3 = metricaM3(procs, hoje);
  return {
    versaoRegras: VERSAO_REGRAS,
    totalProcessos: procs.length,
    m1: { x: m1.x, y: m1.y },
    m2: { x: m2.x, y: m2.y },
    m3: { x: m3.x, y: m3.y, semFrequencia: m3.semFrequencia },
  };
}

export function retratosIguais(a, b) {
  const chaves = (r) => JSON.stringify([r.versaoRegras, r.totalProcessos, r.m1.x, r.m1.y, r.m2.x, r.m2.y, r.m3.x, r.m3.y, r.m3.semFrequencia]);
  return Boolean(a && b) && chaves(a) === chaves(b);
}

