// Visão de impressão do card expandido (RF-14, especificação seção 12). Somente leitura: campos viram texto.
import { h, plural } from './dom.js';
import { estado, hoje } from './estado.js';
import {
  ROTULO_STATUS, ROTULO_POLARIDADE, ROTULO_UNIDADE, formatarNumero, formatarValor, acaoAtrasada, serieDoIndicador, situacaoMeta,
  variacaoContraBase, fraseResumo, apuracao,
} from '../dominio/calculos.js';
import { FREQUENCIAS, dataHoraBR, formatarDataBR, dataSaoPaulo, rotuloPeriodo } from '../dominio/periodos.js';
import { avisosIndicador } from '../dominio/validacao.js';
import { seloStatus, seloAtrasada } from './selos.js';
import { graficoDaSerie } from './grafico.js';
import { ativoPorId } from './estado.js';

const P = 'Pendente';
const txt = (v) => (v === null || v === undefined || v === '' ? P : String(v));

function cabecalhoDaFolha() {
  return h('div', { class: 'folha-topo' },
    h('div', { class: 'logos' },
      h('img', { class: 'logo-img esq', src: 'logo-esquerda.png', alt: 'Logo esquerda' }),
      h('span', { class: 'sep', 'aria-hidden': 'true' }),
      h('img', { class: 'logo-img dir', src: 'logo-direita.png', alt: 'Logo direita' })));
}

function planoImpresso(p) {
  const h0 = hoje();
  return [
    h('dl', { class: 'definicoes duas-col' },
      h('dt', null, 'Dono do processo'), h('dd', null, txt(p.dono)),
      h('dt', null, 'Embaixador'), h('dd', null, txt(p.embaixador))),
    p.melhorias.length ? null : h('p', null, 'Este processo ainda não tem ações.'),
    ...p.melhorias.map((m) => h('section', { class: 'melhoria-impressa' },
      h('h3', null, `Melhoria de origem: ${m.nome}`, m.acoes.length ? '' : ' (sem ação)'),
      m.acoes.length
        ? h('table', { class: 'tabela-impressa' },
          h('thead', null, h('tr', null, ...['Ação', 'Responsável', 'Prazo', 'Como se verifica', 'Status'].map((c) => h('th', { scope: 'col' }, c)))),
          h('tbody', null, ...m.acoes.map((a) => {
            const atraso = acaoAtrasada(a, h0);
            return h('tr', null,
              h('td', null, txt(a.acao)), h('td', null, txt(a.responsavel)),
              h('td', null, a.prazo ? formatarDataBR(a.prazo) : P, atraso.atrasada ? [' ', seloAtrasada(`Atrasada há ${plural(atraso.dias, 'dia', 'dias')}`)] : null),
              h('td', null, txt(a.comoSeVerifica)),
              h('td', null, a.status ? seloStatus(a.status) : P));
          })))
        : null)),
  ];
}

function indicadoresImpressos(p) {
  const h0 = hoje();
  if (!p.indicadores.length) return [h('p', null, 'Este processo ainda não tem indicadores.')];
  return p.indicadores.map((i, n) => {
    const serie = serieDoIndicador(i, i.medicoes, h0);
    const sit = situacaoMeta(i, i.medicoes);
    const ap = apuracao(i, i.medicoes, h0);
    const idResumo = `frase-imp-${n}`;
    const pct = i.unidade === 'percentual';
    return h('section', { class: 'indicador-impresso' },
      h('h3', null, `Indicador: ${i.nome}`),
      h('dl', { class: 'definicoes duas-col' },
        h('dt', null, 'Fórmula'), h('dd', null, txt(i.formula)),
        h('dt', null, 'O que mede'), h('dd', null, txt(i.oQueMede)),
        h('dt', null, 'Responsável pela medição'), h('dd', null, txt(i.responsavel)),
        h('dt', null, 'Fonte'), h('dd', null, txt(i.fonte)),
        h('dt', null, 'Polaridade'), h('dd', null, i.polaridade ? ROTULO_POLARIDADE[i.polaridade] : P),
        h('dt', null, 'Frequência'), h('dd', null, i.frequencia ? FREQUENCIAS[i.frequencia].rotulo : P),
        h('dt', null, 'Unidade'), h('dd', null, i.unidade ? ROTULO_UNIDADE[i.unidade] : P),
        h('dt', null, 'Linha de base'), h('dd', null, i.linhaBase === null ? P : formatarValor(i.linhaBase, i.unidade)),
        h('dt', null, 'Referência da linha de base'), h('dd', null, i.linhaBaseReferencia ? formatarDataBR(i.linhaBaseReferencia) : P),
        h('dt', null, 'Meta'), h('dd', null, i.meta === null ? P : formatarValor(i.meta, i.unidade)),
        h('dt', null, 'Prazo da meta'), h('dd', null, i.prazoMeta ? formatarDataBR(i.prazoMeta) : 'Não informado')),
      h('p', null, h('strong', null, `Situação: ${sit.texto}. `), h('span', { id: idResumo }, fraseResumo(i, i.medicoes))),
      ap.atrasada ? h('p', null, h('strong', null, `Apuração atrasada: período ${rotuloPeriodo(i.frequencia, ap.periodo)} sem medição (${plural(ap.dias, 'dia', 'dias')}).`)) : null,
      ...avisosIndicador(i).map((a) => h('p', null, `Aviso: ${a}`)),
      h('div', { class: 'grafico-impressao' }, graficoDaSerie(i, serie, idResumo, false)),
      serie.length
        ? h('table', { class: 'tabela-impressa' },
          h('thead', null, h('tr', null, ...['Período', 'Valor', pct ? 'Numerador' : null, pct ? 'Denominador' : null, 'Variação', 'Registrado em'].filter(Boolean).map((c) => h('th', { scope: 'col' }, c)))),
          h('tbody', null, ...serie.map((l) => {
            const m = l.medicao;
            const v = m ? variacaoContraBase(i, m) : null;
            return h('tr', null,
              h('td', null, rotuloPeriodo(i.frequencia, l.periodo)),
              h('td', null, m ? formatarValor(m.valor, i.unidade) : (l.vencido ? 'Sem medição' : 'Em curso, sem medição')),
              pct ? h('td', null, m && m.numerador !== null ? formatarNumero(m.numerador) : '—') : null,
              pct ? h('td', null, m && m.denominador !== null ? formatarNumero(m.denominador) : '—') : null,
              h('td', null, v ? v.texto : '—'),
              h('td', null, m && m.registradoEm ? formatarDataBR(dataSaoPaulo(m.registradoEm)) : '—'));
          })))
        : null);
  });
}

