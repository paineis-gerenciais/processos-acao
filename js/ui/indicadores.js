// Tela Indicadores: cards por processo, ficha, situação, gráfico, tabela e registro de medições (RF-04 a RF-06, RF-13).
import { h, plural, idSeguro } from './dom.js';
import { estado, hoje } from './estado.js';
import {
  ROTULO_POLARIDADE, ROTULO_UNIDADE, POLARIDADES, UNIDADES, formatarValor, formatarNumero, situacaoMeta, variacaoContraBase,
  fraseResumo, serieDoIndicador, apuracao,
} from '../dominio/calculos.js';
import { FREQUENCIAS, rotuloPeriodo, periodosPermitidos, dataSaoPaulo, formatarDataBR, periodoDaData, dataHoraBR } from '../dominio/periodos.js';
import { avisosIndicador } from '../dominio/validacao.js';
import { analiseIndicador } from '../dominio/metricas.js';
import { seloSituacao, seloAtrasada, seloPendente, carimbo } from './selos.js';
import { campo, montarChave, textoArmazenado } from './campos.js';
import {
  cabecaDoCard, estaAberto, excluirNoLugar, novoItem, camposDoProcesso, docCru, botoesDoCard, sanfona, totalDePendencias,
  botaoExcluirLinha, linhaDeAvisoDeExclusao,
} from './compartilhado.js';
import { rodapeDoCard } from './plano.js';
import { graficoDaSerie } from './grafico.js';

const AJUDA_SITUACAO = {
  sem_polaridade: 'Escolha a polaridade para ver a situação em relação à meta.',
  sem_linha_base: 'Preencha a linha de base para ver a situação em relação à meta.',
  sem_meta: 'Preencha a meta para ver a situação em relação à meta.',
  sem_medicao: 'Registre a primeira medição para ver a situação em relação à meta.',
};

function compacto() {
  return window.matchMedia('(max-width: 859px)').matches;
}

/** Contagens do processo: situação da meta, pendências e apuração atrasada (a soma das pendências é o "n pendências"). */
export function analiseDoProcesso(p) {
  const h0 = hoje();
  const c = { atingida: 0, nao_atingida: 0, semDado: 0, base: 0, meta: 0, freq: 0, pol: 0, med: 0, atraso: 0 };
  for (const i of p.indicadores) {
    const a = analiseIndicador(i, h0);
    if (a.situacao.codigo === 'atingida') c.atingida += 1;
    else if (a.situacao.codigo === 'nao_atingida') c.nao_atingida += 1;
    else c.semDado += 1;
    if (a.pendencias.includes('linhaBase')) c.base += 1;
    if (a.pendencias.includes('meta')) c.meta += 1;
    if (a.pendencias.includes('frequencia')) c.freq += 1;
    if (a.pendencias.includes('polaridade')) c.pol += 1;
    if (a.semMedicao) c.med += 1;
    if (a.apuracao.atrasada) c.atraso += 1;
  }
  const itens = [];
  if (c.base) itens.push({ n: c.base, texto: `${c.base} sem linha de base` });
  if (c.meta) itens.push({ n: c.meta, texto: `${c.meta} sem meta` });
  if (c.freq) itens.push({ n: c.freq, texto: `${c.freq} sem frequência` });
  if (c.pol) itens.push({ n: c.pol, texto: `${c.pol} sem polaridade` });
  if (c.med) itens.push({ n: c.med, texto: `${c.med} sem medição` });
  return { c, itens, total: itens.reduce((t, x) => t + x.n, 0) };
}

