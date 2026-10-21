// Campo editável com rótulo, ajuda e linha de estado (especificação, seções 8.1 a 8.3).
import { h, idSeguro } from './dom.js';
import { estado, estaOffline } from './estado.js';
import { CAMPOS, textoDoValor } from '../dominio/validacao.js';
import { ativos } from '../dominio/lixeira.js';

export function montarChave(pid, entidade, itemId, campo) {
  return `${pid}/${entidade}/${itemId ?? '-'}/${campo}`;
}

export function lerChave(chave) {
  const [pid, entidade, itemId, campo] = chave.split('/');
  return { pid, entidade, itemId: itemId === '-' ? null : itemId, campo };
}

export function definicao(chave) {
  const { entidade, campo } = lerChave(chave);
  return CAMPOS[entidade]?.[campo] ?? null;
}

function valorBruto(doc, { entidade, itemId, campo }) {
  if (!doc) return undefined;
  if (entidade === 'processo') return doc[campo];
  const mapa = { melhoria: 'melhorias', acao: 'acoes', indicador: 'indicadores' }[entidade];
  return doc[mapa]?.[itemId]?.[campo];
}

/** Texto do valor gravado (o que o campo mostra quando não há edição em curso). */
export function textoArmazenado(doc, chave) {
  const partes = lerChave(chave);
  const def = CAMPOS[partes.entidade]?.[partes.campo];
  if (!def) return '';
  return textoDoValor(def, valorBruto(doc, partes) ?? null);
}

/** Todos os campos de um processo ativo -> texto, para detectar mudanças vindas de outras pessoas. */
export function mapaDeCampos(doc) {
  const mapa = new Map();
  const a = ativos(doc);
  if (!a) return mapa;
  const pid = doc.id;
  const poe = (entidade, itemId, campos) => {
    for (const campo of campos) {
      const chave = montarChave(pid, entidade, itemId, campo);
      mapa.set(chave, textoArmazenado(doc, chave));
    }
  };
  poe('processo', null, Object.keys(CAMPOS.processo));
  for (const m of a.melhorias) poe('melhoria', m.id, Object.keys(CAMPOS.melhoria));
  for (const x of a.acoes) poe('acao', x.id, Object.keys(CAMPOS.acao));
  for (const i of a.indicadores) poe('indicador', i.id, Object.keys(CAMPOS.indicador));
  return mapa;
}

function seloPendente(texto = 'Pendente') {
  return h('span', { class: 'selo s-pend' }, h('span', { class: 'i', 'aria-hidden': 'true' }, '▲'), ` ${texto}`);
}

function aviso(classe, ...filhos) {
  return h('div', { class: `aviso-campo ${classe}` }, ...filhos);
}

function linhaDeEstado(chave, idEstado, fora = null) {
  const e = estado.campos.get(chave);
  if (fora && e && ['nao_gravado', 'conflito', 'editando_remoto', 'alterado'].includes(e.tipo)) return estadoCurtoEAviso(chave, idEstado, e, fora);
  const base = { id: idEstado, class: 'estado' };
  if (!e) return { linha: h('div', base), extra: null };
  switch (e.tipo) {
    case 'recusado':
      return { linha: h('div', { ...base, class: 'estado erro', role: 'alert' }, `✕ ${e.mensagem}`), extra: null };
    case 'gravando':
      return estaOffline()
        ? { linha: h('div', { ...base, class: 'estado alerta' }, '▲ Sem conexão. Ainda não gravado.'), extra: null }
        : { linha: h('div', { ...base, class: 'estado cinza' }, '⏳ Gravando…'), extra: null };
    case 'gravado':
      return { linha: h('div', { ...base, class: 'estado gravado' }, `✓ Gravado às ${e.hora}`), extra: null };
    case 'nao_gravado':
      return {
        linha: h('div', { ...base, class: 'estado erro' }, `✕ Não gravado. ${e.mensagem ?? 'Seu texto continua aqui.'}`),
        extra: aviso('alerta', h('button', { type: 'button', class: 'btn fant', 'data-acao': 'tentar-de-novo', 'data-chave': chave }, 'Tentar de novo')),
      };
    case 'conflito':
      return {
        linha: h('div', base),
        extra: aviso('info', h('p', null, `O valor deste campo mudou enquanto você digitava. Valor atual: «${e.atual}» (${e.hora}). Seu texto: «${e.texto}».`),
          h('div', { class: 'botoes' },
            h('button', { type: 'button', class: 'btn fant', 'data-acao': 'conflito-manter', 'data-chave': chave }, 'Manter o meu texto'),
            h('button', { type: 'button', class: 'btn fant', 'data-acao': 'conflito-usar', 'data-chave': chave }, 'Usar o valor atual'))),
      };
    case 'editando_remoto':
      return { linha: h('div', base), extra: aviso('info', h('p', null, `Outra pessoa alterou este campo para «${e.remoto}». O seu texto não foi apagado.`)) };
    case 'alterado':
      return {
        linha: h('div', base),
        extra: aviso('info',
          h('p', null, e.minha
            ? `O valor que você gravou foi alterado por outra pessoa às ${e.hora}. Valor atual: «${e.atual}».`
            : `Alterado por outra pessoa às ${e.hora}. Valor anterior: «${e.anterior}».`),
          h('button', { type: 'button', class: 'btn fant', 'data-acao': 'entendi', 'data-chave': chave }, 'Entendi')),
      };
    default:
      return { linha: h('div', base), extra: null };
  }
}

