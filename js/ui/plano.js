// Tela Plano de implantação: cards por processo (RF-03, RF-12).
import { h, plural, idSeguro } from './dom.js';
import { estado, hoje } from './estado.js';
import { STATUS, ROTULO_STATUS, acaoAtrasada } from '../dominio/calculos.js';
import { dataHoraBR } from '../dominio/periodos.js';
import { seloStatus, seloAtrasada, seloPendente, carimbo } from './selos.js';
import { campo, montarChave, textoArmazenado } from './campos.js';
import { cabecaDoCard, estaAberto, excluirNoLugar, novoItem, par, camposDoProcesso, docCru, botoesDoCard } from './compartilhado.js';

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

function selosDoPlano(p) {
  const c = contagemStatus(p);
  const lista = [];
  if (!p.acoes.length) lista.push(seloPendente('Sem ações'));
  for (const s of STATUS) if (c.n[s] > 0) lista.push(seloStatus(s, c.n[s]));
  if (c.sem > 0) lista.push(seloPendente(`${c.sem} sem status`));
  if (c.atrasadas > 0) lista.push(seloAtrasada(plural(c.atrasadas, 'atrasada', 'atrasadas')));
  if (c.semResp > 0) lista.push(seloPendente(`${c.semResp} sem responsável`));
  if (c.semAcao > 0) lista.push(seloPendente(plural(c.semAcao, 'melhoria sem ação', 'melhorias sem ação')));
  return lista;
}

const COLUNAS_ACAO = ['Ação', 'Responsável', 'Prazo', 'Como se verifica', 'Status', 'Excluir'];

function linhaAcao(pid, a, indice) {
  const doc = docCru(pid);
  const ch = (campoNome) => montarChave(pid, 'acao', a.id, campoNome);
  const gravado = (campoNome) => textoArmazenado(doc, ch(campoNome));
  const idNome = `ra-${idSeguro(a.id)}`;
  const atraso = acaoAtrasada(a, hoje());
  const conf = `acao:${pid}:${a.id}`;
  const comum = { extraDescricao: idNome, layout: 'celula' };
  const td = (classe, rotulo, ...filhos) => h('td', { class: classe, 'data-r': rotulo }, ...filhos);
  return h('tr', { class: 'acao-linha', 'data-k': `acao-${a.id}` },
    td('c-acao', 'Ação',
      h('span', { id: idNome, class: 'sr' }, `Ação ${indice}: ${a.acao ?? ''}`),
      campo({ chave: ch('acao'), rotulo: 'Ação', controle: 'area', gravado: gravado('acao'), ...comum })),
    td('c-resp', 'Responsável', campo({ chave: ch('responsavel'), rotulo: 'Responsável', controle: 'texto', gravado: gravado('responsavel'), pendente: !a.responsavel, ajuda: 'Nome ou função', dica: 'Nome ou função', ...comum })),
    td('c-prazo', 'Prazo', campo({
      chave: ch('prazo'), rotulo: 'Prazo', controle: 'texto', inputmode: 'numeric', gravado: gravado('prazo'), pendente: !a.prazo,
      ajuda: 'Dia/mês/ano. Ex.: 31/12/2026', dica: 'dd/mm/aaaa', rotuloExtra: atraso.atrasada ? seloAtrasada(`Atrasada há ${plural(atraso.dias, 'dia', 'dias')}`) : null, ...comum,
    })),
    td('c-como', 'Como se verifica', campo({ chave: ch('comoSeVerifica'), rotulo: 'Como se verifica', controle: 'area', gravado: gravado('comoSeVerifica'), pendente: !a.comoSeVerifica, ...comum })),
    td('c-status', 'Status', campo({
      chave: ch('status'), rotulo: 'Status', controle: 'lista', gravado: gravado('status'), pendente: !a.status,
      opcoesLista: STATUS.map((s) => ({ valor: s, rotulo: ROTULO_STATUS[s] })), ...comum,
    })),
    td('c-excluir', 'Excluir', excluirNoLugar({
      chaveConf: conf, rotuloBotao: 'Excluir ação', pergunta: 'Excluir esta ação?',
      atributos: { 'data-tipo': 'acao', 'data-pid': pid, 'data-id': a.id },
    })));
}

