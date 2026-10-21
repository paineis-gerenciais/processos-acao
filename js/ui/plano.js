// Tela Plano de implantação: cards por processo (RF-03, RF-12). Redesign da issue #7: uma tabela por processo,
// a melhoria é uma linha de grupo, a ação nova nasce numa linha em branco e os avisos ocupam a largura da tabela.
import { h, plural, idSeguro } from './dom.js';
import { estado, hoje } from './estado.js';
import { STATUS, ROTULO_STATUS, acaoAtrasada } from '../dominio/calculos.js';
import { dataHoraBR } from '../dominio/periodos.js';
import { seloAtrasada, seloPendente, carimbo } from './selos.js';
import { campo, campoDeTabela, montarChave, textoArmazenado } from './campos.js';
import {
  cabecaDoCard, estaAberto, botaoExcluirLinha, linhaDeAvisoDeExclusao, par, camposDoProcesso, docCru, botoesDoCard, totalDePendencias,
} from './compartilhado.js';

const COLUNAS = 6;

function contagemStatus(p) {
  const n = Object.fromEntries(STATUS.map((s) => [s, 0]));
  let sem = 0;
  let atrasadas = 0;
  let semResp = 0;
  const h0 = hoje();
  for (const a of p.acoes) {
    if (STATUS.includes(a.status)) n[a.status] += 1;
    else sem += 1;
    if (acaoAtrasada(a, h0).atrasada) atrasadas += 1;
    if (!a.responsavel) semResp += 1;
  }
  return { n, sem, atrasadas, semResp, semAcao: p.melhorias.filter((m) => m.acoes.length === 0).length };
}

/** Pendências do processo, com o texto de cada uma. O total é a soma dos números (D2 do Gate B). */
export function pendenciasDoPlano(p) {
  const c = contagemStatus(p);
  const itens = [];
  if (!p.dono) itens.push({ n: 1, texto: 'Sem dono' });
  if (!p.embaixador) itens.push({ n: 1, texto: 'Sem embaixador' });
  if (!p.acoes.length) itens.push({ n: 1, texto: 'Sem ações' });
  if (c.semResp) itens.push({ n: c.semResp, texto: `${c.semResp} sem responsável` });
  if (c.sem) itens.push({ n: c.sem, texto: `${c.sem} sem status` });
  if (c.semAcao) itens.push({ n: c.semAcao, texto: plural(c.semAcao, 'melhoria sem ação', 'melhorias sem ação') });
  return { total: itens.reduce((t, i) => t + i.n, 0), itens };
}

function sinaisFechado(p, c, pend) {
  const lista = [];
  if (estado.novos.has(p.id)) lista.push(h('span', { class: 'selo s-and' }, 'Novo'));
  if (c.n.travada > 0) lista.push(h('span', { class: 'selo s-trav' }, h('span', { class: 'i', 'aria-hidden': 'true' }, '■'), ' ', plural(c.n.travada, 'travada', 'travadas')));
  if (c.atrasadas > 0) lista.push(seloAtrasada(plural(c.atrasadas, 'atrasada', 'atrasadas')));
  lista.push(totalDePendencias(pend.total));
  return lista;
}

const ATRIBUTO_STATUS = { nao_iniciada: 'nao', em_andamento: 'andamento', concluida: 'concluida', travada: 'travada' };