function sinaisFechado(p, an) {
  if (!p.indicadores.length) return [seloPendente('Sem indicador')];
  const { c } = an;
  const lista = [];
  if (estado.novos.has(p.id)) lista.push(h('span', { class: 'selo s-and' }, 'Novo'));
  lista.push(h('span', { class: 'selo s-nao' }, plural(p.indicadores.length, 'indicador', 'indicadores')));
  if (c.atingida) lista.push(seloSituacao('atingida', `Meta atingida ${c.atingida}`));
  if (c.nao_atingida) lista.push(seloSituacao('nao_atingida', `Meta não atingida ${c.nao_atingida}`));
  if (c.semDado) lista.push(seloSituacao('sem_dado', `Sem dado ${c.semDado}`));
  if (c.atraso) lista.push(seloAtrasada(`${c.atraso} com apuração atrasada`));
  lista.push(totalDePendencias(an.total));
  return lista;
}

const CAMPOS_OBRIGATORIOS = [
  ['formula', 'Fórmula'], ['oQueMede', 'O que mede'], ['responsavel', 'Responsável pela medição'], ['fonte', 'Fonte'],
  ['polaridade', 'Polaridade'], ['frequencia', 'Frequência'], ['unidade', 'Unidade'], ['linhaBase', 'Linha de base'],
  ['linhaBaseReferencia', 'Referência da linha de base'], ['meta', 'Meta'],
];

function camposPendentes(i) {
  return CAMPOS_OBRIGATORIOS.filter(([n]) => i[n] === null || i[n] === undefined || i[n] === '').map(([, rotulo]) => rotulo);
}

/** Ficha em <details>: aberta quando falta campo obrigatório, fechada quando completa; a pessoa pode alternar. */
function fichaDoIndicador(pid, i) {
  const doc = docCru(pid);
  const ch = (n) => montarChave(pid, 'indicador', i.id, n);
  const g = (n) => textoArmazenado(doc, ch(n));
  const trava = i.medicoes.length > 0;
  const unidade = i.unidade ? ROTULO_UNIDADE[i.unidade] : null;
  const pend = (n) => i[n] === null || i[n] === undefined || i[n] === '';
  const L = { layout: 'ficha' };
  const faltam = camposPendentes(i);
  const motivo = (campoNome) => `Bloqueada: há ${plural(i.medicoes.length, 'medição', 'medições')}. Exclua as medições antes de mudar ${campoNome}.`;
  return sanfona(`ficha:${i.id}`, 'ficha', faltam.length > 0,
    ['Ficha do indicador', faltam.length
      ? h('span', { class: 'pend-total' }, h('span', { class: 'i', 'aria-hidden': 'true' }, '▲'), ` ${plural(faltam.length, 'campo pendente', 'campos pendentes')}: ${faltam.join(', ')}`)
      : h('span', { class: 'suave small' }, 'completa')],
    h('div', { class: 'ficha-grade' },
      campo({ ...L, chave: ch('formula'), rotulo: 'Fórmula', controle: 'area', gravado: g('formula'), pendente: pend('formula'), ajuda: 'Texto livre; o painel não calcula a fórmula.', classe: 'larga' }),
      campo({ ...L, chave: ch('oQueMede'), rotulo: 'O que mede', controle: 'area', gravado: g('oQueMede'), pendente: pend('oQueMede'), classe: 'larga' }),
      campo({ ...L, chave: ch('responsavel'), rotulo: 'Responsável pela medição', controle: 'texto', gravado: g('responsavel'), pendente: pend('responsavel'), ajuda: 'Nome ou função', dica: 'Nome ou função' }),
      campo({ ...L, chave: ch('fonte'), rotulo: 'Fonte', controle: 'texto', gravado: g('fonte'), pendente: pend('fonte'), ajuda: 'De onde sai o dado', dica: 'De onde sai o dado' }),
      campo({
        ...L, chave: ch('polaridade'), rotulo: 'Polaridade', controle: 'lista', gravado: g('polaridade'), pendente: pend('polaridade'),
        opcoesLista: POLARIDADES.map((v) => ({ valor: v, rotulo: ROTULO_POLARIDADE[v] })), ajuda: 'Maior é melhor ou menor é melhor?',
      }),
      campo({
        ...L, chave: ch('frequencia'), rotulo: 'Frequência', controle: 'lista', gravado: g('frequencia'), pendente: pend('frequencia'),
        opcoesLista: Object.keys(FREQUENCIAS).map((v) => ({ valor: v, rotulo: FREQUENCIAS[v].rotulo })),
        ajuda: 'Mensal costuma bastar; trimestral é o limite.',
        bloqueio: trava ? motivo('a frequência') : null,
      }),
      campo({
        ...L, chave: ch('unidade'), rotulo: 'Unidade', controle: 'lista', gravado: g('unidade'), pendente: pend('unidade'),
        opcoesLista: UNIDADES.map((v) => ({ valor: v, rotulo: ROTULO_UNIDADE[v] })), ajuda: 'Em % o painel oferece numerador e denominador.',
        bloqueio: trava ? motivo('a unidade') : null,
      }),
      campo({ ...L, chave: ch('linhaBase'), rotulo: 'Linha de base', sufixo: unidade, controle: 'texto', inputmode: 'decimal', gravado: g('linhaBase'), pendente: pend('linhaBase'), ajuda: 'Valor de hoje. Sem ele não dá para saber se melhorou. Use vírgula: 62,5', dica: 'Ex.: 62,5' }),
      campo({ ...L, chave: ch('linhaBaseReferencia'), rotulo: 'Referência da linha de base', controle: 'texto', inputmode: 'numeric', gravado: g('linhaBaseReferencia'), pendente: pend('linhaBaseReferencia'), ajuda: 'Último dia coberto pelo valor de hoje. Ex.: 31/12/2026', dica: 'dd/mm/aaaa' }),
      campo({ ...L, chave: ch('meta'), rotulo: 'Meta', sufixo: unidade, controle: 'texto', inputmode: 'decimal', gravado: g('meta'), pendente: pend('meta'), ajuda: 'Valor que se quer alcançar. Use vírgula.', dica: 'Ex.: 80' }),
      campo({ ...L, chave: ch('prazoMeta'), rotulo: 'Prazo da meta', opcional: true, controle: 'texto', inputmode: 'numeric', gravado: g('prazoMeta'), ajuda: 'Dia/mês/ano. Informativo.', dica: 'dd/mm/aaaa' })));
}

