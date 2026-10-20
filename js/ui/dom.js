// Construção de DOM sem interpretar marcação: só createElement, textContent e setAttribute em atributos não executáveis.
// Requisito A2 do parecer de segurança. Todo dado do usuário entra por texto.
const NS_SVG = 'http://www.w3.org/2000/svg';
const URL_PERMITIDA = /^(#|img\/|logo-(esquerda|direita)\.png$|https:\/\/paineis-gerenciais\.github\.io\/processos\/)/;
const ATRIBUTO_PROIBIDO = /^(on|style$|srcDoc$|formaction$|xlink:href$)/i;

function aplicar(el, nome, valor) {
  if (valor === false || valor === null || valor === undefined) return;
  if (ATRIBUTO_PROIBIDO.test(nome)) throw new Error(`atributo não permitido: ${nome}`);
  if ((nome === 'href' || nome === 'src') && !URL_PERMITIDA.test(String(valor))) throw new Error(`destino não permitido: ${nome}`);
  el.setAttribute(nome, valor === true ? '' : String(valor));
}

function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(typeof f === 'object' ? f : document.createTextNode(String(f)));
  }
}

/** h('div', { class: 'x', 'data-id': id }, 'texto', filho, ...) */
export function h(tag, atributos, ...filhos) {
  const el = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos ?? {})) aplicar(el, nome, valor);
  anexar(el, filhos);
  return el;
}

export function svg(tag, atributos, ...filhos) {
  const el = document.createElementNS(NS_SVG, tag);
  for (const [nome, valor] of Object.entries(atributos ?? {})) aplicar(el, nome, valor);
  anexar(el, filhos);
  return el;
}

/** Esvazia um elemento. */
export function limpar(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Plural simples em pt-BR. */
export function plural(n, singular, pluralTexto) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/** Texto para ids: só [A-Za-z0-9_-]. */
export function idSeguro(texto) {
  return String(texto).replace(/[^A-Za-z0-9_-]/g, '_');
}