export function visaoDeImpressao(tela, processoId) {
  const p = ativoPorId(processoId);
  if (!p) {
    return h('div', { class: 'impressao', 'data-k': 'impressao' },
      h('div', { class: 'barra-comandos nao-imprime' }, h('a', { class: 'btn fant', href: `#/${tela}` }, 'Voltar')),
      h('div', { class: 'aviso-campo info', role: 'status' }, h('p', null, 'Este processo foi excluído ou não existe.')));
  }
  const agora = new Date();
  const titulo = tela === 'plano' ? `Plano de implantação: «${p.nome}»` : `Indicadores: «${p.nome}»`;
  const alterado = tela === 'plano' ? p.planoAtualizadoEm : p.indicadoresAtualizadoEm;
  const rotuloAlteracao = tela === 'plano' ? 'Última alteração do plano' : 'Última alteração dos indicadores';
  return h('div', { class: 'impressao', 'data-k': 'impressao' },
    h('div', { class: 'barra-comandos nao-imprime' },
      h('button', { type: 'button', class: 'btn prim', 'data-acao': 'imprimir-agora' }, 'Imprimir ou salvar em PDF'),
      h('a', { class: 'btn fant', href: `#/${tela}/${p.id}` }, 'Voltar')),
    h('article', { class: 'folha' },
      cabecalhoDaFolha(),
      h('h1', { id: 'titulo-impressao', tabindex: '-1' }, titulo),
      h('p', { class: 'meta-impressao' },
        `Impresso em ${dataHoraBR(agora).replace(' ', ' às ')} · Dados do painel em tempo real · ${rotuloAlteracao}: ${dataHoraBR(alterado) ?? 'nunca alterado'}`,
        estado.ambienteTeste ? ' · Dados fictícios' : ''),
      ...(tela === 'plano' ? planoImpresso(p) : indicadoresImpressos(p)),
      h('p', { class: 'rodape-impressao' }, `Processo «${p.nome}» · Retrato de ${dataHoraBR(agora)}`)));
}

let ultimaRegra = null;

/** Rodapé de cada página com numeração (regra @page inserida pelo CSSOM, sem estilo embutido). */
export function prepararRodapeDePagina(nome) {
  try {
    const folha = [...document.styleSheets].find((f) => f.href && f.href.includes('css/'));
    if (!folha) return;
    if (ultimaRegra) {
      for (let k = folha.cssRules.length - 1; k >= 0; k -= 1) if (folha.cssRules[k] === ultimaRegra) folha.deleteRule(k);
    }
    const seguro = String(nome).replace(/[\\"\n\r]/g, ' ').slice(0, 120);
    const pos = folha.insertRule(`@page { @bottom-center { content: "Processo «${seguro}» · Página " counter(page) " de " counter(pages); font-size: 9pt; } }`, folha.cssRules.length);
    ultimaRegra = folha.cssRules[pos];
  } catch {
    // Sem suporte a margem de página: vale o rodapé dentro da folha.
  }
}