function celula(rotulo, ...filhos) {
  return h('td', { 'data-r': rotulo }, ...filhos);
}

const COLS_PERCENTUAL = 6;

function textoNumero(n) {
  return n === null || n === undefined ? '—' : formatarNumero(n);
}

/** Linha de um período sem medição: os campos já estão na linha e "Registrar" grava (D3 do Gate B). `periodo` null = "outro período". */
function linhaPendente(pid, i, linha, percentual, outros) {
  const periodo = linha ? linha.periodo : null;
  const chaveEstado = `${i.id}:${periodo ?? 'outro'}`;
  const guardado = estado.formsMedicao.get(chaveEstado);
  const f = guardado && !guardado.registrado ? guardado : {};
  const idb = `reg-${idSeguro(i.id)}-${idSeguro(periodo ?? 'outro')}`;
  const rot = periodo ? rotuloPeriodo(i.frequencia, periodo) : 'outro período';
  const erro = (n) => (f.erros?.[n] ? h('div', { class: 'estado erro', id: `${idb}-${n}-e`, role: 'alert' }, `✕ ${f.erros[n]}`) : null);
  const inv = (n) => ({ 'aria-invalid': f.erros?.[n] ? 'true' : null, 'aria-describedby': f.erros?.[n] ? `${idb}-${n}-e` : null });
  const entrada = (n, rotulo) => h('div', { class: 'campo' },
    h('label', { for: `${idb}-${n}`, class: 'sr' }, rotulo),
    h('input', { id: `${idb}-${n}`, type: 'text', inputmode: 'decimal', 'data-medicao': n, autocomplete: 'off', ...inv(n) }),
    erro(n));
  const primeira = periodo
    ? celula('Período', h('span', { class: 'mono' }, rot), h('span', { class: 'sr' }, ` (${periodo})`),
      h('div', { class: 'data-txt' }, linha.vencido ? 'Sem medição' : 'Em curso, sem medição'))
    : celula('Período',
      h('div', { class: 'campo' },
        h('label', { for: `${idb}-periodo` }, 'Registrar outro período'),
        h('select', { id: `${idb}-periodo`, 'data-medicao': 'periodo', ...inv('periodo') },
          h('option', { value: '', 'data-k': 'op-vazio' }, 'Escolha'),
          // data-k estável: a escolha acompanha o período, não a posição (outra pessoa pode mudar a lista)
          ...outros.map((p) => h('option', { value: p, 'data-k': `op-${p}` }, `${rotuloPeriodo(i.frequencia, p)} (${p})`))),
        erro('periodo')));
  const valor = celula('Valor',
    entrada('valor', percentual ? 'Valor direto' : 'Valor'),
    h('p', { class: 'previa', role: 'status' }, f.previa ?? ''));
  const linhaTr = h('tr', {
    class: `linha-m sem-medicao${periodo ? '' : ' outro'}`, 'data-k': `medp-${i.id}-${periodo ?? 'outro'}`, 'data-linha-med': '1', 'data-pid': pid, 'data-ind': i.id, 'data-periodo': periodo ?? '',
  },
  primeira,
  percentual ? celula('Numerador', entrada('numerador', 'Numerador')) : null,
  percentual ? celula('Denominador', entrada('denominador', 'Denominador')) : null,
  valor,
  celula('Variação', '—'),
  h('td', { class: 'c-fim', 'data-r': 'Ações' },
    h('button', { type: 'button', class: 'btn prim', 'data-acao': 'medicao-registrar', 'data-pid': pid, 'data-id': i.id, 'data-periodo': periodo ?? '' }, 'Registrar', h('span', { class: 'sr' }, ` ${rot}`))));
  const colunas = percentual ? COLS_PERCENTUAL : 4;
  const avisos = (f.avisos ?? []).length
    ? h('tr', { class: 'aviso-linha', 'data-k': `medav-${i.id}-${periodo ?? 'outro'}` },
      h('td', { colspan: colunas }, ...f.avisos.map((a) => h('div', { class: 'aviso-campo alerta', role: 'status' }, h('p', null, a)))))
    : null;
  return [linhaTr, avisos];
}

