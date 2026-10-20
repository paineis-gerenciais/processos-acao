// Regras de cálculo do modelo de dados, seção 4. Funções puras.
import {
  paraMs, dataSaoPaulo, diasEntre, isoValido, limitesPeriodo, periodoDaData, proximoPeriodo,
  rotuloPeriodo, frequenciaValida, somarDias,
} from './periodos.js';

export const CARENCIA_APURACAO_DIAS = 15;
export const LIMITE_NUMERO = 1000000000;

export const STATUS = ['nao_iniciada', 'em_andamento', 'concluida', 'travada'];
export const ROTULO_STATUS = {
  nao_iniciada: 'Não iniciada', em_andamento: 'Em andamento', concluida: 'Concluída', travada: 'Travada',
};
export const POLARIDADES = ['maior_melhor', 'menor_melhor'];
export const ROTULO_POLARIDADE = { maior_melhor: 'Maior é melhor', menor_melhor: 'Menor é melhor' };
export const UNIDADES = ['percentual', 'contagem', 'dias', 'reais'];
export const ROTULO_UNIDADE = { percentual: '%', contagem: 'Contagem', dias: 'Dias', reais: 'R$' };

// ----- Números (4.2) -----

/** Interpreta texto no formato brasileiro (dígitos e uma vírgula). Retorna { vazio } | { ok, valor, centesimos } | { ok:false, erro }. */
export function analisarNumero(texto) {
  const t = typeof texto === 'string' ? texto.trim() : '';
  if (t === '') return { ok: true, vazio: true, valor: null };
  if (t.startsWith('-')) return { ok: false, erro: 'O valor não pode ser negativo.' };
  const m = /^(\d+)(?:,(\d{1,2}))?$/.exec(t);
  if (!m) return { ok: false, erro: 'Digite só números, com vírgula nos decimais. Exemplo: 12,5.' };
  const centesimos = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  if (centesimos > LIMITE_NUMERO * 100) return { ok: false, erro: 'O valor máximo é 1000000000.' };
  return { ok: true, vazio: false, valor: centesimos / 100, centesimos };
}

export function paraCentesimos(n) {
  return Math.round(n * 100);
}

/** 75 -> "75,00". */
export function formatarNumero(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return (paraCentesimos(n) / 100).toFixed(2).replace('.', ',');
}

export function formatarValor(n, unidade) {
  const base = formatarNumero(n);
  if (base === '') return '';
  if (unidade === 'percentual') return `${base}%`;
  if (unidade === 'dias') return `${base} dias`;
  if (unidade === 'reais') return `R$ ${base}`;
  return base;
}

function formatarDiferenca(n, unidade) {
  const base = formatarNumero(Math.abs(n));
  if (unidade === 'percentual') return `${base} p.p.`;
  if (unidade === 'dias') return `${base} dias`;
  if (unidade === 'reais') return `R$ ${base}`;
  return base;
}

// ----- Valor da medição (4.3) -----

/** numerador ÷ denominador × 100, 2 casas, meio para cima, em aritmética inteira. null se inválido. */
export function calcularValor(numerador, denominador) {
  if (typeof numerador !== 'number' || typeof denominador !== 'number') return null;
  if (!(numerador >= 0) || !(denominador > 0)) return null;
  const n = BigInt(paraCentesimos(numerador));
  const d = BigInt(paraCentesimos(denominador));
  if (d === 0n) return null;
  // valor em centésimos = n * 100 * 100 / d ; arredonda meio para cima: floor((2*a + d) / (2*d))
  const a = n * 10000n;
  const centesimos = (2n * a + d) / (2n * d);
  return Number(centesimos) / 100;
}

/** QD-12: com numerador e denominador, o valor gravado deve ser o recalculado. */
export function valorConsistente(medicao) {
  if (medicao.numerador === null || medicao.numerador === undefined) return true;
  if (medicao.denominador === null || medicao.denominador === undefined) return true;
  const esperado = calcularValor(medicao.numerador, medicao.denominador);
  return esperado !== null && paraCentesimos(esperado) === paraCentesimos(medicao.valor);
}