/** Uma ação: a linha e, se houver, as linhas de aviso (não gravado, conflito, alterado) logo abaixo. */
function linhasDaAcao(pid, a, indice) {
  const doc = docCru(pid);
  const ch = (campoNome) => montarChave(pid, 'acao', a.id, campoNome);
  const gravado = (campoNome) => textoArmazenado(doc, ch(campoNome));
  const idNome = `ra-${idSeguro(a.id)}`;
  const atraso = acaoAtrasada(a, hoje());
  const conf = `acao:${pid}:${a.id}`;
  const comum = { extraDescricao: idNome, layout: 'celula' };
  const avisos = [];
  const celulaCampo = (o) => {
    const r = campoDeTabela({ ...comum, ...o });
    if (r.aviso) avisos.push(h('tr', { class: 'aviso-linha', 'data-k': `aviso-${a.id}-${o.chave.split('/').pop()}` }, h('td', { colspan: COLUNAS }, r.aviso)));
    return r.no;
  };
  const td = (classe, rotulo, ...filhos) => h('td', { class: classe, 'data-r': rotulo }, ...filhos);
  const linha = h('tr', { class: 'linha acao-linha', 'data-k': `acao-${a.id}` },
    td('c-acao', 'Ação',
      h('span', { id: idNome, class: 'sr' }, `Ação ${indice}: ${a.acao ?? ''}`),
      celulaCampo({ chave: ch('acao'), rotulo: 'Ação', controle: 'area', gravado: gravado('acao') }),
      atraso.atrasada ? h('div', { class: 'sinais' }, seloAtrasada(`Atrasada há ${plural(atraso.dias, 'dia', 'dias')}`)) : null),
    td('c-resp', 'Responsável', celulaCampo({ chave: ch('responsavel'), rotulo: 'Responsável', controle: 'area', linhaUnica: true, gravado: gravado('responsavel'), pendente: !a.responsavel, ajuda: 'Nome ou função' })),
    td('c-prazo', 'Prazo', celulaCampo({
      chave: ch('prazo'), rotulo: 'Prazo', controle: 'texto', inputmode: 'numeric', gravado: gravado('prazo'), pendente: !a.prazo,
      ajuda: 'Dia/mês/ano. Ex.: 31/12/2026', dica: 'dd/mm/aaaa',
    })),
    td('c-como', 'Como se verifica', celulaCampo({ chave: ch('comoSeVerifica'), rotulo: 'Como se verifica', controle: 'area', gravado: gravado('comoSeVerifica'), pendente: !a.comoSeVerifica, neutro: true })),
    td('c-status', 'Status', celulaCampo({
      chave: ch('status'), rotulo: 'Status', controle: 'lista', gravado: gravado('status'), pendente: !a.status,
      estadoStatus: a.status ? ATRIBUTO_STATUS[a.status] : 'vazio',
      opcoesLista: STATUS.map((s) => ({ valor: s, rotulo: ROTULO_STATUS[s] })),
    })),
    td('c-fim', 'Excluir', botaoExcluirLinha({
      chaveConf: conf, rotuloBotao: 'Excluir ação', rotuloAcessivel: a.acao ?? '',
      atributos: { 'data-tipo': 'acao', 'data-pid': pid, 'data-id': a.id },
    })));
  const confirmacao = linhaDeAvisoDeExclusao({
    chaveConf: conf, pergunta: 'Excluir esta ação?', colunas: COLUNAS, atributos: { 'data-tipo': 'acao', 'data-pid': pid, 'data-id': a.id },
  });
  return [linha, confirmacao, ...avisos];
}

const DICA_NOVA_ACAO = 'Ao sair deste campo com texto, a ação é criada e o foco segue para o responsável. Sem texto, nada é criado.';

/** Linha em branco no fim do grupo: sair do campo com texto cria a ação (uma gravação). */
function linhaNovaAcao(pid, m) {
  const chaveForm = `acao:${pid}:${m.id}`;
  const id = `nova-${idSeguro(chaveForm)}`;
  const f = estado.formsNovo.get(chaveForm);
  const idDica = `${id}-dica`;
  const idErro = `${id}-erro`;
  return h('tr', { class: 'nova nova-acao', 'data-k': `nova-acao-${m.id}` },
    h('td', { class: 'c-acao' },
      h('label', { for: id, class: 'rot-nova' }, 'Nova ação nesta melhoria'),
      h('input', {
        id, type: 'text', placeholder: 'Nova ação', autocomplete: 'off', 'data-novo': chaveForm, 'data-linha-nova': '1',
        'data-tipo': 'acao', 'data-pid': pid, 'data-mid': m.id, 'aria-invalid': f?.erro ? 'true' : null,
        'aria-describedby': f?.erro ? `${idDica} ${idErro}` : idDica,
      }),
      f?.erro ? h('div', { class: 'estado erro', id: idErro, role: 'alert' }, `✕ ${f.erro}`) : null),
    h('td', { colspan: COLUNAS - 1 },
      h('p', { class: 'dica', id: idDica }, m.acoes.length ? '' : 'Esta melhoria ainda não tem ações. ', DICA_NOVA_ACAO)));
}

function grupoDaMelhoria(pid, m) {
  const doc = docCru(pid);
  const quantas = m.acoes.length;
  const conf = `melhoria:${pid}:${m.id}`;
  const pergunta = quantas ? `Excluir a melhoria e ${plural(quantas, 'ação', 'ações')}?` : 'Excluir esta melhoria?';
  const atributos = { 'data-tipo': 'melhoria', 'data-pid': pid, 'data-id': m.id };
  const cabecalho = h('tr', { class: 'grupo', 'data-k': `grupo-${m.id}` },
    h('th', { scope: 'colgroup', colspan: COLUNAS },
      h('div', { class: 'grupo-in' },
        campo({ chave: montarChave(pid, 'melhoria', m.id, 'nome'), rotulo: 'Melhoria de origem', controle: 'texto', layout: 'grupo', gravado: textoArmazenado(doc, montarChave(pid, 'melhoria', m.id, 'nome')) }),
        quantas ? h('span', { class: 'selo s-nao' }, plural(quantas, 'ação', 'ações')) : seloPendente('sem ação'),
        botaoExcluirLinha({ chaveConf: conf, rotuloBotao: 'Excluir melhoria', rotuloAcessivel: m.nome, atributos }))));
  return [cabecalho, linhaDeAvisoDeExclusao({ chaveConf: conf, pergunta, colunas: COLUNAS, atributos })];
}

