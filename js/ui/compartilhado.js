// Peças usadas por Plano e Indicadores: cabeçalho do card, confirmação no lugar, formulário de novo item.
import { h, idSeguro } from './dom.js';
import { estado, chaveAberto } from './estado.js';
import { seloPendente } from './selos.js';
import { campo, montarChave } from './campos.js';
import { textoArmazenado } from './campos.js';

export function nomeExibido(p) {
  return p.nome && p.nome.length ? p.nome : '(sem nome)';
}

export function par(rotulo, valor, vazio) {
  return h('span', { class: 'par' },
    h('span', { class: 'par-rotulo' }, rotulo),
    valor ? h('span', { class: 'par-valor' }, valor) : seloPendente(vazio));
}

/** Cabeçalho do card: nome do processo na primeira linha (botão de expandir, aria-expanded); pessoas e selos abaixo. */
export function cabecaDoCard(tela, p, aberto, conteudo) {
  const idCorpo = `corpo-${tela}-${idSeguro(p.id)}`;
  return h('div', { class: 'card-cabeca', 'data-acao': 'alternar', 'data-tela': tela, 'data-id': p.id },
    h('h3', { class: 'card-nome' },
      h('button', {
        type: 'button', class: 'btn-expandir', 'aria-expanded': aberto ? 'true' : 'false', 'aria-controls': idCorpo,
        'data-acao': 'alternar', 'data-tela': tela, 'data-id': p.id,
      }, h('span', { class: 'nome-texto' }, nomeExibido(p)), ' ', h('span', { class: 'chev' }, aberto ? 'Recolher' : 'Expandir'))),
    conteudo.topo.length ? h('div', { class: 'card-pessoas' }, ...conteudo.topo) : null,
    conteudo.selos);
}

/** Botões do card aberto: imprimir, exportar e importar o processo, e o link para a outra tela. */
export function botoesDoCard(tela, p) {
  const outra = tela === 'plano' ? 'indicadores' : 'plano';
  const sr = (texto) => h('span', { class: 'sr' }, ` ${texto} ${p.nome}`);
  return h('div', { class: 'linha-botoes botoes-card' },
    h('button', { type: 'button', class: 'btn fant', 'data-acao': 'imprimir', 'data-tela': tela, 'data-id': p.id }, 'Imprimir', sr(tela === 'plano' ? 'plano de' : 'indicadores de')),
    h('button', { type: 'button', class: 'btn fant', 'data-acao': 'exportar-processo', 'data-id': p.id }, 'Exportar este processo (JSON)', sr('—')),
    h('button', { type: 'button', class: 'btn fant', 'data-acao': 'importar-processo', 'data-id': p.id }, 'Importar para este processo', sr('—')),
    h('a', { href: `#/${outra}/${p.id}` }, tela === 'plano' ? 'Ver indicadores deste processo' : 'Ver plano deste processo'));
}

export function estaAberto(tela, id) {
  return estado.abertos.has(chaveAberto(tela, id));
}

/** Confirmação no lugar: substitui o botão de excluir por "Excluir ...?" + Excluir/Cancelar. */
export function excluirNoLugar({ chaveConf, rotuloBotao, pergunta, atributos }) {
  if (!estado.confirmacoes.has(chaveConf)) {
    return h('button', { type: 'button', class: 'btn perigo', 'data-acao': 'confirmar-abrir', 'data-chave': chaveConf }, rotuloBotao);
  }
  return h('div', { class: 'confirma', role: 'group', 'aria-label': pergunta, 'data-conf': chaveConf },
    h('span', null, pergunta),
    h('button', { type: 'button', class: 'btn fant', 'data-acao': 'confirmar-cancelar', 'data-chave': chaveConf }, 'Cancelar'),
    h('button', { type: 'button', class: 'btn perigo', 'data-acao': 'excluir-item', 'data-chave': chaveConf, ...atributos }, 'Excluir'));
}

/** Formulário em linha para criar melhoria, ação ou indicador (pede o nome antes de gravar: nome vazio não existe). */
export function novoItem({ chaveForm, rotuloBotao, rotuloCampo, atributos }) {
  const f = estado.formsNovo.get(chaveForm);
  if (!f) {
    return h('button', { type: 'button', class: 'btn fant', 'data-acao': 'novo-abrir', 'data-chave': chaveForm }, rotuloBotao);
  }
  const id = `novo-${idSeguro(chaveForm)}`;
  const idErro = `${id}-erro`;
  return h('div', { class: 'form-novo', role: 'group', 'aria-label': rotuloBotao, 'data-k': `fn-${id}` },
    h('div', { class: 'campo' },
      h('label', { for: id }, rotuloCampo),
      h('input', { id, type: 'text', 'data-novo': chaveForm, autocomplete: 'off', 'aria-invalid': f.erro ? 'true' : null, 'aria-describedby': f.erro ? idErro : null }),
      f.erro ? h('div', { class: 'estado erro', id: idErro, role: 'alert' }, `✕ ${f.erro}`) : null),
    h('div', { class: 'botoes' },
      h('button', { type: 'button', class: 'btn prim', 'data-acao': 'novo-confirmar', 'data-chave': chaveForm, ...atributos }, 'Adicionar'),
      h('button', { type: 'button', class: 'btn fant', 'data-acao': 'novo-cancelar', 'data-chave': chaveForm }, 'Cancelar')));
}

export function camposDoProcesso(p, { comEquipe }) {
  const pid = p.id;
  const c = (nome, rotulo, extra = {}) => campo({
    chave: montarChave(pid, 'processo', null, nome), rotulo, controle: 'texto', layout: 'linha',
    gravado: textoArmazenado(raw(pid), montarChave(pid, 'processo', null, nome)), ...extra,
  });
  const pessoa = { ajuda: 'Nome ou função', dica: 'Nome ou função' };
  return comEquipe
    ? [c('nome', 'Processo'), c('dono', 'Dono do processo', { pendente: !p.dono, ...pessoa }), c('embaixador', 'Embaixador', { pendente: !p.embaixador, ...pessoa })]
    : [c('nome', 'Processo')];
}

function raw(pid) {
  return estado.processos.find((x) => x.id === pid);
}
export { raw as docCru };