function blocoMelhoria(pid, m) {
  const doc = docCru(pid);
  const idH = `mh-${idSeguro(m.id)}`;
  const conf = `melhoria:${pid}:${m.id}`;
  const quantas = m.acoes.length;
  return h('section', { class: 'melhoria', 'data-k': `mel-${m.id}`, 'aria-labelledby': idH },
    h('header', null,
      h('h4', { id: idH }, 'Melhoria de origem'),
      quantas ? h('span', { class: 'selo s-nao' }, plural(quantas, 'ação', 'ações')) : seloPendente('sem ação')),
    campo({ chave: montarChave(pid, 'melhoria', m.id, 'nome'), rotulo: 'Nome da melhoria', controle: 'texto', layout: 'linha', gravado: textoArmazenado(doc, montarChave(pid, 'melhoria', m.id, 'nome')) }),
    quantas
      ? h('table', { class: 'tabela-acoes' },
        h('caption', { class: 'sr' }, `Ações da melhoria ${m.nome}`),
        h('thead', null, h('tr', null, ...COLUNAS_ACAO.map((c) => h('th', { scope: 'col', class: c === 'Excluir' ? 'sr-th' : null }, c === 'Excluir' ? h('span', { class: 'sr' }, c) : c)))),
        h('tbody', null, ...m.acoes.map((a, i) => linhaAcao(pid, a, i + 1))))
      : null,
    h('div', { class: 'linha-botoes entre' },
      novoItem({
        chaveForm: `acao:${pid}:${m.id}`, rotuloBotao: 'Adicionar ação', rotuloCampo: 'Descrição da ação',
        atributos: { 'data-tipo': 'acao', 'data-pid': pid, 'data-mid': m.id },
      }),
      excluirNoLugar({
        chaveConf: conf, rotuloBotao: 'Excluir melhoria',
        pergunta: quantas ? `Excluir a melhoria e ${plural(quantas, 'ação', 'ações')}?` : 'Excluir esta melhoria?',
        atributos: { 'data-tipo': 'melhoria', 'data-pid': pid, 'data-id': m.id },
      })));
}

export function cardPlano(p) {
  const aberto = estaAberto('plano', p.id);
  const idCorpo = `corpo-plano-${idSeguro(p.id)}`;
  const c = contagemStatus(p);
  const novo = estado.novos.has(p.id);
  const cabeca = cabecaDoCard('plano', p, aberto, {
    topo: [par('Dono do processo', p.dono, 'Sem dono'), par('Embaixador', p.embaixador, 'Sem embaixador')],
    selos: h('div', { class: 'linha-selos' },
      novo ? h('span', { class: 'selo s-and' }, 'Novo') : null,
      ...selosDoPlano(p),
      carimbo('Plano alterado', p.planoAtualizadoEm, 'Plano nunca alterado'),
      h('a', { href: `#/indicadores/${p.id}`, class: 'link-card' }, 'Indicadores', h('span', { class: 'sr' }, ` de ${p.nome}`))),
  });
  let corpo = null;
  if (aberto) {
    corpo = h('div', { class: 'card-conteudo' },
      h('div', { class: 'ficha-tabela' }, ...camposDoProcesso(p, { comEquipe: true })),
      botoesDoCard('plano', p),
      h('p', { class: 'small suave' },
        `${plural(p.acoes.length, 'ação', 'ações')} em ${plural(p.melhorias.length, 'melhoria', 'melhorias')}. `,
        dataHoraBR(p.planoAtualizadoEm) ? `Alterado em ${dataHoraBR(p.planoAtualizadoEm)}.` : 'Plano nunca alterado.',
        c.atrasadas ? ` ${plural(c.atrasadas, 'ação atrasada', 'ações atrasadas')}.` : ''),
      p.melhorias.length ? null : h('p', null, 'Este processo ainda não tem ações.'),
      ...p.melhorias.map((m) => blocoMelhoria(p.id, m)),
      h('div', { class: 'linha-botoes' }, novoItem({
        chaveForm: `melhoria:${p.id}`, rotuloBotao: 'Adicionar melhoria de origem', rotuloCampo: 'Nome da melhoria de origem',
        atributos: { 'data-tipo': 'melhoria', 'data-pid': p.id },
      })),
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