function linhaDeMedicao(pid, i, linha, percentual) {
  const ed = estado.edicaoMedicao;
  const editando = ed && ed.indicadorId === i.id && ed.periodo === linha.periodo;
  const rot = rotuloPeriodo(i.frequencia, linha.periodo);
  const m = linha.medicao;
  const registrado = m.registradoEm ? formatarDataBR(dataSaoPaulo(m.registradoEm)) : '—';
  const colunaPeriodo = celula('Período', h('span', { class: 'mono' }, rot), h('span', { class: 'sr' }, ` (${linha.periodo})`),
    h('div', { class: 'data-txt' }, `registrado em ${registrado}`));
  if (editando) {
    const modo = ed.modo;
    const idb = `ed-${idSeguro(i.id)}-${idSeguro(linha.periodo)}`;
    const entrada = (nome, rotulo, valor) => h('div', { class: 'campo' },
      h('label', { for: `${idb}-${nome}`, class: 'sr' }, rotulo),
      h('input', { id: `${idb}-${nome}`, type: 'text', inputmode: 'decimal', value: valor, 'data-edicao': nome, autocomplete: 'off', 'aria-invalid': ed.erros?.[nome] ? 'true' : null, 'aria-describedby': ed.erros?.[nome] ? `${idb}-${nome}-e` : null }),
      ed.erros?.[nome] ? h('div', { class: 'estado erro', id: `${idb}-${nome}-e`, role: 'alert' }, `✕ ${ed.erros[nome]}`) : null);
    const calculado = modo === 'calculado';
    return h('tr', { 'data-k': `med-ed-${i.id}-${linha.periodo}`, class: 'linha-m editando' },
      colunaPeriodo,
      percentual ? celula('Numerador', calculado ? entrada('numerador', 'Numerador', formatarNumero(m.numerador)) : '—') : null,
      percentual ? celula('Denominador', calculado ? entrada('denominador', 'Denominador', formatarNumero(m.denominador)) : '—') : null,
      celula('Valor', calculado ? '—' : entrada('valor', 'Valor', formatarNumero(m.valor))),
      celula('Variação', '—'),
      h('td', { class: 'c-fim', 'data-r': 'Ações' },
        h('button', { type: 'button', class: 'btn prim', 'data-acao': 'medicao-salvar', 'data-id': i.id, 'data-periodo': linha.periodo }, 'Salvar'),
        h('button', { type: 'button', class: 'btn fant', 'data-acao': 'medicao-cancelar' }, 'Cancelar')));
  }
  const v = variacaoContraBase(i, m);
  const conf = `medicao:${pid}:${i.id}:${linha.periodo}`;
  const atributos = { 'data-tipo': 'medicao', 'data-pid': pid, 'data-id': i.id, 'data-periodo': linha.periodo };
  const tr = h('tr', { 'data-k': `med-${i.id}-${linha.periodo}`, class: 'linha-m' },
    colunaPeriodo,
    percentual ? celula('Numerador', textoNumero(m.numerador)) : null,
    percentual ? celula('Denominador', textoNumero(m.denominador)) : null,
    celula('Valor', h('span', { class: 'v-forte' }, formatarValor(m.valor, i.unidade))),
    celula('Variação', v ? v.texto : '—'),
    h('td', { class: 'c-fim', 'data-r': 'Ações' },
      h('button', { type: 'button', class: 'btn fant', 'data-acao': 'medicao-editar', 'data-pid': pid, 'data-id': i.id, 'data-periodo': linha.periodo }, 'Editar', h('span', { class: 'sr' }, ` ${rot}`)),
      botaoExcluirLinha({ chaveConf: conf, rotuloBotao: 'Excluir', rotuloAcessivel: `medição de ${rot}`, atributos })));
  const aviso = linhaDeAvisoDeExclusao({ chaveConf: conf, pergunta: `Excluir a medição de ${rot}?`, colunas: percentual ? COLS_PERCENTUAL : 4, atributos });
  // aviso que não bloqueia (ex.: valor acima de 100%), mantido junto da medição recém-registrada até a pessoa dispensar
  const guardado = estado.formsMedicao.get(`${i.id}:${linha.periodo}`);
  const rasc = guardado && !guardado.registrado ? guardado.rascunho : null;
  const textoRascunho = rasc ? [['numerador', rasc.numerador], ['denominador', rasc.denominador], ['valor', rasc.valor]].filter(([, v]) => v && v.trim()).map(([n, v]) => `${n} «${v}»`).join(', ') : '';
  const avisoDoRascunho = textoRascunho
    ? h('tr', { class: 'aviso-linha', 'data-k': `medrasc-${i.id}-${linha.periodo}` },
      h('td', { colspan: percentual ? COLS_PERCENTUAL : 4 },
        h('div', { class: 'aviso-campo info', role: 'status' },
          h('p', null, `Outra pessoa registrou ${rot} enquanto você digitava. O que você digitou não foi gravado: ${textoRascunho}. Use Editar para mudar a medição existente.`),
          h('button', { type: 'button', class: 'btn fant', 'data-acao': 'dispensar-aviso-medicao', 'data-chave': `${i.id}:${linha.periodo}` }, 'Entendi'))))
    : null;
  const avisoDoRegistro = guardado?.registrado && guardado.avisos?.length
    ? h('tr', { class: 'aviso-linha', 'data-k': `medav-${i.id}-${linha.periodo}` },
      h('td', { colspan: percentual ? COLS_PERCENTUAL : 4 },
        h('div', { class: 'aviso-campo alerta', role: 'status' }, ...guardado.avisos.map((a) => h('p', null, a)),
          h('button', { type: 'button', class: 'btn fant', 'data-acao': 'dispensar-aviso-medicao', 'data-chave': `${i.id}:${linha.periodo}` }, 'Entendi'))))
    : null;
  return [tr, aviso, avisoDoRegistro, avisoDoRascunho];
}

