// Resumo no topo de cada tela (RF-10) e métricas M1 a M3 (especificação, seção 4).
import { h, plural } from './dom.js';
import { estado } from './estado.js';
import { resumoPlano, resumoIndicadores, metricaM1, metricaM2, metricaM3, JANELA_M1_DIAS } from '../dominio/metricas.js';
import { STATUS } from '../dominio/calculos.js';
import { formatarDataBR, rotuloPeriodo } from '../dominio/periodos.js';
import { seloStatus } from './selos.js';
import { sanfona } from './compartilhado.js';

function item(rotulo, valor, nota) {
  return h('div', { class: 'bloco' }, h('dt', null, rotulo), h('dd', null, String(valor), nota ? h('small', null, nota) : null));
}

function estadoMeta(m, rotuloEntidade) {
  if (m.pct === null) return `Não calculável: nenhum ${rotuloEntidade} cadastrado.`;
  return m.pct >= m.meta ? 'Meta atingida.' : 'Meta não atingida.';
}

function blocoMetrica(id, titulo, m, textoPrincipal, notaExtra, rotuloEntidade, tabela) {
  const aberto = estado.metricasAbertas.has(id);
  const idTab = `metrica-${id}`;
  const pctTxt = m.pct === null ? '' : ` (${m.pct}%)`;
  return h('div', { class: 'stat bloco-metrica', 'data-k': `m-${id}` },
    h('dt', null, titulo),
    h('dd', null, `${m.x} de ${m.y}`, h('small', null, `${textoPrincipal}${pctTxt}. Meta: ${m.meta}%. ${estadoMeta(m, rotuloEntidade)}${notaExtra ?? ''}`),
      h('button', { type: 'button', class: 'btn fant btn-pequeno', 'data-acao': 'alternar-metrica', 'data-id': id, 'aria-expanded': aberto ? 'true' : 'false', 'aria-controls': idTab },
        aberto ? 'Ocultar' : 'Ver quais', h('span', { class: 'sr' }, ` ${titulo}`)),
      h('div', { id: idTab, class: 'metrica-tabela', hidden: !aberto }, aberto ? tabela : null)));
}

function tabelaSimples(cabecalhos, linhas, vazio) {
  if (!linhas.length) return h('p', { class: 'ajuda' }, vazio);
  return h('table', { class: 'tabela' },
    h('thead', null, h('tr', null, ...cabecalhos.map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', null, ...linhas.map((l) => h('tr', null, ...l.map((c, i) => h('td', { 'data-r': cabecalhos[i] }, c))))));
}

/** Bloco de destaque do resumo curto. `ligacao` = { acao, filtro } faz do rótulo um link para o filtro (D1 do Gate B). */
function destaque(rotulo, valor, nota, ligacao = null) {
  const dt = ligacao
    ? h('dt', null, h('button', { type: 'button', class: 'rotulo-link', 'data-acao': 'filtrar', 'data-filtro': ligacao, 'aria-pressed': estado.filtro === ligacao ? 'true' : 'false' }, rotulo))
    : h('dt', null, rotulo);
  return h('div', { class: 'stat' }, dt, h('dd', null, String(valor), nota ? h('small', null, nota) : null));
}

function todosOsNumeros(...filhos) {
  return sanfona('todos-numeros', 'todos', false, ['Ver todos os números'], h('dl', { class: 'resumo' }, ...filhos));
}

export function resumoDoPlano(procs, hoje) {
  const r = resumoPlano(procs, hoje);
  const m1 = metricaM1(procs, hoje);
  const tabelaM1 = tabelaSimples(['Processo', 'Última alteração do plano'],
    m1.pendentes.map((l) => [l.nome, l.data ? `${formatarDataBR(l.data)} (há ${plural(l.dias, 'dia', 'dias')})` : 'Nunca atualizado']),
    'Todos os processos estão com o plano atualizado.');
  return h('section', { 'aria-labelledby': 'tit-resumo', class: 'secao-resumo' },
    h('h2', { id: 'tit-resumo', class: 'sr' }, 'Resumo'),
    h('dl', { class: 'stats' },
      destaque('Ações atrasadas', r.atrasadas, 'pode incluir ações de outros status', 'atrasadas'),
      destaque('Ações travadas', r.porStatus.travada, null, 'travadas'),
      destaque('Ações sem responsável', r.semResponsavel),
      blocoMetrica('m1', 'M1: plano atualizado', m1, `${m1.x} de ${m1.y} processos com plano atualizado nos últimos ${JANELA_M1_DIAS} dias`, '', 'processo', tabelaM1)),
    todosOsNumeros(
      item('Processos', r.processos),
      item('Ações', r.acoes),
      ...STATUS.map((s) => h('div', { class: 'bloco' }, h('dt', null, seloStatus(s)), h('dd', null, String(r.porStatus[s])))),
      item('Sem status', r.semStatus),
      item('Melhorias sem ação', r.melhoriasSemAcao)));
}

export function resumoDosIndicadores(procs, hoje) {
  const r = resumoIndicadores(procs, hoje);
  const m2 = metricaM2(procs);
  const m3 = metricaM3(procs, hoje);
  const tabelaM2 = tabelaSimples(['Processo', 'Indicador', 'O que falta'],
    m2.pendentes.map((l) => [l.processo, l.indicador, l.falta.join(' e ')]), 'Todos os indicadores têm linha de base e meta.');
  const tabelaM3 = tabelaSimples(['Processo', 'Indicador', 'Período sem medição', 'Dias de atraso'],
    m3.pendentes.map((l) => [l.processo, l.indicador, rotuloPeriodo(l.frequencia, l.periodo), String(l.dias)]), 'Nenhum indicador com apuração atrasada.');
  return h('section', { 'aria-labelledby': 'tit-resumo', class: 'secao-resumo' },
    h('h2', { id: 'tit-resumo', class: 'sr' }, 'Resumo'),
    h('dl', { class: 'stats' },
      destaque('Meta não atingida', r.naoAtingida),
      destaque('Sem dado para a situação', r.semDado, 'sem linha de base, meta, polaridade ou medição'),
      destaque('Apuração atrasada', r.apuracaoAtrasada),
      blocoMetrica('m3', 'M3: medidos no período', m3, `${m3.x} de ${m3.y} indicadores medidos no período`,
        ` ${plural(m3.semFrequencia, 'indicador sem frequência fora', 'indicadores sem frequência fora')} do cálculo.`, 'indicador exigível', tabelaM3)),
    todosOsNumeros(
      item('Processos', r.processos),
      item('Indicadores', r.indicadores),
      item('Meta atingida', r.atingida),
      item('Sem linha de base', r.semLinhaBase),
      item('Sem meta', r.semMeta),
      blocoMetrica('m2', 'M2: com base e meta', m2, `${m2.x} de ${m2.y} indicadores com linha de base e meta`, '', 'indicador', tabelaM2)));
}
