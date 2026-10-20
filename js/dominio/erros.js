// Classificação dos erros do SDK em três mensagens (arquitetura, seção 4, "Erros"). Sem detalhes técnicos para o usuário.

/** Retorna 'recusado' | 'sem_conexao' | 'limite' | 'desconhecido'. */
export function classificarErro(erro) {
  const codigo = String(erro?.code ?? '').replace(/^firestore\//, '');
  if (codigo === 'permission-denied') return 'recusado';
  if (codigo === 'resource-exhausted') return 'limite';
  if (['unavailable', 'deadline-exceeded', 'cancelled', 'network-request-failed'].includes(codigo)) return 'sem_conexao';
  return 'desconhecido';
}

/** Hora aproximada de renovação da cota: meia-noite do Pacífico (cerca de 04h-05h em Brasília). */
export const HORARIO_RENOVACAO_COTA = '04h–05h (horário de Brasília)';

export function mensagemDeErro(tipo) {
  switch (tipo) {
    case 'recusado':
      return 'O serviço recusou a alteração. O valor pode ser inválido, ou o painel pode estar temporariamente em modo somente leitura.';
    case 'sem_conexao':
      return 'Sem conexão com o serviço. Seu texto continua aqui e ainda não foi gravado.';
    case 'limite':
      return `O limite diário do serviço foi atingido. Tente de novo depois das ${HORARIO_RENOVACAO_COTA}.`;
    default:
      return 'Não foi possível gravar. Seu texto continua aqui.';
  }
}