/** Linhas do período: os esperados, os medidos e o período em curso (para o indicador novo ter onde registrar). */
function linhasDoPeriodo(i, serie) {
  if (!i.frequencia) return [];
  const atual = periodoDaData(i.frequencia, hoje());
  const lista = [...serie];
  if (!lista.some((l) => l.periodo === atual)) lista.push({ periodo: atual, medicao: null, vencido: false, emCurso: true });
  return lista.sort((a, b) => (a.periodo < b.periodo ? -1 : 1));
}

function tabelaDeMedicoes(pid, i, serie) {
  if (!i.frequencia) return h('p', { class: 'ajuda' }, 'Escolha a frequência na ficha para registrar medições.');
  const percentual = i.unidade === 'percentual';
  const linhas = linhasDoPeriodo(i, serie);
  const usados = new Set(linhas.map((l) => l.periodo));
  const outros = periodosPermitidos(i.frequencia, hoje(), 24).filter((p) => !usados.has(p));
  const cab = [['Período', 'per'], percentual ? ['Numerador', 'n'] : null, percentual ? ['Denominador', 'n'] : null, [percentual ? 'Valor (%)' : 'Valor', 'val'], ['Variação contra a linha de base', 'var'], ['Ações', 'acoes']].filter(Boolean);
  return h('table', { class: 'grade-t tabela-medicoes' },
    h('caption', { class: 'sr' }, `Medições de ${i.nome}`),
    h('colgroup', null, ...cab.map(([, c]) => h('col', { class: `col-${c}` }))),
    h('thead', null, h('tr', null, ...cab.map(([c]) => h('th', { scope: 'col' }, c)))),
    h('tbody', null,
      ...linhas.flatMap((l) => (l.medicao ? linhaDeMedicao(pid, i, l, percentual) : linhaPendente(pid, i, l, percentual, outros))),
      outros.length ? linhaPendente(pid, i, null, percentual, outros) : null));
}