/**
 * Em tabela: a célula mostra só uma palavra ("Não gravado", "Conflito", "Alterado") e o aviso completo, com os botões,
 * vai para uma linha própria na largura da tabela (T3 da segurança: nada escondido em coluna estreita).
 */
function estadoCurtoEAviso(chave, idEstado, e, { rotulo, idAviso }) {
  const nome = h('strong', null, `${rotulo}: `);
  const curto = (classe, texto) => h('div', { id: idEstado, class: `estado ${classe}` }, texto);
  const aviso = (classe, ...filhos) => h('div', { class: `aviso-campo ${classe}`, id: idAviso, role: 'status' }, ...filhos);
  switch (e.tipo) {
    case 'nao_gravado':
      return {
        linha: curto('erro', '✕ Não gravado'),
        extra: aviso('alerta', h('p', null, nome, `Não gravado. ${e.mensagem ?? 'Seu texto continua aqui.'}`),
          h('button', { type: 'button', class: 'btn fant', 'data-acao': 'tentar-de-novo', 'data-chave': chave }, 'Tentar de novo')),
      };
    case 'conflito':
      return {
        linha: curto('alerta', '▲ Conflito'),
        extra: aviso('info', h('p', null, nome, `O valor deste campo mudou enquanto você digitava. Valor atual: «${e.atual}» (${e.hora}). Seu texto: «${e.texto}».`),
          h('div', { class: 'botoes' },
            h('button', { type: 'button', class: 'btn fant', 'data-acao': 'conflito-manter', 'data-chave': chave }, 'Manter o meu texto'),
            h('button', { type: 'button', class: 'btn fant', 'data-acao': 'conflito-usar', 'data-chave': chave }, 'Usar o valor atual'))),
      };
    case 'editando_remoto':
      return { linha: curto('alerta', '▲ Alterado'), extra: aviso('info', h('p', null, nome, `Outra pessoa alterou este campo para «${e.remoto}». O seu texto não foi apagado.`)) };
    default:
      return {
        linha: curto('alerta', '▲ Alterado'),
        extra: aviso('info',
          h('p', null, nome, e.minha
            ? `O valor que você gravou foi alterado por outra pessoa às ${e.hora}. Valor atual: «${e.atual}».`
            : `Alterado por outra pessoa às ${e.hora}. Valor anterior: «${e.anterior}».`),
          h('button', { type: 'button', class: 'btn fant', 'data-acao': 'entendi', 'data-chave': chave }, 'Entendi')),
      };
  }
}

const TEXTO_DO_ESTADO_COM_VALOR = new Set(['recusado', 'gravando', 'nao_gravado', 'conflito']);

/** Valor que o campo deve mostrar agora: o texto digitado em estados pendentes, senão o gravado. */
export function valorExibido(chave, textoGravado) {
  const e = estado.campos.get(chave);
  if (e && TEXTO_DO_ESTADO_COM_VALOR.has(e.tipo) && typeof e.texto === 'string') return e.texto;
  return textoGravado;
}

/**
 * Id do aviso (linha própria) de um campo de tabela. A tabela cria a linha `tr.aviso-linha` com este id.
 */
export function idDoAviso(chave) {
  return `f-${idSeguro(chave)}-av`;
}

