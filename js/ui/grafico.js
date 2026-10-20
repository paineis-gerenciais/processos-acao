// Gráfico de linha da série de medições (RF-13), em SVG montado com createElementNS.
// Cores e traços vêm de classes do CSS (tokens). O gráfico é informativo: a tabela é a alternativa acessível.
import { h, svg } from './dom.js';
import { formatarNumero, ROTULO_POLARIDADE } from '../dominio/calculos.js';
import { rotuloPeriodo } from '../dominio/periodos.js';

const MAX_PERIODOS = 12;

function maximoDoEixo(valores, unidade) {
  const maior = Math.max(0, ...valores);
  if (unidade === 'percentual') return Math.max(100, Math.ceil(maior / 25) * 25);
  if (maior <= 0) return 4;
  const passo = 10 ** Math.floor(Math.log10(maior));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * passo >= maior) return m * passo;
  return 10 * passo;
}

function sufixoEixo(unidade) {
  return { percentual: '%', dias: 'dias', reais: 'R$', contagem: '' }[unidade] ?? '';
}

/**
 * serie: linhas de serieDoIndicador(). Retorna o bloco do gráfico (sem a tabela).
 * idResumo: id do elemento com a frase-resumo (nome acessível do gráfico).
 */
export function graficoDaSerie(ind, serie, idResumo, compacto) {
  if (!ind.frequencia) return h('p', { class: 'vazio-grafico' }, 'Escolha a frequência na ficha para registrar medições.');
  const medidas = serie.filter((l) => l.medicao);
  if (!medidas.length) return h('p', { class: 'vazio-grafico' }, 'Nenhuma medição registrada. Registre a primeira abaixo.');

  const linhas = serie.slice(-MAX_PERIODOS);
  const truncado = serie.length > MAX_PERIODOS;
  // Tamanho do desenho próximo do tamanho na tela, para o texto (14 unidades) não encolher abaixo de ~12 px (QA-06).
  const W = compacto ? 320 : 480;
  const H = compacto ? 240 : 270;
  const E = 46;
  const D = 14;
  const T = 18;
  const B = 56;
  const largura = W - E - D;
  const altura = H - T - B;
  const valores = [...linhas.filter((l) => l.medicao).map((l) => l.medicao.valor)];
  if (ind.linhaBase !== null && ind.linhaBase !== undefined) valores.push(ind.linhaBase);
  if (ind.meta !== null && ind.meta !== undefined) valores.push(ind.meta);
  const max = maximoDoEixo(valores, ind.unidade);
  const y = (v) => T + altura * (1 - v / max);
  const passo = largura / linhas.length;
  const x = (i) => E + passo * (i + 0.5);

  const filhos = [];
  const intervalos = 4;
  for (let k = 0; k <= intervalos; k += 1) {
    const v = (max / intervalos) * k;
    filhos.push(svg('line', { class: k === 0 ? 'g-eixo' : 'g-grade', x1: E, x2: W - D, y1: y(v), y2: y(v) }));
    filhos.push(svg('text', { class: 'g-txt', x: E - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(Math.round(v * 100) / 100).replace('.', ',')));
  }
  filhos.push(svg('line', { class: 'g-eixo', x1: E, x2: E, y1: T, y2: y(0) }));
  const sufixo = sufixoEixo(ind.unidade);
  if (sufixo) filhos.push(svg('text', { class: 'g-txt', x: 4, y: 12 }, sufixo));

  linhas.forEach((l, i) => {
    // Rótulos espaçados a partir do último período, para não se sobreporem no texto maior.
    const mostrar = (linhas.length - 1 - i) % (compacto ? 3 : 2) === 0;
    if (!mostrar) return;
    filhos.push(svg('text', { class: 'g-txt', x: x(i), y: y(0) + 16, 'text-anchor': 'middle' }, rotuloPeriodo(ind.frequencia, l.periodo)));
    if (!l.medicao) {
      filhos.push(svg('text', { class: 'g-txt g-txt-fraco', x: x(i), y: y(0) + 30, 'text-anchor': 'middle' }, l.vencido ? 'sem dado' : 'em curso'));
    }
  });

  if (ind.linhaBase !== null && ind.linhaBase !== undefined) {
    filhos.push(svg('line', { class: 'g-base', x1: E, x2: W - D, y1: y(ind.linhaBase), y2: y(ind.linhaBase) }));
    filhos.push(svg('text', { class: 'g-txt g-txt-base', x: E + 4, y: y(ind.linhaBase) + 14 }, `Linha de base: ${formatarNumero(ind.linhaBase)}`));
  }
  if (ind.meta !== null && ind.meta !== undefined) {
    const polaridade = ind.polaridade ? ` · ${ROTULO_POLARIDADE[ind.polaridade].toLowerCase()}` : '';
    filhos.push(svg('line', { class: 'g-meta', x1: E, x2: W - D, y1: y(ind.meta), y2: y(ind.meta) }));
    filhos.push(svg('text', { class: 'g-txt g-txt-meta', x: W - D - 4, y: y(ind.meta) - 5, 'text-anchor': 'end' }, `Meta: ${formatarNumero(ind.meta)}${polaridade}`));
  }

  // Série: segmentos contínuos entre períodos consecutivos medidos; lacuna não liga nem lança zero.
  let atual = [];
  const segmentos = [];
  linhas.forEach((l, i) => {
    if (l.medicao) atual.push([x(i), y(l.medicao.valor)]);
    else if (atual.length) { segmentos.push(atual); atual = []; }
  });
  if (atual.length) segmentos.push(atual);
  for (const s of segmentos) {
    if (s.length > 1) filhos.push(svg('polyline', { class: 'g-serie', points: s.map((p) => `${p[0]},${p[1]}`).join(' ') }));
  }
  let ultimoIndice = -1;
  linhas.forEach((l, i) => {
    if (!l.medicao) return;
    ultimoIndice = i;
    filhos.push(svg('circle', { class: 'g-ponto', cx: x(i), cy: y(l.medicao.valor), r: 4.5 }));
  });
  if (ultimoIndice >= 0) {
    const v = linhas[ultimoIndice].medicao.valor;
    filhos.push(svg('text', { class: 'g-txt g-txt-valor', x: x(ultimoIndice), y: y(v) - 9, 'text-anchor': 'middle' }, formatarNumero(v)));
  }

  const pendencias = [];
  if (ind.linhaBase === null || ind.linhaBase === undefined) pendencias.push('Sem linha de base: preencha a ficha para comparar.');
  if (ind.meta === null || ind.meta === undefined) pendencias.push('Sem meta: preencha a ficha para comparar.');

  return h('div', { class: 'grafico-bloco' },
    h('div', { class: 'grafico', role: 'img', 'aria-labelledby': idResumo },
      svg('svg', { viewBox: `0 0 ${W} ${H}`, focusable: 'false', 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' }, ...filhos)),
    truncado ? h('p', { class: 'ajuda' }, 'Mostrando os 12 períodos mais recentes; a tabela traz todos.') : null,
    ...pendencias.map((t) => h('p', { class: 'ajuda' }, t)));
}
