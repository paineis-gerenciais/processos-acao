// Resumo no topo de cada tela (RF-10) e métricas M1 a M3 (especificação, seção 4).
import { h, plural } from './dom.js';
import { estado } from './estado.js';
import { resumoPlano, resumoIndicadores, metricaM1, metricaM2, metricaM3, JANELA_M1_DIAS } from '../dominio/metricas.js';
import { STATUS } from '../dominio/calculos.js';
import { formatarDataBR, rotuloPeriodo } from '../dominio/periodos.js';
import { seloStatus, seloAtrasada } from './selos.js';

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
  return h('div', { class: 'bloco bloco-metrica', 'data-k': `m-${id}` },
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

export function resumoDoPlano(procs, hoje) {
  const r = resumoPlano(procs, hoje);
  const m1 = metricaM1(procs, hoje);
  const tabelaM1 = tabelaSimples(['Processo', 'Última alteração do plano'],
    m1.pendentes.map((l) => [l.nome, l.data ? `${formatarDataBR(l.data)} (há ${plural(l.dias, 'dia', 'dias')})` : 'Nunca atualizado']),
    'Todos os processos estão com o plano atualizado.');
  return h('section', { 'aria-labelledby': 'tit-resumo', class: 'secao-resumo' },
    h('h2', { id: 'tit-resumo', class: 'sr' }, 'Resumo'),
    h('dl', { class: 'resumo' },
      item('Processos', r.processos),
      item('Ações', r.acoes),
      ...STATUS.map((s) => h('div', { class: 'bloco' }, h('dt', null, seloStatus(s)), h('dd', null, String(r.porStatus[s])))),
      item('Sem status', r.semStatus),
      h('div', { class: 'bloco' }, h('dt', null, seloAtrasada('Atrasadas')), h('dd', null, String(r.atrasadas), h('small', null, 'pode incluir ações de outros status'))),
      item('Sem responsável', r.semResponsavel),
      item('Melhorias sem ação', r.melhoriasSemAcao),
      blocoMetrica('m1', 'M1: plano atualizado', m1, `${m1.x} de ${m1.y} processos com plano atualizado nos últimos ${JANELA_M1_DIAS} dias`, '', 'processo', tabelaM1)));
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
    h('dl', { class: 'resumo' },
      item('Processos', r.processos),
      item('Indicadores', r.indicadores),
      item('Meta atingida', r.atingida),
      item('Meta não atingida', r.naoAtingida),
      item('Sem dado para a situação', r.semDado, 'sem linha de base, meta, polaridade ou medição'),
      item('Sem linha de base', r.semLinhaBase),
      item('Sem meta', r.semMeta),
      item('Apuração atrasada', r.apuracaoAtrasada),
      blocoMetrica('m2', 'M2: com base e meta', m2, `${m2.x} de ${m2.y} indicadores com linha de base e meta`, '', 'indicador', tabelaM2),
      blocoMetrica('m3', 'M3: medidos no período', m3, `${m3.x} de ${m3.y} indicadores medidos no período`,
        ` ${plural(m3.semFrequencia, 'indicador sem frequência fora', 'indicadores sem frequência fora')} do cálculo.`, 'indicador exigível', tabelaM3)));
}