// ----- Última medição, situação e variação (4.4, 4.5) -----

/** Última medição = maior `periodo` (não o maior `registradoEm`). */
export function ultimaMedicao(medicoes) {
  let ult = null;
  for (const m of medicoes) if (ult === null || m.periodo > ult.periodo) ult = m;
  return ult;
}

const SEM_DADO = {
  sem_polaridade: 'Sem polaridade', sem_linha_base: 'Sem linha de base', sem_meta: 'Sem meta', sem_medicao: 'Sem medição',
};

function vazio(v) {
  return v === null || v === undefined;
}

/** Situação em relação à meta. Pré-condições na ordem do modelo; a primeira que falha define o texto. */
export function situacaoMeta(ind, medicoes) {
  const ultima = ultimaMedicao(medicoes);
  let codigo = null;
  if (!ind.polaridade) codigo = 'sem_polaridade';
  else if (vazio(ind.linhaBase)) codigo = 'sem_linha_base';
  else if (vazio(ind.meta)) codigo = 'sem_meta';
  else if (!ultima) codigo = 'sem_medicao';
  if (codigo) return { codigo, texto: SEM_DADO[codigo], exibeSituacao: false, ultima, distancia: null };
  const v = paraCentesimos(ultima.valor);
  const m = paraCentesimos(ind.meta);
  const atingida = ind.polaridade === 'maior_melhor' ? v >= m : v <= m;
  return {
    codigo: atingida ? 'atingida' : 'nao_atingida',
    texto: atingida ? 'Meta atingida' : 'Meta não atingida',
    exibeSituacao: true,
    ultima,
    distancia: atingida ? null : Math.abs(m - v) / 100,
  };
}

/** Variação contra a linha de base. Exige base e ao menos uma medição (não exige meta). */
export function variacaoContraBase(ind, ultima) {
  if (vazio(ind.linhaBase) || !ultima) return null;
  const dif = (paraCentesimos(ultima.valor) - paraCentesimos(ind.linhaBase)) / 100;
  let sentido = null;
  if (ind.polaridade === 'maior_melhor' || ind.polaridade === 'menor_melhor') {
    if (dif === 0) sentido = 'sem_variacao';
    else if (ind.polaridade === 'maior_melhor') sentido = dif > 0 ? 'melhorou' : 'piorou';
    else sentido = dif < 0 ? 'melhorou' : 'piorou';
  } else if (dif === 0) sentido = 'sem_variacao';
  const sinal = dif > 0 ? '+' : dif < 0 ? '−' : '';
  const numero = `${sinal}${formatarDiferenca(dif, ind.unidade)}`;
  const palavra = { melhorou: 'Melhorou', piorou: 'Piorou', sem_variacao: 'Sem variação' }[sentido] ?? null;
  return { valor: dif, sentido, numero, texto: palavra ? `${numero} · ${palavra}` : numero };
}

function fecharFrase(t) {
  return t.endsWith('.') ? t : `${t}.`;
}

/** "Última medição: 75,00% (2º tri./2026). Meta não atingida: faltam 5,00 p.p. Melhorou 13,00 p.p. desde a linha de base." */
export function fraseResumo(ind, medicoes) {
  const sit = situacaoMeta(ind, medicoes);
  const ultima = sit.ultima;
  if (!ultima) return 'Nenhuma medição registrada.';
  const partes = [`Última medição: ${formatarValor(ultima.valor, ind.unidade)} (${rotuloPeriodo(ind.frequencia, ultima.periodo)}).`];
  if (sit.exibeSituacao) {
    partes.push(sit.codigo === 'atingida'
      ? 'Meta atingida.'
      : fecharFrase(`Meta não atingida: faltam ${formatarDiferenca(sit.distancia, ind.unidade)}`));
  } else {
    partes.push(`${sit.texto}: situação em relação à meta não exibida.`);
  }
  const v = variacaoContraBase(ind, ultima);
  if (v) {
    if (v.sentido === 'melhorou' || v.sentido === 'piorou') {
      partes.push(fecharFrase(`${v.sentido === 'melhorou' ? 'Melhorou' : 'Piorou'} ${formatarDiferenca(v.valor, ind.unidade)} desde a linha de base`));
    } else if (v.sentido === 'sem_variacao') {
      partes.push('Sem variação desde a linha de base.');
    } else {
      partes.push(fecharFrase(`Variação desde a linha de base: ${v.numero}`));
    }
  }
  return partes.join(' ');
}

