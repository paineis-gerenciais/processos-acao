// Tela Indicadores: cards por processo, ficha, situação, gráfico, tabela e registro de medições (RF-04 a RF-06, RF-13).
import { h, plural, idSeguro } from './dom.js';
import { estado, hoje } from './estado.js';
import {
  ROTULO_POLARIDADE, ROTULO_UNIDADE, POLARIDADES, UNIDADES, formatarValor, formatarNumero, situacaoMeta, variacaoContraBase,
  fraseResumo, serieDoIndicador, apuracao,
} from '../dominio/calculos.js';
import { FREQUENCIAS, rotuloPeriodo, periodosPermitidos, dataSaoPaulo, formatarDataBR, periodoDaData } from '../dominio/periodos.js';
import { avisosIndicador } from '../dominio/validacao.js';
import { analiseIndicador } from '../dominio/metricas.js';
import { seloSituacao, seloAtrasada, seloPendente, carimbo } from './selos.js';
import { campo, montarChave, textoArmazenado } from './campos.js';
import { cabecaDoCard, estaAberto, excluirNoLugar, novoItem, camposDoProcesso, docCru } from './compartilhado.js';
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

function selosDosIndicadores(p) {
  const h0 = hoje();
  const lista = [];
  if (!p.indicadores.length) return [seloPendente('Sem indicador')];
  lista.push(h('span', { class: 'selo s-nao' }, plural(p.indicadores.length, 'indicador', 'indicadores')));
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
  if (c.atingida) lista.push(seloSituacao('atingida', `Meta atingida ${c.atingida}`));
  if (c.nao_atingida) lista.push(seloSituacao('nao_atingida', `Meta não atingida ${c.nao_atingida}`));
  if (c.semDado) lista.push(seloSituacao('sem_dado', `Sem dado ${c.semDado}`));
  if (c.base) lista.push(seloPendente(`${c.base} sem linha de base`));
  if (c.meta) lista.push(seloPendente(`${c.meta} sem meta`));
  if (c.freq) lista.push(seloPendente(`${c.freq} sem frequência`));
  if (c.pol) lista.push(seloPendente(`${c.pol} sem polaridade`));
  if (c.med) lista.push(seloPendente(`${c.med} sem medição`));
  if (c.atraso) lista.push(seloAtrasada(`${c.atraso} com apuração atrasada`));
  return lista;
}

function fichaDoIndicador(pid, i) {
  const doc = docCru(pid);
  const ch = (n) => montarChave(pid, 'indicador', i.id, n);
  const g = (n) => textoArmazenado(doc, ch(n));
  const trava = i.medicoes.length > 0;
  const unidade = i.unidade ? ROTULO_UNIDADE[i.unidade] : null;
  const pend = (n) => i[n] === null || i[n] === undefined || i[n] === '';
  return h('div', { class: 'grade g2 ficha' },
    campo({ chave: ch('nome'), rotulo: 'Nome do indicador', controle: 'texto', gravado: g('nome'), classe: 'largo' }),
    campo({ chave: ch('formula'), rotulo: 'Fórmula', controle: 'area', gravado: g('formula'), pendente: pend('formula'), ajuda: 'Texto livre; o painel não calcula a fórmula.', classe: 'largo' }),
    campo({ chave: ch('oQueMede'), rotulo: 'O que mede', controle: 'area', gravado: g('oQueMede'), pendente: pend('oQueMede'), classe: 'largo' }),
    campo({ chave: ch('responsavel'), rotulo: 'Responsável pela medição', controle: 'texto', gravado: g('responsavel'), pendente: pend('responsavel'), ajuda: 'Nome ou função' }),
    campo({ chave: ch('fonte'), rotulo: 'Fonte', controle: 'texto', gravado: g('fonte'), pendente: pend('fonte'), ajuda: 'De onde sai o dado' }),
    campo({
      chave: ch('polaridade'), rotulo: 'Polaridade', controle: 'lista', gravado: g('polaridade'), pendente: pend('polaridade'),
      opcoesLista: POLARIDADES.map((v) => ({ valor: v, rotulo: ROTULO_POLARIDADE[v] })), ajuda: 'Maior é melhor ou menor é melhor?',
    }),
    campo({
      chave: ch('frequencia'), rotulo: 'Frequência', controle: 'lista', gravado: g('frequencia'), pendente: pend('frequencia'),
      opcoesLista: Object.keys(FREQUENCIAS).map((v) => ({ valor: v, rotulo: FREQUENCIAS[v].rotulo })),
      ajuda: 'Mensal costuma bastar; trimestral é o limite.',
      bloqueio: trava ? 'Não é possível mudar a frequência enquanto houver medições. Exclua as medições antes.' : null,
    }),
    campo({
      chave: ch('unidade'), rotulo: 'Unidade', controle: 'lista', gravado: g('unidade'), pendente: pend('unidade'),
      opcoesLista: UNIDADES.map((v) => ({ valor: v, rotulo: ROTULO_UNIDADE[v] })), ajuda: 'Em % o painel oferece numerador e denominador.',
      bloqueio: trava ? 'Não é possível mudar a unidade enquanto houver medições. Exclua as medições antes.' : null,
    }),
    campo({ chave: ch('linhaBase'), rotulo: 'Linha de base', sufixo: unidade, controle: 'texto', inputmode: 'decimal', gravado: g('linhaBase'), pendente: pend('linhaBase'), ajuda: 'Valor de hoje. Sem ele não dá para saber se melhorou. Use vírgula: 62,5' }),
    campo({ chave: ch('linhaBaseReferencia'), rotulo: 'Referência da linha de base', controle: 'texto', inputmode: 'numeric', gravado: g('linhaBaseReferencia'), pendente: pend('linhaBaseReferencia'), ajuda: 'Último dia coberto pelo valor de hoje. Ex.: 31/12/2026' }),
    campo({ chave: ch('meta'), rotulo: 'Meta', sufixo: unidade, controle: 'texto', inputmode: 'decimal', gravado: g('meta'), pendente: pend('meta'), ajuda: 'Valor que se quer alcançar. Use vírgula.' }),
    campo({ chave: ch('prazoMeta'), rotulo: 'Prazo da meta', opcional: true, controle: 'texto', inputmode: 'numeric', gravado: g('prazoMeta'), ajuda: 'Dia/mês/ano. Informativo.' }));
}