function blocoIndicador(pid, i) {
  const h0 = hoje();
  const serie = serieDoIndicador(i, i.medicoes, h0);
  const sit = situacaoMeta(i, i.medicoes);
  const ap = apuracao(i, i.medicoes, h0);
  const idResumo = `frase-${idSeguro(i.id)}`;
  const avisos = avisosIndicador(i);
  const idH = `ih-${idSeguro(i.id)}`;
  return h('section', { class: 'indicador', id: `ind-${idSeguro(i.id)}`, 'data-k': `ind-${i.id}`, 'aria-labelledby': idH },
    h('h4', { id: idH, tabindex: '-1', class: 'sr' }, `Indicador: ${i.nome}`),
    h('div', { class: 'ind-cab' },
      campo({ chave: montarChave(pid, 'indicador', i.id, 'nome'), rotulo: 'Nome do indicador', controle: 'texto', layout: 'ficha', gravado: textoArmazenado(docCru(pid), montarChave(pid, 'indicador', i.id, 'nome')) })),
    h('div', { class: 'situacao' },
      seloSituacao(sit.codigo, sit.texto),
      h('p', { id: idResumo, class: 'frase' }, fraseResumo(i, i.medicoes)),
      sit.exibeSituacao ? null : h('p', { class: 'ajuda' }, AJUDA_SITUACAO[sit.codigo]),
      ap.atrasada ? seloAtrasada(`Apuração atrasada: período ${rotuloPeriodo(i.frequencia, ap.periodo)} sem medição (${plural(ap.dias, 'dia', 'dias')})`) : null,
      ...avisos.map((a) => h('div', { class: 'aviso-campo alerta' }, h('p', null, a)))),
    tabelaDeMedicoes(pid, i, serie),
    h('div', { class: 'resultado' }, graficoDaSerie(i, serie, idResumo, compacto())),
    fichaDoIndicador(pid, i),
    h('div', { class: 'fim' }, excluirNoLugar({
      chaveConf: `indicador:${pid}:${i.id}`, rotuloBotao: 'Excluir indicador',
      pergunta: i.medicoes.length ? `Excluir o indicador e ${plural(i.medicoes.length, 'medição', 'medições')}?` : 'Excluir este indicador?',
      atributos: { 'data-tipo': 'indicador', 'data-pid': pid, 'data-id': i.id },
    })));
}