// ----- Ação atrasada (4.6) -----

/** Atrasada: prazo preenchido, prazo < hoje e status diferente de Concluída (status vazio conta). */
export function acaoAtrasada(acao, hoje) {
  if (!acao.prazo || !isoValido(acao.prazo)) return { atrasada: false, dias: 0 };
  if (acao.status === 'concluida') return { atrasada: false, dias: 0 };
  if (acao.prazo >= hoje) return { atrasada: false, dias: 0 };
  return { atrasada: true, dias: diasEntre(acao.prazo, hoje) };
}

// ----- Apuração atrasada e série (4.7) -----

function inicioAcompanhamento(ind, hoje) {
  if (ind.linhaBaseReferencia && isoValido(ind.linhaBaseReferencia)) return ind.linhaBaseReferencia;
  const ms = paraMs(ind.criadoEm);
  return ms === null ? hoje : dataSaoPaulo(ms);
}

/**
 * Períodos esperados (início posterior ao início do acompanhamento, até o período em curso),
 * os vencidos (hoje > último dia + carência), as lacunas e a apuração atrasada.
 */
export function apuracao(ind, medicoes, hoje, carencia = CARENCIA_APURACAO_DIAS) {
  if (!frequenciaValida(ind.frequencia)) {
    return { calculavel: false, motivo: 'sem_frequencia', esperados: [], vencidos: [], lacunas: [], atrasada: false };
  }
  const freq = ind.frequencia;
  const inicio = inicioAcompanhamento(ind, hoje);
  const medidos = new Set(medicoes.map((m) => m.periodo));
  const atual = periodoDaData(freq, hoje);
  const esperados = [];
  let p = periodoDaData(freq, inicio);
  let guarda = 0;
  while (p && p <= atual && guarda++ < 2000) {
    if (limitesPeriodo(freq, p).inicio > inicio) esperados.push(p);
    p = proximoPeriodo(freq, p);
  }
  const vencido = (id) => hoje > somarDias(limitesPeriodo(freq, id).fim, carencia);
  const vencidos = esperados.filter(vencido);
  const lacunas = vencidos.filter((id) => !medidos.has(id));
  const maisRecente = vencidos.length ? vencidos[vencidos.length - 1] : null;
  const atrasada = maisRecente !== null && !medidos.has(maisRecente);
  return {
    calculavel: true,
    motivo: null,
    esperados,
    vencidos,
    lacunas,
    exigivel: vencidos.length > 0,
    maisRecente,
    medidoNoMaisRecente: maisRecente !== null && medidos.has(maisRecente),
    atrasada,
    periodo: atrasada ? maisRecente : null,
    dias: atrasada ? diasEntre(somarDias(limitesPeriodo(freq, maisRecente).fim, carencia), hoje) : 0,
  };
}

/** Linhas da série em ordem cronológica: períodos esperados até o atual mais os medidos. */
export function serieDoIndicador(ind, medicoes, hoje, carencia = CARENCIA_APURACAO_DIAS) {
  if (!frequenciaValida(ind.frequencia)) return [];
  const ap = apuracao(ind, medicoes, hoje, carencia);
  const porPeriodo = new Map(medicoes.map((m) => [m.periodo, m]));
  const ids = new Set([...ap.esperados, ...porPeriodo.keys()]);
  const vencidos = new Set(ap.vencidos);
  return [...ids].sort().map((periodo) => ({
    periodo,
    medicao: porPeriodo.get(periodo) ?? null,
    vencido: vencidos.has(periodo),
    emCurso: !porPeriodo.has(periodo) && !vencidos.has(periodo),
  }));
}