function celula(rotulo, ...filhos) {
  return h('td', { 'data-r': rotulo }, ...filhos);
}

function linhaDeMedicao(pid, i, linha, percentual) {
  const ed = estado.edicaoMedicao;
  const editando = ed && ed.indicadorId === i.id && ed.periodo === linha.periodo;
  const rot = rotuloPeriodo(i.frequencia, linha.periodo);
  const colunaPeriodo = celula('Período', h('span', { class: 'mono' }, rot), h('span', { class: 'sr' }, ` (${linha.periodo})`));
  if (!linha.medicao) {
    return h('tr', { 'data-k': `med-${i.id}-${linha.periodo}`, class: 'sem-medicao' },
      colunaPeriodo,
      celula('Valor', linha.vencido ? 'Sem medição' : 'Em curso, sem medição'),
      percentual ? celula('Numerador', '—') : null,
      percentual ? celula('Denominador', '—') : null,
      celula('Variação', '—'),
      celula('Registrado em', '—'),
      celula('Ações', h('button', { type: 'button', class: 'btn fant btn-pequeno', 'data-acao': 'preencher-periodo', 'data-id': i.id, 'data-periodo': linha.periodo }, 'Registrar', h('span', { class: 'sr' }, ` ${rot}`))));
  }
  const m = linha.medicao;
  if (editando) {
    const modo = ed.modo;
    const idb = `ed-${idSeguro(i.id)}-${idSeguro(linha.periodo)}`;
    const entrada = (nome, rotulo, valor) => h('div', { class: 'campo' },
      h('label', { for: `${idb}-${nome}` }, rotulo),
      h('input', { id: `${idb}-${nome}`, type: 'text', inputmode: 'decimal', value: valor, 'data-edicao': nome, autocomplete: 'off', 'aria-invalid': ed.erros?.[nome] ? 'true' : null, 'aria-describedby': ed.erros?.[nome] ? `${idb}-${nome}-e` : null }),
      ed.erros?.[nome] ? h('div', { class: 'estado erro', id: `${idb}-${nome}-e`, role: 'alert' }, `✕ ${ed.erros[nome]}`) : null);
    return h('tr', { 'data-k': `med-ed-${i.id}-${linha.periodo}`, class: 'editando' },
      colunaPeriodo,
      h('td', { 'data-r': 'Valor', colspan: percentual ? 3 : 1 },
        modo === 'calculado'
          ? h('div', { class: 'grade g2' }, entrada('numerador', 'Numerador', formatarNumero(m.numerador)), entrada('denominador', 'Denominador', formatarNumero(m.denominador)))
          : entrada('valor', 'Valor', formatarNumero(m.valor))),
      celula('Variação', '—'),
      celula('Registrado em', '—'),
      celula('Ações',
        h('button', { type: 'button', class: 'btn prim btn-pequeno', 'data-acao': 'medicao-salvar', 'data-id': i.id, 'data-periodo': linha.periodo }, 'Salvar'),
        h('button', { type: 'button', class: 'btn fant btn-pequeno', 'data-acao': 'medicao-cancelar' }, 'Cancelar')));
  }
  const v = variacaoContraBase(i, m);
  const registrado = m.registradoEm ? formatarDataBR(dataSaoPaulo(m.registradoEm)) : '—';
  const conf = `medicao:${pid}:${i.id}:${linha.periodo}`;
  return h('tr', { 'data-k': `med-${i.id}-${linha.periodo}` },
    colunaPeriodo,
    celula('Valor', formatarValor(m.valor, i.unidade)),
    percentual ? celula('Numerador', m.numerador === null || m.numerador === undefined ? '—' : formatarNumero(m.numerador)) : null,
    percentual ? celula('Denominador', m.denominador === null || m.denominador === undefined ? '—' : formatarNumero(m.denominador)) : null,
    celula('Variação', v ? v.texto : '—'),
    celula('Registrado em', registrado),
    celula('Ações',
      h('div', { class: 'acoes-linha' },
        h('button', { type: 'button', class: 'btn fant btn-pequeno', 'data-acao': 'medicao-editar', 'data-pid': pid, 'data-id': i.id, 'data-periodo': linha.periodo }, 'Editar', h('span', { class: 'sr' }, ` ${rot}`)),
        excluirNoLugar({
          chaveConf: conf, rotuloBotao: 'Excluir', pergunta: `Excluir a medição de ${rot}?`,
          atributos: { 'data-tipo': 'medicao', 'data-pid': pid, 'data-id': i.id, 'data-periodo': linha.periodo },
        }))));
}

