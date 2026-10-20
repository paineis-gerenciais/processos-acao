// Política de conflito por campo (arquitetura, seção 5). Funções puras sobre textos exibidos.

/**
 * Decisão ao sair do campo.
 * base = valor ao focar; atual = valor remoto mais recente; digitado = texto do usuário.
 * Retorna 'nada' | 'gravar' | 'perguntar'.
 */
export function decidirSaida({ base, atual, digitado }) {
  if (digitado === atual) return 'nada';
  if (digitado === base) return 'nada';
  if (atual === base) return 'gravar';
  return 'perguntar';
}

/**
 * Como reagir a uma atualização remota deste campo.
 * 'ignorar' (nada mudou ou foi eco da própria gravação), 'atualizar' (campo parado, só mostra o novo valor),
 * 'aviso_durante_edicao' (o usuário está digitando: não sobrescrever), 'alterado_por_outra_pessoa'.
 */
export function reagirAtualizacaoRemota({ anterior, atual, emEdicao, ehEcoMeu }) {
  if (anterior === atual) return 'ignorar';
  if (ehEcoMeu) return 'ignorar';
  if (emEdicao) return 'aviso_durante_edicao';
  return 'alterado_por_outra_pessoa';
}
