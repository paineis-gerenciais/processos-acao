// Atualização incremental do DOM: aplica uma árvore nova sobre a existente sem recriar o que não mudou.
// Preserva foco, seleção e o texto que a pessoa está digitando. Os eventos usam delegação (acoes.js),
// então nenhum ouvinte se perde. Elementos com data-k são casados pela chave; os demais, pela posição.

function chaveDe(no) {
  return no.nodeType === 1 ? no.getAttribute('data-k') : null;
}

function mesmoTipo(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType === 3) return true;
  return a.nodeName === b.nodeName && chaveDe(a) === chaveDe(b);
}

function sincronizarAtributos(vivo, novo) {
  for (const a of [...vivo.attributes]) {
    if (a.name.startsWith('data-local-')) continue; // estado local do navegador (ex.: valor ao focar)
    if (!novo.hasAttribute(a.name)) vivo.removeAttribute(a.name);
  }
  for (const a of novo.attributes) {
    if (vivo.getAttribute(a.name) !== a.value) vivo.setAttribute(a.name, a.value);
  }
}

function sincronizarPropriedades(vivo, novo) {
  if (!novo.hasAttribute('data-controlado')) return;
  const ativo = document.activeElement === vivo;
  if (vivo.tagName === 'INPUT' && (vivo.type === 'radio' || vivo.type === 'checkbox')) {
    if (vivo.checked !== novo.hasAttribute('checked')) vivo.checked = novo.hasAttribute('checked');
    return;
  }
  if (ativo) return;
  if (vivo.tagName === 'SELECT') {
    const alvo = [...novo.options].find((o) => o.hasAttribute('selected'));
    const valor = alvo ? alvo.value : '';
    if (vivo.value !== valor) vivo.value = valor;
    return;
  }
  if (vivo.tagName === 'INPUT' || vivo.tagName === 'TEXTAREA') {
    const valor = novo.tagName === 'TEXTAREA' ? novo.textContent : (novo.getAttribute('value') ?? '');
    if (vivo.value !== valor) vivo.value = valor;
  }
}

function sincronizarNo(vivo, novo) {
  if (vivo.nodeType === 3) {
    if (vivo.nodeValue !== novo.nodeValue) vivo.nodeValue = novo.nodeValue;
    return;
  }
  sincronizarAtributos(vivo, novo);
  if (vivo.tagName === 'TEXTAREA') {
    sincronizarPropriedades(vivo, novo);
    return;
  }
  if (vivo.tagName === 'SELECT') {
    sincronizarFilhos(vivo, novo);
    sincronizarPropriedades(vivo, novo);
    return;
  }
  sincronizarFilhos(vivo, novo);
  sincronizarPropriedades(vivo, novo);
}

function sincronizarFilhos(vivo, novo) {
  const novos = [...novo.childNodes];
  const porChave = new Map();
  for (const f of vivo.childNodes) {
    const k = chaveDe(f);
    if (k) porChave.set(k, f);
  }
  let i = 0;
  for (const n of novos) {
    const k = chaveDe(n);
    let atual = vivo.childNodes[i] ?? null;
    if (k && porChave.has(k)) {
      const existente = porChave.get(k);
      if (existente !== atual) vivo.insertBefore(existente, atual);
      atual = existente;
      if (mesmoTipo(atual, n)) sincronizarNo(atual, n);
      else vivo.replaceChild(n, atual);
    } else if (atual && !chaveDe(atual) && mesmoTipo(atual, n)) {
      sincronizarNo(atual, n);
    } else {
      vivo.insertBefore(n, atual);
    }
    i += 1;
  }
  while (vivo.childNodes.length > novos.length) vivo.removeChild(vivo.lastChild);
}

/** Faz `raiz` ficar igual a `arvore`. Ambos são elementos do mesmo tipo. */
export function reconciliar(raiz, arvore) {
  sincronizarFilhos(raiz, arvore);
}