function tabelaDeMedicoes(pid, i, serie) {
  const percentual = i.unidade === 'percentual';
  if (!serie.length) return null;
  const cab = ['Período', 'Valor', percentual ? 'Numerador' : null, percentual ? 'Denominador' : null, 'Variação contra a linha de base', 'Registrado em', 'Ações'].filter(Boolean);
  return h('table', { class: 'tabela tabela-medicoes' },
    h('caption', { class: 'sr' }, `Medições de ${i.nome}`),
    h('thead', null, h('tr', null, ...cab.map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', null, ...serie.map((l) => linhaDeMedicao(pid, i, l, percentual))));
}

function formularioDeMedicao(pid, i, serie) {
  if (!i.frequencia) return h('p', { class: 'ajuda' }, 'Escolha a frequência na ficha para registrar medições.');
  const f = estado.formsMedicao.get(i.id) ?? {};
  const h0 = hoje();
  const medidos = new Set(i.medicoes.map((m) => m.periodo));
  const permitidos = periodosPermitidos(i.frequencia, h0, 24);
  const padrao = [...serie].reverse().find((l) => !l.medicao && l.vencido)?.periodo ?? periodoDaData(i.frequencia, h0);
  const periodo = f.periodo && permitidos.includes(f.periodo) ? f.periodo : padrao;
  const percentual = i.unidade === 'percentual';
  const modo = percentual ? (f.modo ?? 'calculado') : 'direto';
  const idb = `reg-${idSeguro(i.id)}`;
  const erro = (n) => (f.erros?.[n] ? h('div', { class: 'estado erro', id: `${idb}-${n}-e`, role: 'alert' }, `✕ ${f.erros[n]}`) : null);
  const inv = (n) => ({ 'aria-invalid': f.erros?.[n] ? 'true' : null, 'aria-describedby': f.erros?.[n] ? `${idb}-${n}-e` : null });
  const jaMedido = medidos.has(periodo);
  const campoNum = (n, rotulo, ajuda) => h('div', { class: 'campo' },
    h('label', { for: `${idb}-${n}` }, rotulo),
    h('input', { id: `${idb}-${n}`, type: 'text', inputmode: 'decimal', 'data-medicao': n, autocomplete: 'off', ...inv(n) }),
    ajuda ? h('div', { class: 'ajuda' }, ajuda) : null,
    erro(n));
  return h('fieldset', { class: 'registro', 'data-k': `reg-${i.id}-${f.geracao ?? 0}`, 'data-ind': i.id, 'data-pid': pid },
    h('legend', null, 'Registrar medição'),
    h('div', { class: 'campo' },
      h('label', { for: `${idb}-periodo` }, 'Período'),
      h('select', { id: `${idb}-periodo`, 'data-medicao': 'periodo', 'data-controlado': true, ...inv('periodo') },
        ...permitidos.map((p) => h('option', { value: p, selected: p === periodo }, `${rotuloPeriodo(i.frequencia, p)} (${p})${medidos.has(p) ? ' (já medido)' : ''}`))),
      erro('periodo')),
    jaMedido
      ? h('div', { class: 'aviso-campo info' }, h('p', null, 'Já existe medição para este período. Edite a existente.'),
        h('button', { type: 'button', class: 'btn fant', 'data-acao': 'medicao-editar', 'data-pid': pid, 'data-id': i.id, 'data-periodo': periodo }, 'Editar a existente'))
      : null,
    percentual
      ? h('div', { class: 'campo', role: 'radiogroup', 'aria-labelledby': `${idb}-modo` },
        h('span', { class: 'rot', id: `${idb}-modo` }, 'Como informar'),
        h('label', { class: 'radio' }, h('input', { type: 'radio', name: `${idb}-modo`, value: 'calculado', 'data-medicao': 'modo', 'data-controlado': true, checked: modo === 'calculado' }), ' Numerador e denominador'),
        h('label', { class: 'radio' }, h('input', { type: 'radio', name: `${idb}-modo`, value: 'direto', 'data-medicao': 'modo', 'data-controlado': true, checked: modo === 'direto' }), ' Valor direto'))
      : null,
    modo === 'calculado'
      ? h('div', { class: 'grade g2' }, campoNum('numerador', 'Numerador', 'Resultado = numerador ÷ denominador × 100'), campoNum('denominador', 'Denominador', 'Maior que zero'))
      : campoNum('valor', 'Valor', percentual ? 'Digite com vírgula, ex.: 12,5. Para percentual, 82,5 (e não 0,825).' : 'Digite com vírgula, ex.: 12,5.'),
    h('p', { class: 'previa', role: 'status' }, f.previa ?? ''),
    ...(f.avisos ?? []).map((a) => h('div', { class: 'aviso-campo alerta' }, h('p', null, a))),
    h('button', { type: 'button', class: 'btn prim', 'data-acao': 'medicao-registrar', 'data-pid': pid, 'data-id': i.id }, 'Registrar medição'));
}

function blocoIndicador(pid, i) {
  const h0 = hoje();
  const serie = serieDoIndicador(i, i.medicoes, h0);
  const sit = situacaoMeta(i, i.medicoes);
  const ap = apuracao(i, i.medicoes, h0);
  const idResumo = `frase-${idSeguro(i.id)}`;
  const avisos = avisosIndicador(i);
  const idH = `ih-${idSeguro(i.id)}`;
  return h('section', { class: 'indicador', id: `ind-${idSeguro(i.id)}`, 'data-k': `ind-${i.id}` },
    h('h4', { id: idH, tabindex: '-1' }, 'Indicador'),
    h('div', { class: 'situacao' },
      seloSituacao(sit.codigo, sit.texto),
      h('p', { id: idResumo, class: 'frase' }, fraseResumo(i, i.medicoes)),
      sit.exibeSituacao ? null : h('p', { class: 'ajuda' }, AJUDA_SITUACAO[sit.codigo]),
      ap.atrasada ? seloAtrasada(`Apuração atrasada: período ${rotuloPeriodo(i.frequencia, ap.periodo)} sem medição (${plural(ap.dias, 'dia', 'dias')})`) : null,
      ...avisos.map((a) => h('div', { class: 'aviso-campo alerta' }, h('p', null, a)))),
    h('div', { class: 'duas' },
      fichaDoIndicador(pid, i),
      h('div', { class: 'resultado' }, graficoDaSerie(i, serie, idResumo, compacto()))),
    tabelaDeMedicoes(pid, i, serie),
    formularioDeMedicao(pid, i, serie),
    h('div', { class: 'fim' }, excluirNoLugar({
      chaveConf: `indicador:${pid}:${i.id}`, rotuloBotao: 'Excluir indicador',
      pergunta: i.medicoes.length ? `Excluir o indicador e ${plural(i.medicoes.length, 'medição', 'medições')}?` : 'Excluir este indicador?',
      atributos: { 'data-tipo': 'indicador', 'data-pid': pid, 'data-id': i.id },
    })));
}

export function cardIndicadores(p) {
  const aberto = estaAberto('indicadores', p.id);
  const idCorpo = `corpo-indicadores-${idSeguro(p.id)}`;
  const cabeca = cabecaDoCard('indicadores', p, aberto, {
    topo: [],
    selos: h('div', { class: 'linha-selos' },
      estado.novos.has(p.id) ? h('span', { class: 'selo s-and' }, 'Novo') : null,
      ...selosDosIndicadores(p),
      carimbo('Indicadores alterados', p.indicadoresAtualizadoEm, 'Indicadores nunca alterados'),
      h('a', { href: `#/plano/${p.id}`, class: 'link-card' }, 'Plano', h('span', { class: 'sr' }, ` de ${p.nome}`))),
  });
  let corpo = null;
  if (aberto) {
    corpo = h('div', { class: 'card-conteudo' },
      h('div', { class: 'grade g3' }, ...camposDoProcesso(p, { comEquipe: false })),
      h('p', { class: 'linha-botoes' },
        h('button', { type: 'button', class: 'btn fant', 'data-acao': 'imprimir', 'data-tela': 'indicadores', 'data-id': p.id }, 'Imprimir', h('span', { class: 'sr' }, ` indicadores de ${p.nome}`)),
        h('a', { href: `#/plano/${p.id}` }, 'Ver plano deste processo')),
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