/**
 * opcoes: { chave, rotulo, controle: 'texto' | 'area' | 'lista', gravado (texto), opcoesLista: [{valor, rotulo}],
 *   ajuda, pendente, bloqueio (razão), extraDescricao (id), inputmode, classe, sufixo, linhaUnica (Enter grava; área que cresce),
 *   layout: 'linha' (rótulo à esquerda) | 'celula' (célula de tabela: rótulo só para leitor de tela)
 *     | 'ficha' (rótulo acima) | 'grupo' (rótulo visível em linha, na linha de grupo),
 *   aviso: true (em tabela, o aviso de erro/conflito vai para a linha de aviso; devolve { no, aviso }),
 *   neutro (pendência sem destaque amarelo), estadoStatus (valor de data-status do select), dica (placeholder) }
 * Nos layouts compactos a ajuda só aparece com o foco no campo; continua ligada por aria-describedby.
 */
function montarCampo(o) {
  const id = `f-${idSeguro(o.chave)}`;
  const idAjuda = `${id}-aj`;
  const idEstado = `${id}-es`;
  const e = estado.campos.get(o.chave);
  const valor = valorExibido(o.chave, o.gravado);
  const idAviso = idDoAviso(o.chave);
  const comAviso = o.aviso && e && ['nao_gravado', 'conflito', 'editando_remoto', 'alterado'].includes(e.tipo);
  const descritoPor = [o.ajuda ? idAjuda : null, idEstado, comAviso ? idAviso : null, o.extraDescricao ?? null].filter(Boolean).join(' ');
  const celula = o.layout === 'celula';
  const comuns = {
    id, 'data-chave': o.chave, 'data-controlado': true, 'aria-describedby': descritoPor,
    'aria-invalid': e?.tipo === 'recusado' ? 'true' : null,
    disabled: o.bloqueio ? true : null,
  };
  const compacto = ['linha', 'celula', 'ficha', 'grupo'].includes(o.layout);
  const dica = celula && o.pendente ? 'Pendente' : o.dica;
  if (dica && o.controle !== 'lista') comuns.placeholder = dica;
  let controle;
  if (o.controle === 'area') {
    controle = h('textarea', { ...comuns, rows: compacto ? (o.linhaUnica ? 1 : 2) : 3, 'data-linha-unica': o.linhaUnica ? '1' : null }, valor);
  } else if (o.controle === 'lista') {
    const vazio = celula && o.pendente ? 'Pendente' : 'Selecione';
    controle = h('select', { ...comuns, 'data-status': o.estadoStatus ?? null },
      h('option', { value: '', selected: valor === '' }, vazio),
      ...o.opcoesLista.map((op) => h('option', { value: op.valor, selected: valor === op.valor }, op.rotulo)));
  } else {
    controle = h('input', { ...comuns, type: 'text', value: valor, inputmode: o.inputmode ?? null, autocomplete: 'off' });
  }
  const { linha, extra } = linhaDeEstado(o.chave, idEstado, o.aviso ? { rotulo: o.rotulo, idAviso } : null);
  const semRotuloVisivel = celula;
  const rotulo = h('label', { for: id, class: semRotuloVisivel ? 'sr' : null }, o.rotulo, o.sufixo ? ` (${o.sufixo})` : '', o.opcional ? ' (opcional)' : '', ' ',
    o.pendente ? seloPendente() : null, o.rotuloExtra && !celula ? [' ', o.rotuloExtra] : null);
  const classes = ['campo', compacto ? `compacto ${o.layout}` : null, compacto && o.pendente ? 'pendente' : null, o.neutro ? 'neutro' : null, o.classe].filter(Boolean).join(' ');
  const foraDoCampo = o.aviso && extra;
  const no = h('div', { class: classes, 'data-k': `c-${id}` },
    rotulo,
    controle,
    celula && o.rotuloExtra ? h('div', { class: 'extra-celula' }, o.rotuloExtra) : null,
    o.ajuda ? h('div', { class: 'ajuda', id: idAjuda }, o.ajuda) : null,
    o.bloqueio ? h('div', { class: 'ajuda bloqueio' }, o.bloqueio) : null,
    linha,
    foraDoCampo ? null : extra);
  return { no, aviso: foraDoCampo ? extra : null };
}

export function campo(o) {
  return montarCampo({ ...o, aviso: false }).no;
}

/** Campo de tabela: devolve o campo e, se houver, o aviso que a tabela põe numa linha própria. */
export function campoDeTabela(o) {
  return montarCampo({ ...o, aviso: true });
}
