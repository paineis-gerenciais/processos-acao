// Tela Instruções (RF-09): somente leitura. Conteúdo transcrito da planilha e reescrito (PRD, P3); a conferir pelo cliente.
import { h } from './dom.js';
import { PRAZO_DESFAZER_DIAS } from '../dominio/lixeira.js';

const SECOES = [
  ['usar-painel', 'Como usar este painel'],
  ['melhorou', 'Como saber se o processo melhorou'],
  ['bom-indicador', 'O que faz um bom indicador'],
  ['ficha', 'Como preencher a ficha do indicador'],
  ['depois', 'O que acontece depois'],
];

const lista = (...itens) => h('ul', null, ...itens.map((i) => h('li', null, i)));
const secao = (id, titulo, ...filhos) => h('section', { class: 'instrucao', id: `inst-${id}`, 'aria-labelledby': `inst-t-${id}` },
  h('h2', { id: `inst-t-${id}`, tabindex: '-1' }, titulo), ...filhos);

export function telaInstrucoes() {
  return h('div', { class: 'leitura', 'data-k': 'instrucoes' },
    h('nav', { 'aria-label': 'Nesta página', class: 'nesta-pagina' },
      h('p', { class: 'rot' }, 'Nesta página'),
      h('ul', null, ...SECOES.map(([id, titulo]) => h('li', null, h('a', { href: `#/instrucoes/${id}` }, titulo))))),

    secao('usar-painel', 'Como usar este painel',
      h('div', { class: 'aviso-campo alerta', role: 'note' },
        h('p', null, h('strong', null, 'Atenção. '), 'Qualquer pessoa com o link pode ver, alterar e excluir os dados. Não compartilhe o link fora da equipe e não digite dados de cidadãos ou de terceiros nos campos de texto.')),
      h('h3', null, 'Editar'),
      h('p', null, 'Clique no campo, digite e saia do campo (tecla Tab ou clique fora). O painel grava sozinho. Em campos de lista, como Status e Polaridade, a gravação acontece ao escolher a opção. Se o valor não mudou, nada é gravado.'),
      h('p', null, 'Datas usam dia/mês/ano (31/12/2026). Números usam vírgula nos decimais (12,5), sem ponto de milhar, sem % e sem R$. Campos de responsável aceitam nome ou função.'),
      h('h3', null, 'O que aparece ao lado do campo'),
      lista(
        'Gravando: o painel está enviando a alteração.',
        'Gravado: a alteração foi aceita. A data da última alteração do card também muda.',
        'Não gravado: houve falha. O seu texto continua no campo; use o botão Tentar de novo.',
        'Sem conexão: você perdeu a internet. O que você digitar pode não ser gravado. Não feche a aba até aparecer o aviso de que todas as alterações foram gravadas.',
        'O valor mudou: outra pessoa alterou o mesmo campo. O painel nunca apaga o que você digitou e pergunta se você quer manter o seu texto ou usar o valor atual.'),
      h('h3', null, 'Adicionar'),
      h('p', null, 'Use Adicionar processo, no alto das telas Plano e Indicadores: o processo aparece nas duas telas. Dentro do card, use Adicionar melhoria de origem, Adicionar ação e Adicionar indicador. Medições são registradas no formulário Registrar medição, abaixo da tabela do indicador.'),
      h('h3', null, 'Excluir e desfazer'),
      h('p', null, `Toda exclusão pede confirmação e informa quantos itens serão apagados. Para excluir um processo é preciso digitar o nome dele. Depois de excluir, use Desfazer na barra que aparece embaixo ou o botão Excluídos recentes. É possível restaurar por ${PRAZO_DESFAZER_DIAS} dias; depois disso o item é apagado de vez.`),
      h('h3', null, 'Data da última alteração'),
      h('p', null, 'Cada card mostra quando o plano (ou os indicadores) foi alterado pela última vez. Abrir e fechar o card não altera nenhum dado. O painel não registra quem alterou.'),
      h('h3', null, 'Imprimir'),
      h('p', null, 'Dentro de um card aberto, o botão Imprimir mostra uma folha com o cabeçalho, a data e a hora. Use Imprimir ou salvar em PDF para a ata do encontro. Em computador compartilhado, não deixe o PDF salvo no equipamento.'),
      h('h3', null, 'Outros painéis'),
      h('p', null, 'O item Painel de processos, no menu, abre o painel dos processos em outra aba. Este painel continua aberto.')),

    secao('melhorou', 'Como saber se o processo melhorou',
      h('p', null, 'Escolha o que medir: tempo, retrabalho, volume ou conformidade. Procure um dado que já exista nos sistemas ou nos registros do dia a dia.'),
      h('p', null, h('strong', null, 'Registre o valor de hoje para cada indicador escolhido. '), 'Sem a linha de base, o indicador mede apenas o presente e não demonstra ganho nenhum.'),
      h('p', null, 'Depois, a cada período (mês, bimestre ou trimestre), registre a medição. O painel compara a última medição com a linha de base e com a meta.')),

    secao('bom-indicador', 'O que faz um bom indicador',
      h('ol', null,
        h('li', null, 'Mede o resultado, não o esforço.'),
        h('li', null, 'Tem fórmula escrita.'),
        h('li', null, 'Usa dado que já existe.'),
        h('li', null, 'Tem uma pessoa responsável pela medição.'),
        h('li', null, 'Tem polaridade (maior é melhor ou menor é melhor) e linha de base.'))),

    secao('ficha', 'Como preencher a ficha do indicador',
      h('dl', { class: 'definicoes' },
        h('dt', null, 'Nome do indicador'), h('dd', null, 'Diga o que é medido, por exemplo, % de solicitações atendidas.'),
        h('dt', null, 'Fórmula'), h('dd', null, 'Escreva como o valor é calculado. É um texto livre: o painel não faz a conta da fórmula.'),
        h('dt', null, 'O que mede'), h('dd', null, 'Em uma frase, a pergunta que o indicador responde.'),
        h('dt', null, 'Responsável pela medição'), h('dd', null, 'Nome ou função de quem apura o valor em cada período.'),
        h('dt', null, 'Fonte'), h('dd', null, 'De onde sai o dado (sistema, planilha, registro).'),
        h('dt', null, 'Polaridade'), h('dd', null, 'Maior é melhor (o resultado sobe quando o processo melhora) ou menor é melhor (o resultado cai quando o processo melhora).'),
        h('dt', null, 'Frequência'), h('dd', null, 'Mensal costuma bastar; trimestral é o limite. O painel oferece Mensal, Bimestral e Trimestral.'),
        h('dt', null, 'Unidade'), h('dd', null, 'Em % o painel calcula o valor a partir de numerador ÷ denominador × 100, com arredondamento para cima na segunda casa. Em contagem, dias e reais, o valor é digitado.'),
        h('dt', null, 'Linha de base'), h('dd', null, 'O valor de hoje. Registre a referência: o último dia coberto por esse valor.'),
        h('dt', null, 'Meta'), h('dd', null, 'O valor que se quer alcançar. O prazo da meta é opcional e só informativo.')),
      h('p', null, 'Campo vazio aparece como Pendente, nunca como zero. Zero é um valor medido.')),

    secao('depois', 'O que acontece depois',
      h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Quando'), h('th', { scope: 'col' }, 'O que fazer'), h('th', { scope: 'col' }, 'Quem'))),
        h('tbody', null,
          ...[
            ['Em até 3 dias', 'Confirmar os nomes em aberto no plano.', 'Embaixador'],
            ['Em até 7 dias', 'Registrar os valores de hoje dos indicadores (linha de base).', 'Participante indicado'],
            ['Depois disso', 'Primeira reunião de acompanhamento.', 'Embaixador'],
            ['Em até 20 dias', 'Apresentação à gestão.', 'Grupo do órgão'],
            ['Todo mês', 'Encontro de acompanhamento, com plano atualizado e ata.', 'Embaixador e grupo'],
            ['Até a primeira mentoria', 'Escolher o próximo processo a redesenhar.', 'Dono do processo'],
          ].map(([a, b, c]) => h('tr', null, h('td', { 'data-r': 'Quando' }, a), h('td', { 'data-r': 'O que fazer' }, b), h('td', { 'data-r': 'Quem' }, c)))))),

    h('p', { class: 'ajuda' }, 'Texto sujeito a conferência pelo cliente.'));
}