function linhaNovaMelhoria(pid) {
  const chaveForm = `melhoria:${pid}`;
  const id = `nova-${idSeguro(chaveForm)}`;
  const f = estado.formsNovo.get(chaveForm);
  const idErro = `${id}-erro`;
  return h('tbody', { class: 'nova-melhoria', 'data-k': 'nova-melhoria' },
    h('tr', { class: 'grupo nova', 'data-k': 'grupo-nova' },
      h('th', { scope: 'colgroup', colspan: COLUNAS },
        h('div', { class: 'grupo-in' },
          h('div', { class: 'campo grupo' },
            h('label', { for: id }, 'Nova melhoria de origem'),
            h('input', {
              id, type: 'text', placeholder: 'Escreva o nome e tecle Tab', autocomplete: 'off', 'data-novo': chaveForm, 'data-linha-nova': '1',
              'data-tipo': 'melhoria', 'data-pid': pid, 'aria-invalid': f?.erro ? 'true' : null, 'aria-describedby': f?.erro ? idErro : null,
            }),
            f?.erro ? h('div', { class: 'estado erro', id: idErro, role: 'alert' }, `✕ ${f.erro}`) : null)))));
}

function tabelaDoPlano(p) {
  const pid = p.id;
  const cabecalhos = ['Ação', 'Responsável', 'Prazo', 'Como se verifica', 'Status', 'Excluir'];
  return h('table', { class: 'grade-t tabela-acoes' },
    h('caption', { class: 'sr' }, `Ações de ${p.nome}, por melhoria de origem`),
    h('colgroup', null, ...['acao', 'resp', 'prazo', 'como', 'status', 'fim'].map((c) => h('col', { class: `col-${c}` }))),
    h('thead', null, h('tr', null, ...cabecalhos.map((c) => h('th', { scope: 'col' }, c === 'Excluir' ? h('span', { class: 'sr' }, c) : c)))),
    ...p.melhorias.map((m) => h('tbody', { class: 'melhoria', 'data-k': `mel-${m.id}` },
      ...grupoDaMelhoria(pid, m),
      ...m.acoes.flatMap((a, i) => linhasDaAcao(pid, a, i + 1)),
      linhaNovaAcao(pid, m))),
    linhaNovaMelhoria(pid));
}

function linhaDeResumo(p, c, pend) {
  const partes = STATUS.map((s) => `${ROTULO_STATUS[s]} ${c.n[s]}`);
  if (c.sem) partes.push(`${c.sem} sem status`);
  return h('p', { class: 'small suave resumo-card' },
    `${plural(p.acoes.length, 'ação', 'ações')} em ${plural(p.melhorias.length, 'melhoria', 'melhorias')}. ${partes.join(' · ')}. `,
    c.atrasadas ? `${plural(c.atrasadas, 'ação atrasada', 'ações atrasadas')}. ` : '',
    pend.itens.length ? `Pendências: ${pend.itens.map((i) => i.texto).join(', ')}. ` : '',
    dataHoraBR(p.planoAtualizadoEm) ? `Alterado em ${dataHoraBR(p.planoAtualizadoEm)}.` : 'Plano nunca alterado.');
}

export function cardPlano(p) {
  const aberto = estaAberto('plano', p.id);
  const idCorpo = `corpo-plano-${idSeguro(p.id)}`;
  const c = contagemStatus(p);
  const pend = pendenciasDoPlano(p);
  const cabeca = cabecaDoCard('plano', p, aberto, {
    topo: [par('Dono do processo', p.dono, 'Sem dono'), par('Embaixador', p.embaixador, 'Sem embaixador')],
    sinais: sinaisFechado(p, c, pend),
    meta: [
      carimbo('Plano alterado', p.planoAtualizadoEm, 'Plano nunca alterado'),
      h('a', { href: `#/indicadores/${p.id}`, class: 'link-card' }, 'Indicadores', h('span', { class: 'sr' }, ` de ${p.nome}`))],
  });
  let corpo = null;
  if (aberto) {
    corpo = h('div', { class: 'card-conteudo' },
      h('div', { class: 'ficha-proc' }, ...camposDoProcesso(p, { comEquipe: true })),
      linhaDeResumo(p, c, pend),
      botoesDoCard('plano', p),
      p.melhorias.length ? null : h('p', null, 'Este processo ainda não tem ações.'),
      tabelaDoPlano(p),
      rodapeDoCard('plano', p));
  }
  return h('article', { class: `card card-plano${aberto ? ' aberto' : ''}`, 'data-k': `plano-${p.id}`, id: `card-plano-${idSeguro(p.id)}`, 'data-processo': p.id },
    cabeca,
    h('div', { id: idCorpo, class: 'card-corpo', hidden: !aberto }, corpo));
}

export function rodapeDoCard(tela, p) {
  return h('div', { class: 'rodape-card' },
    h('button', { type: 'button', class: 'btn fant', 'data-acao': 'alternar', 'data-tela': tela, 'data-id': p.id }, 'Recolher', h('span', { class: 'sr' }, ` ${p.nome}`)),
    h('button', { type: 'button', class: 'btn perigo', 'data-acao': 'excluir-processo', 'data-id': p.id }, 'Excluir processo', h('span', { class: 'sr' }, ` ${p.nome}`)));
}
