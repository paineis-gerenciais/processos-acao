// Ponto de entrada. Carrega a camada de dados (única que importa o Firebase) e inicia a interface.
// Se o SDK ou a configuração não carregarem, mostra erro em português em vez de uma página em branco.
import { h } from './ui/dom.js';
import { configurarMenu } from './ui/menu.js';

configurarMenu();

async function iniciar() {
  try {
    const dados = await import('./dados/firestore.js');
    const info = dados.iniciar();
    const { iniciarApp } = await import('./ui/app.js');
    iniciarApp(dados, info);
  } catch (erro) {
    const local = erro?.name === 'ErroAmbienteLocal';
    const tela = document.getElementById('tela');
    tela.append(h('div', { class: 'faixa erro bloco-erro', role: 'alert' },
      h('div', null,
        h('h2', null, local ? 'Ambiente local sem emulador' : 'Não foi possível carregar o painel'),
        h('p', null, local
          ? 'Para proteger os dados reais, o painel não se conecta ao serviço de produção a partir desta máquina. Abra com ?emulador=127.0.0.1:8080 para usar o emulador do Firestore (dados fictícios).'
          : 'Verifique a conexão e recarregue a página.'),
        local ? null : h('button', { type: 'button', class: 'btn prim', id: 'recarregar-pagina' }, 'Recarregar a página'))));
    document.getElementById('recarregar-pagina')?.addEventListener('click', () => window.location.reload());
  }
}

iniciar();