function linhaDeResumo(p, an) {
  const { c } = an;
  return h('p', { class: 'small suave resumo-card' },
    `${plural(p.indicadores.length, 'indicador', 'indicadores')}. Meta atingida ${c.atingida} · Meta não atingida ${c.nao_atingida} · Sem dado ${c.semDado}. `,
    an.itens.length ? `Pendências: ${an.itens.map((x) => x.texto).join(', ')}. ` : '',
    dataHoraBR(p.indicadoresAtualizadoEm) ? `Alterado em ${dataHoraBR(p.indicadoresAtualizadoEm)}.` : 'Indicadores nunca alterados.');
}

export function cardIndicadores(p) {
  const aberto = estaAberto('indicadores', p.id);
  const idCorpo = `corpo-indicadores-${idSeguro(p.id)}`;
  const an = analiseDoProcesso(p);
  const cabeca = cabecaDoCard('indicadores', p, aberto, {
    topo: [],
    sinais: sinaisFechado(p, an),
    meta: [
      carimbo('Indicadores alterados', p.indicadoresAtualizadoEm, 'Indicadores nunca alterados'),
      h('a', { href: `#/plano/${p.id}`, class: 'link-card' }, 'Plano', h('span', { class: 'sr' }, ` de ${p.nome}`))],
  });
  let corpo = null;
  if (aberto) {
    corpo = h('div', { class: 'card-conteudo' },
      h('div', { class: 'ficha-proc' }, ...camposDoProcesso(p, { comEquipe: false })),
      linhaDeResumo(p, an),
      botoesDoCard('indicadores', p),
      p.indicadores.length >= 2
        ? h('nav', { 'aria-label': `Indicadores de ${p.nome}`, class: 'saltos' },
          ...p.indicadores.map((i) => h('button', { type: 'button', class: 'btn fant btn-pequeno', 'data-acao': 'ir-indicador', 'data-id': i.id }, `Ir para o indicador: ${i.nome}`)))
        : null,
      p.indicadores.length ? null : h('p', null, 'Este processo ainda não tem indicadores.'),
      ...p.indicadores.map((i) => blocoIndicador(p.id, i)),
      h('div', { class: 'linha-botoes' }, novoItem({
        chaveForm: `indicador:${p.id}`, rotuloBotao: 'Adicionar indicador', rotuloCampo: 'Nome do indicador',
        atributos: { 'data-tipo': 'indicador', 'data-pid': p.id },
      })),
      rodapeDoCard('indicadores', p));
  }
  return h('article', { class: `card card-ind${aberto ? ' aberto' : ''}`, 'data-k': `indicadores-${p.id}`, id: `card-indicadores-${idSeguro(p.id)}`, 'data-processo': p.id },
    cabeca,
    h('div', { id: idCorpo, class: 'card-corpo', hidden: !aberto }, corpo));
}
